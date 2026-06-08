import { addProdePanel, refreshAllPanels } from '../schedule/prodePanel'
import { setupProdeUi, openProdeInfo } from '../schedule/prodeUi'
import { GROUPS } from '../schedule/prodeData'
import { startProdeClient } from '../client/prodeClient'
import { initProdeLeaderboard } from '../client/prodeLeaderboard'
import { setupWearableSpin } from '../client/wearableDisplay'
import { setupCrowdAudio, setupFieldTrigger } from '../client/sceneEffects'
import { setupSfx, playClick } from '../client/sfx'
import { setupReflectors } from '../client/reflectors'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import {
  engine, Entity, MeshRenderer, MeshCollider, Material,
  ColliderLayer, pointerEventsSystem, InputAction
} from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { EntityNames } from '../assets/scene/entity-names'

export async function main() {
  if (isServer()) {
    const { startProdeServer } = await import('../server/prodeServer')
    startProdeServer()
    return
  }

  setupSfx()
  buildWorld()
  setupProdeUi()
  setupCrowdAudio()
  setupFieldTrigger()
  initProdeLeaderboard({
    position: Vector3.create(28, 3.5, 47.25),
    rotation: Quaternion.fromEulerDegrees(0, 90, 0),
    size: Vector3.create(5, 7, 1)
  })
  setupScenePlanes()
  // setupReflectors()
  setupWearableSpin()
  startProdeClient(refreshAllPanels)
}

function setupScenePlanes() {
  const bannerLeft = engine.getEntityOrNullByName<EntityNames>(EntityNames.banner_left)
  const bannerRight = engine.getEntityOrNullByName<EntityNames>(EntityNames.banner_right)
  const leaderboard = engine.getEntityOrNullByName<EntityNames>(EntityNames.leaderboard)

  if (bannerRight) {
    applyBannerMaterial(bannerRight, 'images/banner.png')
  }

  if (bannerLeft) {
    applyBannerMaterial(bannerLeft, 'images/Banner-Rules.png')
    MeshCollider.setPlane(bannerLeft, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      { entity: bannerLeft, opts: { button: InputAction.IA_POINTER, hoverText: 'How scoring works' } },
      () => { playClick(); openProdeInfo() }
    )
  }

  if (leaderboard) {
    MeshRenderer.setPlane(leaderboard)
    Material.setBasicMaterial(leaderboard, {
      diffuseColor: Color4.fromHexString('#08111cff')
    })
  }
}

function applyBannerMaterial(entity: Entity, src: string) {
  MeshRenderer.setPlane(entity)
  Material.setPbrMaterial(entity, {
    texture: Material.Texture.Common({ src }),
    emissiveTexture: Material.Texture.Common({ src }),
    emissiveColor: Color3.White(),
    emissiveIntensity: 1.6,
    roughness: 1,
    metallic: 0,
    specularIntensity: 0
  })
}

function buildWorld() {
  for (let i = 0; i < GROUPS.length; i++) {
    const left = i % 2 === 0
    const z = left ? 44 : 56
    const x = 56 + Math.floor(i / 2) * 6
    const yaw = 90

    addProdePanel(i, {
      position: Vector3.create(x, 3, z),
      rotation: Quaternion.fromEulerDegrees(0, yaw, 0),
      scale: Vector3.create(2.2, 2.2, 2.2)
    })
  }
}
