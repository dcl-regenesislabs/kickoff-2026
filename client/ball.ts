import { engine, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { room } from '../schedule/prodeNet'

const BALL_SRC    = 'assets/scene/Models/ball.glb'
const BALL_START  = Vector3.create(30, 0.4, 48)
const BALL_SCALE  = Vector3.create(0.6, 0.6, 0.6)
const BALL_RADIUS = 0.3
const FRICTION    = 0.12
const MIN_SPEED   = 0.05

// Último estado recibido del server
const serverPos = { x: BALL_START.x, y: BALL_START.y, z: BALL_START.z }
const serverVel = { x: 0, z: 0 }

// Estado local que extrapolamos entre updates del server
const localPos  = { x: BALL_START.x, y: BALL_START.y, z: BALL_START.z }
const localVel  = { x: 0, z: 0 }
let ballRotation = Quaternion.Identity()

export function setupBallClient() {
  const ball = engine.addEntity()
  Transform.create(ball, {
    position: Vector3.clone(BALL_START),
    rotation: Quaternion.Identity(),
    scale:    Vector3.clone(BALL_SCALE)
  })
  GltfContainer.create(ball, { src: BALL_SRC })

  room.onMessage('ballState', (data) => {
    // Snap posición y velocidad al estado autoritativo del server
    serverPos.x = data.x
    serverPos.y = data.y
    serverPos.z = data.z
    serverVel.x = data.vx
    serverVel.z = data.vz

    localPos.x = data.x
    localPos.y = data.y
    localPos.z = data.z
    localVel.x = data.vx
    localVel.z = data.vz
  })

  engine.addSystem((dt) => {
    const t = Transform.getMutableOrNull(ball)
    if (!t) return

    // Extrapolamos localmente con la misma fricción del server
    // para que el movimiento sea fluido entre updates
    const frictionFactor = Math.pow(FRICTION, dt)
    localVel.x *= frictionFactor
    localVel.z *= frictionFactor

    const speed = Math.sqrt(localVel.x ** 2 + localVel.z ** 2)
    if (speed < MIN_SPEED) {
      localVel.x = 0
      localVel.z = 0
    } else {
      localPos.x += localVel.x * dt
      localPos.z += localVel.z * dt
    }

    t.position.x = localPos.x
    t.position.y = localPos.y
    t.position.z = localPos.z

    if (speed > MIN_SPEED) {
      const rollAxis  = Vector3.normalize(Vector3.create(localVel.z, 0, -localVel.x))
      const rollAngle = (speed / BALL_RADIUS) * dt * (180 / Math.PI)
      ballRotation    = Quaternion.multiply(Quaternion.fromAngleAxis(rollAngle, rollAxis), ballRotation)
      t.rotation      = ballRotation
    }
  }, undefined, 'ball-render')
}
