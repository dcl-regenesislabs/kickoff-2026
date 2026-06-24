import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { room } from '../schedule/prodeNet'

const BALL_START       = { x: 30, y: 0.3, z: 48 }
const BALL_RADIUS      = 0.3

const AUTO_TAKE_RADIUS       = 1.2
const STEAL_RADIUS           = 1.2
const STEAL_COOLDOWN         = 800   // ms
const KICK_AUTOTAKE_COOLDOWN = 3000  // ms

const MAX_SPEED   = 25
const FRICTION    = 0.55
const MIN_SPEED   = 0.05
const GRAVITY     = 9.8
const KICK_VY     = 0.28  // vy = power * KICK_VY

const FIELD = { minX: 5, maxX: 155, minZ: 37, maxZ: 57 }

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

export function setupBall() {

  room.onMessage('kickBall', (data, ctx) => {
    if (!ctx) return
    if (mode !== 'owned' || ctx.from.toLowerCase() !== ownerId.toLowerCase()) return

    kickedBy = ownerId.toLowerCase()  // ownerId is wallet address; ctx.from is session ID
    kickedAt = Date.now()
    mode     = 'free'
    ownerId  = ''

    // Empujar la pelota 1.5m en la dirección del kick antes de aplicar velocidad
    pos.x += data.dirX * 1.5
    pos.z += data.dirZ * 1.5
    pos.x  = Math.max(FIELD.minX, Math.min(FIELD.maxX, pos.x))
    pos.z  = Math.max(FIELD.minZ, Math.min(FIELD.maxZ, pos.z))

    vel.x = data.dirX * data.power
    vel.z = data.dirZ * data.power
    velY  = data.power * KICK_VY

    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    if (speed > MAX_SPEED) { vel.x = vel.x / speed * MAX_SPEED; vel.z = vel.z / speed * MAX_SPEED }

    wasMoving = true
    room.send('ballOwned', { ownerId: '' })
    room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: velY, vz: vel.z })
  })

  engine.addSystem((dt) => {

    if (mode === 'free') {
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
      if (pos.x < FIELD.minX || pos.x > FIELD.maxX || pos.z < FIELD.minZ || pos.z > FIELD.maxZ) {
        pos.x = Math.max(FIELD.minX, Math.min(FIELD.maxX, pos.x))
        pos.z = Math.max(FIELD.minZ, Math.min(FIELD.maxZ, pos.z))
        vel.x = 0; vel.z = 0
      }
      room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: velY, vz: vel.z })

    } else {
      let ownerFound = false
      for (const [_e, identity, playerT] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
        if (identity.address.toLowerCase() !== ownerId.toLowerCase()) continue
        ownerFound = true
        pos.x = playerT.position.x
        pos.y = BALL_RADIUS
        pos.z = playerT.position.z
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
