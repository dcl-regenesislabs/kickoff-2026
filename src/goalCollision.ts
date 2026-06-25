import { engine, Transform } from '@dcl/sdk/ecs'
import { EntityNames } from '../assets/scene/entity-names'

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }
type GoalPlane = {
  position: Vec3
  rotation: Quat
  halfWidth: number
  halfHeight: number
}

const GOAL_COLLIDER_NAMES = [
  // EntityNames.goal_collision_left,
  // EntityNames.goal_collision_right,
  // EntityNames.goal_collision_top,
  // EntityNames.goal_collision_back
] as const

function rotateVector(vector: Vec3, rotation: Quat): Vec3 {
  const qx = rotation.x
  const qy = rotation.y
  const qz = rotation.z
  const qw = rotation.w

  const tx = 2 * (qy * vector.z - qz * vector.y)
  const ty = 2 * (qz * vector.x - qx * vector.z)
  const tz = 2 * (qx * vector.y - qy * vector.x)

  return {
    x: vector.x + qw * tx + (qy * tz - qz * ty),
    y: vector.y + qw * ty + (qz * tx - qx * tz),
    z: vector.z + qw * tz + (qx * ty - qy * tx)
  }
}

function inverseRotateVector(vector: Vec3, rotation: Quat): Vec3 {
  return rotateVector(vector, { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w })
}

function getGoalPlanes(): GoalPlane[] {
  const planes: GoalPlane[] = []

  for (const name of GOAL_COLLIDER_NAMES) {
    const entity = engine.getEntityOrNullByName<EntityNames>(name)
    if (!entity) continue

    const transform = Transform.getOrNull(entity)
    if (!transform) continue

    planes.push({
      position: transform.position,
      rotation: transform.rotation,
      halfWidth: Math.abs(transform.scale.x) * 0.5,
      halfHeight: Math.abs(transform.scale.y) * 0.5
    })
  }

  return planes
}

function toLocal(point: Vec3, plane: GoalPlane): Vec3 {
  return inverseRotateVector(
    {
      x: point.x - plane.position.x,
      y: point.y - plane.position.y,
      z: point.z - plane.position.z
    },
    plane.rotation
  )
}

export function resolveGoalCollision(position: Vec3, previousPosition: Vec3, velocity: Vec3, radius: number) {
  let nextPosition = { ...position }
  let nextVelocity = { ...velocity }
  let collided = false

  for (const plane of getGoalPlanes()) {
    const localPrev = toLocal(previousPosition, plane)
    const localPos = toLocal(nextPosition, plane)

    const withinPlaneBounds =
      Math.abs(localPos.x) <= plane.halfWidth + radius &&
      Math.abs(localPos.y) <= plane.halfHeight + radius

    if (!withinPlaneBounds || Math.abs(localPos.z) > radius) continue

    collided = true

    const localVelocity = inverseRotateVector(nextVelocity, plane.rotation)
    // Keep the ball on the last valid position instead of snapping it onto the net plane.
    // This feels like a stop/bounce against the goal rather than a teleport.
    nextPosition = { ...previousPosition }
    localVelocity.z = 0
    nextVelocity = rotateVector(localVelocity, plane.rotation)
  }

  return {
    position: nextPosition,
    velocity: nextVelocity,
    collided
  }
}
