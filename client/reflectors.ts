import { engine, Transform, GltfContainer, LightSource } from '@dcl/sdk/ecs'
import { Quaternion, Vector3, Color3 } from '@dcl/sdk/math'

// Two stadium reflectors aimed at the banners + leaderboard cluster.
const REFLECTOR_MODEL = 'models/low_poly_reflector.glb'

// Center of the banners + leaderboard (x=28, z≈47, ~mid height).
const TARGET = Vector3.create(28, 4, 47.25)

// Placed on the player-facing (-X) side, elevated, flanking in Z.
const SPOTS: Vector3[] = [
  Vector3.create(20, 9, 41),
  Vector3.create(20, 9, 54)
]

export function setupReflectors() {
  for (const pos of SPOTS) {
    const e = engine.addEntity()
    Transform.create(e, {
      position: pos,
      rotation: Quaternion.fromLookAt(pos, TARGET),   // forward points at the cluster
      scale: Vector3.create(1, 1, 1)
    })
    GltfContainer.create(e, { src: REFLECTOR_MODEL })

    // Spotlight shining along the reflector's forward (toward the cluster).
    LightSource.create(e, {
      active: true,
      color: Color3.create(1, 1, 0.95),
      intensity: 25000,
      range: 45,
      type: LightSource.Type.Spot({ innerAngle: 18, outerAngle: 34 })
    })
  }
}
