import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { room } from '../schedule/prodeNet'
import { EntityNames } from '../assets/scene/entity-names'

const BALL_START  = { x: 30, y: 0.4, z: 48 }
const KICK_RADIUS = 1.5
const KICK_FORCE  = 18
const MAX_SPEED   = 28
const FRICTION    = 0.12  // fracción de velocidad restante por segundo
const MIN_SPEED   = 0.05
// Límites del pasto — z deducidos de collider_left(z:58) / collider_right(z:36.25)
// x estimado: pasto centrado en x:85, ajustar si hace falta
const FIELD = { minX: 5, maxX: 155, minZ: 37, maxZ: 57 }


const pos = { x: BALL_START.x, y: BALL_START.y, z: BALL_START.z }
const vel = { x: 0, z: 0 }
let wasMoving = false

export function setupBall() {
  engine.addSystem((dt) => {
    for (const [_e, _id, playerT] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
      const dx   = pos.x - playerT.position.x
      const dz   = pos.z - playerT.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist > 0.01 && dist < KICK_RADIUS) {
        vel.x += (dx / dist) * KICK_FORCE
        vel.z += (dz / dist) * KICK_FORCE
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
        if (speed > MAX_SPEED) {
          vel.x = (vel.x / speed) * MAX_SPEED
          vel.z = (vel.z / speed) * MAX_SPEED
        }
      }
    }

    const frictionFactor = Math.pow(FRICTION, dt)
    vel.x *= frictionFactor
    vel.z *= frictionFactor

    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)

    if (speed < MIN_SPEED) {
      vel.x = 0
      vel.z = 0
      if (wasMoving) {
        // Mensaje final para que el cliente pare la rotación
        room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: 0, vz: 0 })
        wasMoving = false
      }
      return
    }

    wasMoving = true
    pos.x += vel.x * dt
    pos.z += vel.z * dt

    // Si sale del pasto → teletransportar al punto más cercano del borde + detener
    if (pos.x < FIELD.minX || pos.x > FIELD.maxX || pos.z < FIELD.minZ || pos.z > FIELD.maxZ) {
      pos.x = Math.max(FIELD.minX, Math.min(FIELD.maxX, pos.x))
      pos.z = Math.max(FIELD.minZ, Math.min(FIELD.maxZ, pos.z))
      vel.x = 0
      vel.z = 0
    }

    room.send('ballState', { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vz: vel.z })
  }, undefined, 'ball-physics')

  // Log en primer frame — las entidades del CRDT están disponibles recién ahí
  let logged = false
  engine.addSystem(() => {
    if (logged) return
    logged = true
    const grassE        = engine.getEntityOrNullByName(EntityNames.StadiumGrass01_glb)
    const colliderLeft  = engine.getEntityOrNullByName(EntityNames.collider_left)
    const colliderRight = engine.getEntityOrNullByName(EntityNames.collider_right)
    console.log('[Ball] grass:', JSON.stringify(grassE ? Transform.getOrNull(grassE) : null))
    console.log('[Ball] collider_left:', JSON.stringify(colliderLeft ? Transform.getOrNull(colliderLeft) : null))
    console.log('[Ball] collider_right:', JSON.stringify(colliderRight ? Transform.getOrNull(colliderRight) : null))
  }, undefined, 'ball-debug-once')

  console.log('[Server] ball ready at', BALL_START.x, BALL_START.y, BALL_START.z)
}
