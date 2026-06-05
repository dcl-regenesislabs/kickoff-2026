import {
  Animator,
  AudioSource,
  ColliderLayer,
  EasingFunction,
  Entity,
  GltfContainer,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  PBGltfContainer,
  Transform,
  TransformTypeWithOptionals,
  Tween,
  TweenLoop,
  TweenSequence,
  VisibilityComponent,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { ClaimConfig, ClaimConfigInstType, CONFIG_CLAIM_TESTING_ENABLED } from './claiming/claimConfig'
// import resources from '../resources'
import { claimToken } from './claiming/claim'
import * as utils from '@dcl-sdk/utils'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { sceneParentEntity } from '../../global'
// import { CONFIG } from '../config'

export function createDispenser(
  campaign: ClaimConfigInstType,
  campaign_key: string,
  dispTransform: TransformTypeWithOptionals,
  wearableModel: string | [string, string],
  balloonsModel?: string,
  bUseBaloons: boolean = false,
  name?: string
) {
  const dispenserBase = engine.addEntity()
  Transform.create(dispenserBase, {
    ...dispTransform
  })

  const collider = engine.addEntity()
  MeshCollider.setBox(collider)
  MeshRenderer.setBox(collider)
  Transform.create(collider, {
    parent: dispenserBase,
    position: { x: 0, y: 0, z: 0 },
    scale: Vector3.create(1, 1, 1)
  })
  Material.setPbrMaterial(collider, {
    albedoColor: Color4.create(0, 0, 0, 0)
  })

  const wearable1 = engine.addEntity()
  GltfContainer.create(wearable1, {
    src: typeof wearableModel === 'string' ? wearableModel : wearableModel[0]
  })
  Transform.create(wearable1, {
    parent: dispenserBase,
    position: typeof wearableModel === 'string' ? { x: 0, y: 0, z: 0 } : { x: 0.4, y: 0, z: 0 }
  })

  let wearable2: Entity | null = null
  if (typeof wearableModel !== 'string' && wearableModel.length > 1) {
    wearable2 = engine.addEntity()
    GltfContainer.create(wearable2, {
      src: wearableModel[1]
    })
    Transform.create(wearable2, {
      parent: dispenserBase,
      position: { x: -0.4, y: 0, z: 0 }
    })
  }

  const baloons = engine.addEntity()
  if (bUseBaloons && balloonsModel) {
    GltfContainer.create(baloons, {
      src: balloonsModel
    })
    Transform.create(baloons, {
      parent: dispenserBase,
      position: { x: 0, y: 1.2, z: 0 }
    })
    Animator.create(baloons, {
      states: [
        {
          clip: 'armature_psAction',
          loop: false,
          playing: false
        }
      ]
    })
    VisibilityComponent.create(baloons, {
      visible: false
    })
  }

  // const wewarable = engine.addEntity()
  // GltfContainer.create(wewarable, wearableModel)
  // Transform.create(wewarable, wearableTransform)
  // Transform.getMutable(wewarable).parent = dispenserBase

  const clickSound = engine.addEntity()
  Transform.create(clickSound, { parent: engine.CameraEntity })
  AudioSource.create(clickSound, {
    audioClipUrl: 'sounds/dispenser/click.mp3',
    playing: false,
    loop: false
  })

  const clickFailSound = engine.addEntity()
  Transform.create(clickFailSound, { parent: engine.CameraEntity })
  AudioSource.create(clickFailSound, {
    audioClipUrl: 'sounds/dispenser/click_fail.mp3',
    playing: false,
    loop: false
  })

  let canClick = true
  const clickDelayMs = 4000
  pointerEventsSystem.onPointerDown(
    {
      entity: collider,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: CONFIG_CLAIM_TESTING_ENABLED ? 'Claim ' + campaign.refId : 'Claim',
        maxDistance: 5,
        showHighlight: false
      }
    },
    function () {
      clickDispenser()
    }
  )

  function clickDispenser() {
    if (!canClick) {
      AudioSource.getMutable(clickFailSound).playing = true
      return
    }
    AudioSource.getMutable(clickSound).playing = true
    if (bUseBaloons) {
      VisibilityComponent.getMutable(baloons).visible = true
      Animator.playSingleAnimation(baloons, 'armature_psAction', true)
    }

    canClick = false
    utils.timers.setTimeout(() => {
      canClick = true
    }, clickDelayMs)

    utils.timers.setTimeout(() => {
      claimToken(campaign, campaign_key)
    }, 500)
  }

  Tween.createOrReplace(wearable1, {
    mode: Tween.Mode.Rotate({
      start: Quaternion.fromEulerDegrees(0, 0, 0),
      end: Quaternion.fromEulerDegrees(0, 180, 0)
    }),
    duration: 4000,
    easingFunction: EasingFunction.EF_LINEAR
  })

  TweenSequence.create(wearable1, {
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

export function createBaseDispenser() {
  const jacket = engine.addEntity()
  const jacket_clickeable = engine.addEntity()
  Transform.create(jacket_clickeable, {
    position: Vector3.create(-7.7, 1.7, 21.55),
    scale: Vector3.create(1.3, 1.3, 1.3),
    parent: sceneParentEntity
  })
  MeshCollider.setBox(jacket_clickeable, ColliderLayer.CL_POINTER)
  Transform.create(jacket, {
    position: Vector3.create(0, -1.3, 0),
    parent: jacket_clickeable
  })
  GltfContainer.create(jacket, { src: 'models/Bondex_Jacket_M.glb' })
  Tween.createOrReplace(jacket, {
    mode: Tween.Mode.Rotate({
      start: Quaternion.fromEulerDegrees(0, 0, 0),
      end: Quaternion.fromEulerDegrees(0, 180, 0)
    }),
    duration: 4000,
    easingFunction: EasingFunction.EF_LINEAR
  })
  pointerEventsSystem.onPointerDown(
    {
      entity: jacket_clickeable,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Claim',
        maxDistance: 10
      }
    },
    () => {
      claimToken(ClaimConfig.campaign.web3CareerJacket, ClaimConfig.campaign.web3CareerJacket.campaignKeys.key)
    }
  )

  TweenSequence.create(jacket, {
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
