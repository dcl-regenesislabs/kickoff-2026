import {
  Animator, EasingFunction, Entity, Name, Tween, TweenLoop, TweenSequence, engine
} from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { EntityNames } from '../assets/scene/entity-names'

// The dispenser bases and the wearable jerseys are placed from the Creator Hub
// (they live in the scene composite). Here we find them by their editor names and
// spin the jerseys + play the dispenser animation (not set up in the editor).
const WEARABLE_NAMES: string[] = [
  EntityNames.trikot_final_male__glb,
  EntityNames.trikot_final_female_fix1__glb
]
const DISPENSER_NAMES: string[] = [
  EntityNames.dispenser_1_glb,
  EntityNames.dispenser_1_glb_2
]
const DISPENSER_CLIPS = ['Cylinder.135Action', 'Cylinder.138Action.001', 'Dispenser_gownAction']

export function setupWearableSpin() {
  const done = new Set<string>()
  const total = WEARABLE_NAMES.length + DISPENSER_NAMES.length
  engine.addSystem(() => {
    if (done.size >= total) return
    // The composite entities may not exist on the first frame — poll until found.
    for (const [entity, name] of engine.getEntitiesWith(Name)) {
      if (done.has(name.value)) continue
      if (WEARABLE_NAMES.includes(name.value)) { spin(entity); done.add(name.value) }
      else if (DISPENSER_NAMES.includes(name.value)) { animateDispenser(entity); done.add(name.value) }
    }
  })
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
