import {
  engine, GltfContainer, Transform, PlayerIdentityData,
  MeshRenderer, Material, Billboard, BillboardMode,
  inputSystem, InputAction, ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { room } from '../schedule/prodeNet'
import { getPlayer } from '@dcl/sdk/players'

const BALL_SRC       = 'assets/scene/Models/ball.glb'
const TARGET_SRC     = 'assets/scene/Models/target_position.glb'
const BALL_START     = Vector3.create(30, 0.3, 48)
const BALL_SCALE     = Vector3.create(0.6, 0.6, 0.6)
const BALL_RADIUS    = 0.3
const BALL_FRONT     = 1.2
const BALL_FRONT_MAX = 2.2
const FRICTION       = 0.55
const MIN_SPEED      = 0.05
const GRAVITY        = 9.8
const KICK_VY        = 0.28
const MAX_CHARGE_MS  = 2000
const MIN_KICK_POWER = 5
const MAX_KICK_POWER = 25

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

let myAddress        = ''
let optimisticKickAt = 0
let localIsOwner     = false   // set en ballOwned, corregido lazy en system loop

// Referencia al entity ball para la fn de release optimista
let ballEntity: ReturnType<typeof engine.addEntity> | null = null

function releaseOptimistic(power: number, kx: number, kz: number) {
  if (!ballEntity) return
  optimisticKickAt = Date.now()
  localPos.x = dribbleX
  localPos.y = BALL_RADIUS
  localPos.z = dribbleZ
  localVel.x = kx * power
  localVel.z = kz * power
  localVelY  = power * KICK_VY
  clientState = { mode: 'free' }
  prevMode    = 'free'
  GltfContainer.createOrReplace(ballEntity, {
    src: BALL_SRC,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })
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
  // Disc visible siempre — GLB fallback por si el modelo falla
  MeshRenderer.setCylinder(target, 1, 1)
  Material.setPbrMaterial(target, {
    albedoColor:       Color4.create(0, 0.9, 1, 0.85),
    emissiveColor:     Color3.create(0, 0.9, 1),
    emissiveIntensity: 3
  })

  const chargeBg   = engine.addEntity()
  const chargeFill = engine.addEntity()
  Transform.create(chargeBg,   { position: Vector3.clone(BALL_START), scale: Vector3.Zero() })
  Transform.create(chargeFill, { position: Vector3.clone(BALL_START), scale: Vector3.Zero() })
  MeshRenderer.setBox(chargeBg)
  MeshRenderer.setBox(chargeFill)
  Material.setPbrMaterial(chargeBg,   { albedoColor: Color4.create(0.15, 0.15, 0.15, 0.85) })
  Material.setPbrMaterial(chargeFill, { albedoColor: Color4.Yellow() })
  Billboard.create(chargeBg,   { billboardMode: BillboardMode.BM_Y })
  Billboard.create(chargeFill, { billboardMode: BillboardMode.BM_Y })

  // ── Mensajes del server ───────────────────────────────────────────────────
  room.onMessage('ballOwned', (data) => {
    const newMode: 'free' | 'owned' = data.ownerId === '' ? 'free' : 'owned'
    clientState = data.ownerId === ''
      ? { mode: 'free' }
      : { mode: 'owned', ownerId: data.ownerId }

    // Intentar resolver la address aquí también (por si el system loop no la cacheo aún)
    if (!myAddress) {
      const addr = (PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? getPlayer()?.userId ?? '').toLowerCase()
      if (addr) myAddress = addr
    }
    localIsOwner = newMode === 'owned' && !!myAddress && data.ownerId.toLowerCase() === myAddress

    if (newMode !== prevMode) {
      prevMode = newMode
      if (newMode === 'owned') {
        GltfContainer.createOrReplace(ball, {
          src: BALL_SRC,
          visibleMeshesCollisionMask:   ColliderLayer.CL_NONE,
          invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
        })
        prevPlayerX = -9999
        prevPlayerZ = -9999
      } else {
        GltfContainer.createOrReplace(ball, {
          src: BALL_SRC,
          visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS,
          invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
        })
        charging    = false
        localIsOwner = false
      }
    }
  })

  room.onMessage('ballState', (data) => {
    if (clientState.mode !== 'free') return
    // Ignorar corrección del server durante 700ms tras un kick optimista
    // para evitar que la pelota "blinke" hacia atrás por desfase de posición
    if (Date.now() - optimisticKickAt < 700) return
    localPos.x = data.x; localPos.y = data.y; localPos.z = data.z
    localVel.x = data.vx; localVel.z = data.vz
    localVelY  = data.vy
  })

  // ── Sistema de render ─────────────────────────────────────────────────────
  engine.addSystem((dt) => {
    const ballT   = Transform.getMutableOrNull(ball)
    const targetT = Transform.getMutableOrNull(target)
    const bgT     = Transform.getMutableOrNull(chargeBg)
    const fillT   = Transform.getMutableOrNull(chargeFill)
    if (!ballT || !targetT || !bgT || !fillT) return

    // Cachear address del player local; actualizar localIsOwner lazy si llegó tarde
    if (!myAddress) {
      const id = PlayerIdentityData.getOrNull(engine.PlayerEntity)
      if (id?.address) {
        myAddress = id.address.toLowerCase()
      } else {
        const uid = getPlayer()?.userId
        if (uid) myAddress = uid.toLowerCase()
      }
      // Si acaba de resolverse y estamos en owned, corregir el flag
      if (myAddress && clientState.mode === 'owned') {
        localIsOwner = (clientState as { mode: 'owned'; ownerId: string }).ownerId.toLowerCase() === myAddress
      }
    }

    const iAmOwner = localIsOwner

    // ── Posición de la pelota ─────────────────────────────────────────────
    if (clientState.mode === 'free') {
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
      } else {
        localPos.x += localVel.x * dt
        localPos.z += localVel.z * dt
      }

      // Rotación al rodar
      if (speed > MIN_SPEED) {
        const rollAxis  = Vector3.normalize(Vector3.create(localVel.z, 0, -localVel.x))
        const rollAngle = (speed / BALL_RADIUS) * dt * (180 / Math.PI)
        ballRotation    = Quaternion.multiply(Quaternion.fromAngleAxis(rollAngle, rollAxis), ballRotation)
        ballT.rotation  = ballRotation
      }

      ballT.position.x = localPos.x
      ballT.position.y = localPos.y
      ballT.position.z = localPos.z

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

        // Offset dinámico según velocidad
        const dynFront = BALL_FRONT + Math.min(moveSpeed * 0.18, BALL_FRONT_MAX - BALL_FRONT)
        const targetX  = px + moveDirX * dynFront
        const targetZ  = pz + moveDirZ * dynFront

        const lerp = Math.min(1, 12 * dt)
        dribbleX += (targetX - dribbleX) * lerp
        dribbleZ += (targetZ - dribbleZ) * lerp

        ballT.position.x = dribbleX
        ballT.position.y = BALL_RADIUS
        ballT.position.z = dribbleZ

        // Rotación mientras driblea
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
        ballT.position.x = playerT.position.x
        ballT.position.y = BALL_RADIUS
        ballT.position.z = playerT.position.z
        break
      }
    }

    // ── Target ────────────────────────────────────────────────────────────
    if (iAmOwner) {
      targetT.position = { x: ballT.position.x, y: 0.05, z: ballT.position.z }
      targetT.scale    = Vector3.create(1.2, 0.04, 1.2)  // disco plano brillante
    } else {
      targetT.scale = Vector3.Zero()
    }

    // ── Charge bar + kick ─────────────────────────────────────────────────
    if (iAmOwner) {
      const isHolding = inputSystem.isPressed(InputAction.IA_PRIMARY)

      if (isHolding && !charging) {
        charging    = true
        chargeStart = Date.now()
      }

      if (charging) {
        const chargeValue = Math.min(1, (Date.now() - chargeStart) / MAX_CHARGE_MS)
        const BAR_W = 1.0, BAR_H = 0.1, BAR_D = 0.05
        const barY  = ballT.position.y + 1.6

        bgT.position = { x: ballT.position.x, y: barY, z: ballT.position.z }
        bgT.scale    = { x: BAR_W, y: BAR_H, z: BAR_D }

        const fillW    = Math.max(0.01, BAR_W * chargeValue)
        fillT.position = {
          x: ballT.position.x - (BAR_W - fillW) * 0.5,
          y: barY,
          z: ballT.position.z
        }
        fillT.scale = { x: fillW, y: BAR_H * 1.1, z: BAR_D * 1.1 }

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

          // Optimistic: liberar la pelota localmente sin esperar al server
          releaseOptimistic(power, kx, kz)

          charging    = false
          bgT.scale   = Vector3.Zero()
          fillT.scale = Vector3.Zero()
        }
      }

    } else {
      if (charging) {
        charging    = false
        bgT.scale   = Vector3.Zero()
        fillT.scale = Vector3.Zero()
      }
    }

  }, undefined, 'ball-render')
}
