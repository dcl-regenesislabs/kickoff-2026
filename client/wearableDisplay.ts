import {
  Animator, ColliderLayer, EasingFunction, Entity, InputAction, MeshCollider,
  Name, Transform, Tween, TweenLoop, TweenSequence, engine, pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { claimWearable } from './claimWearable'
import { playClick } from './sfx'

// The wearable prizes and the dispenser bases are placed from the Creator Hub.
// Matched by NAME PREFIX (robust to renames): any "trikot…" is a claimable prize,
// any "dispenser_1…" is an animated base.
const DISPENSER_CLIPS = ['Cylinder.135Action', 'Cylinder.138Action.001', 'Dispenser_gownAction']

export function setupWearableSpin() {
  const done = new Set<Entity>()
  let elapsed = 0
  engine.addSystem((dt: number) => {
    // Composite entities load a frame or two after start — poll briefly, then stop.
    elapsed += dt
    if (elapsed > 8) return
    for (const [entity, name] of engine.getEntitiesWith(Name)) {
      if (done.has(entity)) continue
      const n = name.value.toLowerCase()
      if (n.startsWith('trikot')) {
        spin(entity)
        // Only add standalone clicker if not already inside a CH collider entity
        const t = Transform.getOrNull(entity)
        if (!t?.parent || t.parent === engine.RootEntity) makeClaimable(entity)
        done.add(entity)
      }
      else if (n.startsWith('dispenser_1')) { animateDispenser(entity); done.add(entity) }
      else if (n.startsWith('collider_')) {
        pointerEventsSystem.onPointerDown(
          { entity, opts: { button: InputAction.IA_POINTER, hoverText: 'Claim your free wearable', maxDistance: 2, showHighlight: true } },
          () => { playClick(); claimWearable() }
        )
        done.add(entity)
      }
    }
  })
}

function makeClaimable(entity: Entity) {
  const t = Transform.getOrNull(entity)
  if (!t) return
  const clicker = engine.addEntity()
  Transform.create(clicker, {
    position: Vector3.create(t.position.x, t.position.y + 1.2, t.position.z),
    scale: Vector3.create(2.2, 3, 2.2)
  })
  MeshCollider.setBox(clicker, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: clicker, opts: { button: InputAction.IA_POINTER, hoverText: 'Claim your free wearable', maxDistance: 2 } },
    () => { playClick(); claimWearable() }
  )
}

// Play all of the dispenser's clips on a loop.
function animateDispenser(entity: Entity) {
  Animator.createOrReplace(entity, {
    states: DISPENSER_CLIPS.map(clip => ({ clip, playing: true, loop: true }))
  })
}

function spin(entity: Entity) {
  // Same spin as before: rotate 0→180, then loop 180→0 continuously.
  Tween.createOrReplace(entity, {
    mode: Tween.Mode.Rotate({
      start: Quaternion.fromEulerDegrees(0, 0, 0),
      end: Quaternion.fromEulerDegrees(0, 180, 0)
    }),
    duration: 4000,
    easingFunction: EasingFunction.EF_LINEAR
  })
  TweenSequence.create(entity, {
    sequence: [
      {
        mode: Tween.Mode.Rotate({
          start: Quaternion.fromEulerDegrees(0, 180.000001, 0),
          end: Quaternion.fromEulerDegrees(0, 0, 0)
        }),
        duration: 4000,
        easingFunction: EasingFunction.EF_LINEAR
      }
    ],
    loop: TweenLoop.TL_RESTART
  })
}
