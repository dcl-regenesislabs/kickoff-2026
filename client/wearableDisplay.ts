import {
  EasingFunction, Entity, Name, Tween, TweenLoop, TweenSequence, engine
} from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { EntityNames } from '../assets/scene/entity-names'

// The dispenser base and the wearable jacket are placed from the Creator Hub
// (they live in the scene composite). Here we only find the wearable by its
// editor name and spin it in place, like it span in the original scene.
const WEARABLE_NAME = EntityNames.Bondex_Jacket_M_emote_glb

export function setupWearableSpin() {
  let applied = false
  engine.addSystem(() => {
    if (applied) return
    // The composite entities may not exist on the first frame — poll until found.
    for (const [entity, name] of engine.getEntitiesWith(Name)) {
      if (name.value !== WEARABLE_NAME) continue
      spin(entity)
      applied = true
      break
    }
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
