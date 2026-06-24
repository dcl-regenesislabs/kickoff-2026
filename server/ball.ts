import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { room } from '../schedule/prodeNet'
import { clampBallToSafeArea } from '../src/ballSafeArea'
import { resolveGoalCollision } from '../src/goalCollision'

const BALL_START       = { x: 30, y: 0.28, z: 48 }
const BALL_RADIUS      = 0.28
const BALL_FRONT       = 1.82
const OWNED_BALL_Y     = 0.34
const KICK_START_PUSH  = 1.5

const AUTO_TAKE_RADIUS       = 1.45
const STEAL_RADIUS           = 1.35
const STEAL_COOLDOWN         = 800   // ms
const KICK_AUTOTAKE_COOLDOWN = 3000  // ms

const MAX_SPEED   = 25
const FRICTION    = 0.55
const MIN_SPEED   = 0.05
const GRAVITY     = 9.8
const MIN_KICK_POWER = 5
const MAX_KICK_POWER = 25
const MIN_KICK_LOFT  = 2.2
const MAX_KICK_LOFT  = 9.5

type BallMode = 'free' | 'owned'
let mode: BallMode = 'free'
let ownerId        = ''
let ownerTakenAt   = 0

const pos = { x: BALL_START.x, y: BALL_START.y, z: BALL_START.z }
const vel = { x: 0, z: 0 }
let velY      = 0
let wasMoving = false
let kickedBy  = ''
let kickedAt  = 0

function dist2d(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx, dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

function getKickLift(power: number) {
  const normalizedPower = Math.max(0, Math.min(1, (power - MIN_KICK_POWER) / (MAX_KICK_POWER - MIN_KICK_POWER)))
  return MIN_KICK_LOFT + (MAX_KICK_LOFT - MIN_KICK_LOFT) * normalizedPower * normalizedPower
}

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

export function setupBall() {

  room.onMessage('requestBallState', (_data, ctx) => {
    if (!ctx) return
    room.send('ballOwned', { ownerId }, { to: [ctx.from] })
    if (mode === 'free') {
      room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: velY, vz: vel.z }, { to: [ctx.from] })
    }
  })

  room.onMessage('kickBall', (data, ctx) => {
    if (!ctx) return
    if (mode !== 'owned' || ctx.from.toLowerCase() !== ownerId.toLowerCase()) return

    kickedBy = ownerId.toLowerCase()  // ownerId is wallet address; ctx.from is session ID
    kickedAt = Date.now()
    mode     = 'free'
    ownerId  = ''

    // Empujar la pelota 1.5m en la dirección del kick antes de aplicar velocidad
    pos.x += data.dirX * KICK_START_PUSH
    pos.z += data.dirZ * KICK_START_PUSH
    const kickClamp = clampBallToSafeArea(pos.x, pos.z)
    pos.x = kickClamp.x
    pos.z = kickClamp.z

    vel.x = data.dirX * data.power
    vel.z = data.dirZ * data.power
    velY  = getKickLift(data.power)

    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    if (speed > MAX_SPEED) { vel.x = vel.x / speed * MAX_SPEED; vel.z = vel.z / speed * MAX_SPEED }

    wasMoving = true
    room.send('ballOwned', { ownerId: '' })
    room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: velY, vz: vel.z })
  })

  engine.addSystem((dt) => {

    if (mode === 'free') {
      const prevPos = { x: pos.x, y: pos.y, z: pos.z }

      // Gravedad
      velY  -= GRAVITY * dt
      pos.y += velY * dt
      if (pos.y <= BALL_RADIUS) {
        pos.y = BALL_RADIUS
        velY  = velY < -0.8 ? -velY * 0.4 : 0
      }
      const airborne = pos.y > BALL_RADIUS + 0.01

      // Auto-take — solo cuando la pelota está en el suelo
      if (!airborne) {
        const now = Date.now()
        for (const [_e, identity, playerT] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
          if (identity.address.toLowerCase() === kickedBy && now - kickedAt < KICK_AUTOTAKE_COOLDOWN) continue
          if (dist2d(playerT.position.x, playerT.position.z, pos.x, pos.z) < AUTO_TAKE_RADIUS) {
            mode = 'owned'; ownerId = identity.address; ownerTakenAt = Date.now()
            vel.x = 0; vel.z = 0; velY = 0
            room.send('ballOwned', { ownerId })
            return
          }
        }
      }

      // Fricción horizontal
      const ff    = Math.pow(FRICTION, dt)
      vel.x *= ff; vel.z *= ff
      const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)

      if (speed < MIN_SPEED && !airborne && Math.abs(velY) < 0.05) {
        vel.x = 0; vel.z = 0; velY = 0
        if (wasMoving) {
          room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 0, vz: 0 })
          wasMoving = false
        }
        return
      }

      wasMoving = true
      pos.x += vel.x * dt; pos.z += vel.z * dt
      const freeClamp = clampBallToSafeArea(pos.x, pos.z)
      if (freeClamp.wasClamped) {
        pos.x = freeClamp.x
        pos.z = freeClamp.z
        vel.x = 0; vel.z = 0
      } else {
        pos.x = freeClamp.x
        pos.z = freeClamp.z
      }

      const goalCollision = resolveGoalCollision(
        { x: pos.x, y: pos.y, z: pos.z },
        prevPos,
        { x: vel.x, y: velY, z: vel.z },
        BALL_RADIUS
      )
      pos.x = goalCollision.position.x
      pos.y = goalCollision.position.y
      pos.z = goalCollision.position.z
      vel.x = goalCollision.velocity.x
      velY = goalCollision.velocity.y
      vel.z = goalCollision.velocity.z

      room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: velY, vz: vel.z })

    } else {
      let ownerFound = false
      for (const [_e, identity, playerT] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
        if (identity.address.toLowerCase() !== ownerId.toLowerCase()) continue
        ownerFound = true
        const anchor = getOwnedBallAnchor(playerT)
        pos.x = anchor.x
        pos.y = OWNED_BALL_Y
        pos.z = anchor.z
        break
      }

      if (!ownerFound) {
        mode = 'free'; ownerId = ''; vel.x = 0; vel.z = 0; velY = 0
        room.send('ballOwned', { ownerId: '' })
        return
      }

      if (Date.now() - ownerTakenAt > STEAL_COOLDOWN) {
        for (const [_e, identity, playerT] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
          if (identity.address.toLowerCase() === ownerId.toLowerCase()) continue
          if (dist2d(playerT.position.x, playerT.position.z, pos.x, pos.z) < STEAL_RADIUS) {
            ownerId = identity.address; ownerTakenAt = Date.now()
            room.send('ballOwned', { ownerId })
            break
          }
        }
      }
    }

  }, undefined, 'ball-physics')

  console.log('[Server] ball ready')
}
