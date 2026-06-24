import { engine, Transform } from '@dcl/sdk/ecs'
import { EntityNames } from '../assets/scene/entity-names'

type SafeArea = {
  centerX: number
  centerZ: number
  halfX: number
  halfZ: number
}

const FALLBACK_SAFE_AREA: SafeArea = {
  centerX: 80,
  centerZ: 47,
  halfX: 75,
  halfZ: 10
}

let cachedSafeArea: SafeArea | null = null

function readSafeArea(): SafeArea | null {
  const entity = engine.getEntityOrNullByName<EntityNames>(EntityNames.safe_area_ball)
  if (!entity) return null

  const transform = Transform.getOrNull(entity)
  if (!transform) return null

  return {
    centerX: transform.position.x,
    centerZ: transform.position.z,
    halfX: Math.abs(transform.scale.x) * 0.5,
    halfZ: Math.abs(transform.scale.z) * 0.5
  }
}

function getSafeArea(): SafeArea {
  const liveSafeArea = readSafeArea()
  if (liveSafeArea) {
    cachedSafeArea = liveSafeArea
    return liveSafeArea
  }

  return cachedSafeArea ?? FALLBACK_SAFE_AREA
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clampBallToSafeArea(x: number, z: number) {
  const area = getSafeArea()
  const minX = area.centerX - area.halfX
  const maxX = area.centerX + area.halfX
  const minZ = area.centerZ - area.halfZ
  const maxZ = area.centerZ + area.halfZ

  const clampedX = clamp(x, minX, maxX)
  const clampedZ = clamp(z, minZ, maxZ)

  return {
    x: clampedX,
    z: clampedZ,
    wasClamped: clampedX !== x || clampedZ !== z
  }
}
