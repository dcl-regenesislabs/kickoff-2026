import {
  engine, GltfContainer, Transform, PlayerIdentityData,
  MeshRenderer, Material, Billboard, BillboardMode,
  inputSystem, InputAction, ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { room } from '../schedule/prodeNet'
import { getPlayer } from '@dcl/sdk/players'
import { clampBallToSafeArea } from '../src/ballSafeArea'
import { resolveGoalCollision } from '../src/goalCollision'

const BALL_SRC             = 'assets/scene/Models/ball.glb'
const TARGET_SRC           = 'assets/scene/Models/target_position.glb'
const BALL_START           = Vector3.create(30, 0.28, 48)
const BALL_SCALE           = Vector3.create(0.51, 0.51, 0.51)
const BALL_RADIUS          = 0.28
const BALL_FRONT           = 1.82
const BALL_FRONT_MAX       = 2.2
const OWNED_BALL_Y         = 0.34
const KICK_START_PUSH      = 1.5
const PREDICT_TAKE_RADIUS  = 1.65
const PREDICT_TAKE_TIMEOUT_MS = 500
const KICK_RETAKE_COOLDOWN_MS = 700
const KICK_STALE_OWNED_MS  = 500   // ignore stale "you own it" messages after a kick
const FRICTION             = 0.55
const MIN_SPEED            = 0.05
const GRAVITY              = 9.8
const MAX_CHARGE_MS        = 2000
const MIN_KICK_POWER       = 5
const MAX_KICK_POWER       = 25
const MIN_KICK_LOFT        = 2.2
const MAX_KICK_LOFT        = 9.5

// ── Estado ────────────────────────────────────────────────────────────────────
type ClientState = { mode: 'free' } | { mode: 'owned'; ownerId: string }
let clientState: ClientState = { mode: 'free' }
let prevMode: 'free' | 'owned' = 'free'

const localPos = { x: BALL_START.x, y: BALL_START.y, z: BALL_START.z }
const localVel = { x: 0, z: 0 }
let localVelY  = 0
let ballRotation = Quaternion.Identity()
let charging   = false
let chargeStart = 0

// Movimiento del dribble
let prevPlayerX = -9999
let prevPlayerZ = -9999
let moveDirX    = 0
let moveDirZ    = 1
let dribbleX    = BALL_START.x
let dribbleZ    = BALL_START.z
let remotePrevOwnerId = ''
let remotePrevX = 0
let remotePrevZ = 0
let remoteMoveDirX = 0
let remoteMoveDirZ = 1

let myAddress          = ''
let optimisticKickAt   = 0
let localIsOwner       = false
let predictedTakeUntil = 0
let mobileKickPressed  = false
// Point B: where the server says the ball will land after this kick
let kickLandTarget: { x: number; z: number } | null = null

let ballEntity: ReturnType<typeof engine.addEntity> | null = null

function getPlayerForward(playerT: { rotation: { x: number; y: number; z: number; w: number } }) {
  const q = playerT.rotation
  let dirX = 2 * (q.x * q.z + q.w * q.y)
  let dirZ = 1 - 2 * (q.x * q.x + q.y * q.y)
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ)
  if (len < 0.0001) return { x: 0, z: 1 }
  dirX /= len
  dirZ /= len
  return { x: dirX, z: dirZ }
}

function getOwnedBallAnchor(playerT: { position: { x: number; z: number }, rotation: { x: number; y: number; z: number; w: number } }) {
  const forward = getPlayerForward(playerT)
  return clampBallToSafeArea(
    playerT.position.x + forward.x * BALL_FRONT,
    playerT.position.z + forward.z * BALL_FRONT
  )
}

function snapDribbleToLocalPlayer() {
  const myT = Transform.getOrNull(engine.PlayerEntity)
  if (!myT) return

  const forward = getPlayerForward(myT)
  moveDirX = forward.x
  moveDirZ = forward.z
  prevPlayerX = myT.position.x
  prevPlayerZ = myT.position.z

  const anchored = getOwnedBallAnchor(myT)

  dribbleX = anchored.x
  dribbleZ = anchored.z
  localPos.x = anchored.x
  localPos.y = OWNED_BALL_Y
  localPos.z = anchored.z
  localVel.x = 0
  localVel.z = 0
  localVelY = 0
}

function dist2d(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx
  const dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

function getKickLift(power: number) {
  const normalizedPower = Math.max(0, Math.min(1, (power - MIN_KICK_POWER) / (MAX_KICK_POWER - MIN_KICK_POWER)))
  return MIN_KICK_LOFT + (MAX_KICK_LOFT - MIN_KICK_LOFT) * normalizedPower * normalizedPower
}

function setBallCollisionEnabled(enabled: boolean) {
  if (!ballEntity) return
  GltfContainer.createOrReplace(ballEntity, {
    src: BALL_SRC,
    visibleMeshesCollisionMask: enabled ? ColliderLayer.CL_PHYSICS : ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: enabled ? ColliderLayer.CL_PHYSICS : ColliderLayer.CL_NONE
  })
}

function predictLocalTake() {
  if (!myAddress || clientState.mode !== 'free') return
  predictedTakeUntil = Date.now() + PREDICT_TAKE_TIMEOUT_MS
  clientState = { mode: 'owned', ownerId: myAddress }
  localIsOwner = true
  setBallCollisionEnabled(false)
  snapDribbleToLocalPlayer()
}

export function setMobileKickPressed(pressed: boolean) {
  mobileKickPressed = pressed
}

export function getMobileKickButtonState() {
  const visible = localIsOwner && predictedTakeUntil === 0
  return {
    visible,
    pressed: visible && mobileKickPressed
  }
}

export function getKickHintVisible(): boolean {
  return localIsOwner && predictedTakeUntil === 0
}

function releaseOptimistic(power: number, kx: number, kz: number) {
  if (!ballEntity) return
  optimisticKickAt   = Date.now()
  kickLandTarget     = null   // server will send Point B shortly via kickLand
  predictedTakeUntil = 0
  mobileKickPressed  = false
  // Use the real anchor (same calc as server) as starting point — avoids lateral blip
  const myT = Transform.getOrNull(engine.PlayerEntity)
  const startPos = myT ? getOwnedBallAnchor(myT) : { x: dribbleX, z: dribbleZ }
  const kickClamp = clampBallToSafeArea(
    startPos.x + kx * KICK_START_PUSH,
    startPos.z + kz * KICK_START_PUSH
  )
  localPos.x = kickClamp.x
  localPos.y = BALL_RADIUS
  localPos.z = kickClamp.z
  localVel.x = kx * power
  localVel.z = kz * power
  localVelY  = getKickLift(power)
  clientState  = { mode: 'free' }
  prevMode     = 'free'
  localIsOwner = false
  setBallCollisionEnabled(true)
}

// ── Setup ─────────────────────────────────────────────────────────────────────
export function setupBallClient() {

  const ball = engine.addEntity()
  ballEntity = ball
  Transform.create(ball, {
    position: Vector3.clone(BALL_START),
    rotation: Quaternion.Identity(),
    scale:    Vector3.clone(BALL_SCALE)
  })
  GltfContainer.create(ball, {
    src: BALL_SRC,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })

  const target = engine.addEntity()
  Transform.create(target, { position: Vector3.clone(BALL_START), scale: Vector3.Zero() })
  MeshRenderer.setCylinder(target, 1, 1)
  Material.setPbrMaterial(target, {
    albedoColor:       Color4.create(0, 0.9, 1, 0.85),
    emissiveColor:     Color3.create(0, 0.9, 1),
    emissiveIntensity: 3
  })

  const chargeFill = engine.addEntity()
  Transform.create(chargeFill, { position: Vector3.clone(BALL_START), scale: Vector3.Zero() })
  MeshRenderer.setBox(chargeFill)
  Material.setPbrMaterial(chargeFill, { albedoColor: Color4.Yellow() })
  Billboard.create(chargeFill, { billboardMode: BillboardMode.BM_Y })

  // ── Mensajes del server ───────────────────────────────────────────────────
  room.onMessage('ballOwned', (data) => {
    if (!myAddress) {
      const addr = (PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? getPlayer()?.userId ?? '').toLowerCase()
      if (addr) myAddress = addr
    }

    // Discard stale "you own the ball" messages that arrive after we already kicked
    if (
      optimisticKickAt > 0 &&
      Date.now() - optimisticKickAt < KICK_STALE_OWNED_MS &&
      myAddress && data.ownerId && data.ownerId.toLowerCase() === myAddress
    ) return

    const prevOwnerId = clientState.mode === 'owned' ? clientState.ownerId.toLowerCase() : ''
    const prevWasLocalOwner = localIsOwner
    const newMode: 'free' | 'owned' = data.ownerId === '' ? 'free' : 'owned'
    clientState = data.ownerId === ''
      ? { mode: 'free' }
      : { mode: 'owned', ownerId: data.ownerId }

    localIsOwner = newMode === 'owned' && !!myAddress && data.ownerId.toLowerCase() === myAddress
    const ownerChanged = prevOwnerId !== data.ownerId.toLowerCase()
    predictedTakeUntil = 0

    if (localIsOwner && (ownerChanged || !prevWasLocalOwner)) {
      snapDribbleToLocalPlayer()
    }

    if (newMode !== prevMode) {
      prevMode = newMode
      if (newMode === 'owned') {
        setBallCollisionEnabled(false)
        if (!localIsOwner) {
          prevPlayerX = -9999
          prevPlayerZ = -9999
        }
      } else {
        setBallCollisionEnabled(true)
        charging     = false
        localIsOwner = false
      }
    }

    if (!localIsOwner) {
      charging = false
      mobileKickPressed = false
    }
  })

  // Server sends Point B (where the ball will land) right after processing the kick.
  // The client runs local physics for the full trajectory and snaps to this position
  // when the ball stops — so it always lands exactly where the server computed.
  room.onMessage('kickLand', (data: { x: number; z: number }) => {
    kickLandTarget = data
  })

  room.onMessage('ballState', (data) => {
    if (clientState.mode !== 'free') return
    // While ball is in flight after a kick, trust local physics entirely.
    // The server-authoritative landing position arrives via kickLand instead.
    if (optimisticKickAt > 0) return
    localPos.x = data.x; localPos.y = data.y; localPos.z = data.z
    localVel.x = data.vx; localVel.z = data.vz
    localVelY  = data.vy
  })

  // ── Sistema de render ─────────────────────────────────────────────────────
  engine.addSystem((dt) => {
    const ballT   = Transform.getMutableOrNull(ball)
    const targetT = Transform.getMutableOrNull(target)
    const fillT   = Transform.getMutableOrNull(chargeFill)
    if (!ballT || !targetT || !fillT) return

    if (
      predictedTakeUntil > 0 &&
      Date.now() > predictedTakeUntil &&
      clientState.mode === 'owned' &&
      localIsOwner
    ) {
      predictedTakeUntil = 0
      clientState = { mode: 'free' }
      localIsOwner = false
      mobileKickPressed = false
      setBallCollisionEnabled(true)
    }

    // Cachear address del player local; actualizar localIsOwner lazy si llegó tarde
    if (!myAddress) {
      const id = PlayerIdentityData.getOrNull(engine.PlayerEntity)
      if (id?.address) {
        myAddress = id.address.toLowerCase()
      } else {
        const uid = getPlayer()?.userId
        if (uid) myAddress = uid.toLowerCase()
      }
      if (myAddress && clientState.mode === 'owned') {
        localIsOwner = (clientState as { mode: 'owned'; ownerId: string }).ownerId.toLowerCase() === myAddress
        if (localIsOwner) snapDribbleToLocalPlayer()
      }
    }

    let iAmOwner = localIsOwner

    // ── Posición de la pelota ─────────────────────────────────────────────
    if (clientState.mode === 'free') {
      const prevPos = { x: localPos.x, y: localPos.y, z: localPos.z }

      // Gravedad
      localVelY  -= GRAVITY * dt
      localPos.y += localVelY * dt
      if (localPos.y <= BALL_RADIUS) {
        localPos.y = BALL_RADIUS
        localVelY  = localVelY < -0.8 ? -localVelY * 0.4 : 0
      }

      // Fricción horizontal
      const ff    = Math.pow(FRICTION, dt)
      localVel.x *= ff
      localVel.z *= ff
      const speed = Math.sqrt(localVel.x ** 2 + localVel.z ** 2)
      if (speed < MIN_SPEED && localPos.y <= BALL_RADIUS + 0.01) {
        localVel.x = 0; localVel.z = 0
        // Snap to server's authoritative landing position (Point B)
        if (kickLandTarget) {
          localPos.x = kickLandTarget.x
          localPos.z = kickLandTarget.z
          kickLandTarget   = null
          optimisticKickAt = 0
        }
      } else {
        localPos.x += localVel.x * dt
        localPos.z += localVel.z * dt
      }

      const freeClamp = clampBallToSafeArea(localPos.x, localPos.z)
      if (freeClamp.wasClamped) {
        localPos.x = freeClamp.x
        localPos.z = freeClamp.z
        localVel.x = 0
        localVel.z = 0
      } else {
        localPos.x = freeClamp.x
        localPos.z = freeClamp.z
      }

      const goalCollision = resolveGoalCollision(
        { x: localPos.x, y: localPos.y, z: localPos.z },
        prevPos,
        { x: localVel.x, y: localVelY, z: localVel.z },
        BALL_RADIUS
      )
      localPos.x = goalCollision.position.x
      localPos.y = goalCollision.position.y
      localPos.z = goalCollision.position.z
      localVel.x = goalCollision.velocity.x
      localVelY = goalCollision.velocity.y
      localVel.z = goalCollision.velocity.z

      if (speed > MIN_SPEED) {
        const rollAxis  = Vector3.normalize(Vector3.create(localVel.z, 0, -localVel.x))
        const rollAngle = (speed / BALL_RADIUS) * dt * (180 / Math.PI)
        ballRotation    = Quaternion.multiply(Quaternion.fromAngleAxis(rollAngle, rollAxis), ballRotation)
        ballT.rotation  = ballRotation
      }

      ballT.position.x = localPos.x
      ballT.position.y = localPos.y
      ballT.position.z = localPos.z

      const myT = Transform.getOrNull(engine.PlayerEntity)
      if (
        myT &&
        myAddress &&
        Date.now() - optimisticKickAt > KICK_RETAKE_COOLDOWN_MS &&
        localPos.y <= BALL_RADIUS + 0.08 &&
        dist2d(myT.position.x, myT.position.z, localPos.x, localPos.z) <= PREDICT_TAKE_RADIUS
      ) {
        predictLocalTake()
        iAmOwner = localIsOwner
        ballT.position.x = dribbleX
        ballT.position.y = OWNED_BALL_Y
        ballT.position.z = dribbleZ
      }

    } else if (iAmOwner) {
      // Dribbling local — seguir en la dirección de movimiento
      const myT = Transform.getOrNull(engine.PlayerEntity)
      if (myT) {
        const px = myT.position.x
        const pz = myT.position.z

        let moveSpeed = 0
        if (prevPlayerX > -9000) {
          const dmx = px - prevPlayerX
          const dmz = pz - prevPlayerZ
          const d2  = dmx * dmx + dmz * dmz
          moveSpeed  = Math.sqrt(d2) / dt
          if (d2 > 0.003 * 0.003) {
            const len = Math.sqrt(d2)
            moveDirX = dmx / len
            moveDirZ = dmz / len
          }
        }
        prevPlayerX = px
        prevPlayerZ = pz

        const ownedAnchor = getOwnedBallAnchor(myT)
        const targetX  = ownedAnchor.x
        const targetZ  = ownedAnchor.z

        const lerp = Math.min(1, 12 * dt)
        dribbleX += (targetX - dribbleX) * lerp
        dribbleZ += (targetZ - dribbleZ) * lerp

        const ownedClamp = clampBallToSafeArea(dribbleX, dribbleZ)
        dribbleX = ownedClamp.x
        dribbleZ = ownedClamp.z

        ballT.position.x = dribbleX
        ballT.position.y = OWNED_BALL_Y
        ballT.position.z = dribbleZ

        if (moveSpeed > 0.1) {
          const rollAxis  = Vector3.normalize(Vector3.create(moveDirZ, 0, -moveDirX))
          const rollAngle = (moveSpeed / BALL_RADIUS) * dt * (180 / Math.PI)
          ballRotation    = Quaternion.multiply(Quaternion.fromAngleAxis(rollAngle, rollAxis), ballRotation)
          ballT.rotation  = ballRotation
        }
      }

    } else {
      // Otro player tiene la pelota
      const state = clientState as { mode: 'owned'; ownerId: string }
      for (const [_e, identity, playerT] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
        if (identity.address.toLowerCase() !== state.ownerId.toLowerCase()) continue
        const anchor = getOwnedBallAnchor(playerT)
        let remoteSpeed = 0
        if (remotePrevOwnerId !== state.ownerId.toLowerCase()) {
          remotePrevOwnerId = state.ownerId.toLowerCase()
          remotePrevX = anchor.x
          remotePrevZ = anchor.z
          remoteMoveDirX = 0
          remoteMoveDirZ = 1
        } else {
          const dmx = anchor.x - remotePrevX
          const dmz = anchor.z - remotePrevZ
          const d2 = dmx * dmx + dmz * dmz
          remoteSpeed = d2 > 0 ? Math.sqrt(d2) / dt : 0
          if (d2 > 0.003 * 0.003) {
            const len = Math.sqrt(d2)
            remoteMoveDirX = dmx / len
            remoteMoveDirZ = dmz / len
          }
          remotePrevX = anchor.x
          remotePrevZ = anchor.z
        }

        ballT.position.x = anchor.x
        ballT.position.y = OWNED_BALL_Y
        ballT.position.z = anchor.z

        if (remoteSpeed > 0.1) {
          const rollAxis  = Vector3.normalize(Vector3.create(remoteMoveDirZ, 0, -remoteMoveDirX))
          const rollAngle = (remoteSpeed / BALL_RADIUS) * dt * (180 / Math.PI)
          ballRotation    = Quaternion.multiply(Quaternion.fromAngleAxis(rollAngle, rollAxis), ballRotation)
          ballT.rotation  = ballRotation
        }
        break
      }
    }

    // ── Target ────────────────────────────────────────────────────────────
    if (iAmOwner) {
      targetT.position = { x: ballT.position.x, y: 0.05, z: ballT.position.z }
      targetT.scale    = Vector3.create(1.2, 0.04, 1.2)
    } else {
      targetT.scale = Vector3.Zero()
    }

    // ── Charge bar + kick ─────────────────────────────────────────────────
    if (iAmOwner && predictedTakeUntil === 0) {
      const isHolding = inputSystem.isPressed(InputAction.IA_PRIMARY) || mobileKickPressed
      const myT = Transform.getOrNull(engine.PlayerEntity)

      if (isHolding && !charging) {
        charging    = true
        chargeStart = Date.now()
      }

      if (charging) {
        const chargeValue = Math.min(1, (Date.now() - chargeStart) / MAX_CHARGE_MS)
        const BAR_W = 1.2, BAR_H = 0.12, BAR_D = 0.05

        const fillW    = Math.max(0.01, BAR_W * chargeValue)
        fillT.position = myT
          ? { x: myT.position.x, y: myT.position.y + 2.2, z: myT.position.z }
          : { x: ballT.position.x, y: ballT.position.y + 2.2, z: ballT.position.z }
        fillT.scale = { x: fillW, y: BAR_H, z: BAR_D }

        Material.setPbrMaterial(chargeFill, {
          albedoColor: Color4.create(chargeValue, 1 - chargeValue, 0, 1)
        })

        if (!isHolding) {
          const power = MIN_KICK_POWER + chargeValue * (MAX_KICK_POWER - MIN_KICK_POWER)

          let kx = moveDirX
          let kz = moveDirZ
          if (kx === 0 && kz === 0) {
            const myT = Transform.getOrNull(engine.PlayerEntity)
            if (myT) {
              const q = myT.rotation
              kx = 2 * (q.x * q.z + q.w * q.y)
              kz = 1 - 2 * (q.x * q.x + q.y * q.y)
            } else {
              kz = 1
            }
          }

          room.send('kickBall', { dirX: kx, dirZ: kz, power })
          releaseOptimistic(power, kx, kz)

          charging    = false
          fillT.scale = Vector3.Zero()
        }
      }

    } else {
      if (charging) {
        charging    = false
        mobileKickPressed = false
        fillT.scale = Vector3.Zero()
      }
    }

  }, undefined, 'ball-render')
}
