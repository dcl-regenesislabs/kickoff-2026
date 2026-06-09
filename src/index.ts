import { addProdePanel, refreshAllPanels } from '../schedule/prodePanel'
import { setupProdeUi, openProdeInfo } from '../schedule/prodeUi'
import { GROUPS } from '../schedule/prodeData'
import { startProdeClient } from '../client/prodeClient'
import { initProdeLeaderboard } from '../client/prodeLeaderboard'
import { setupWearableSpin } from '../client/wearableDisplay'
import { setupCrowdAudio, setupFieldTrigger } from '../client/sceneEffects'
import { setupSfx, playClick } from '../client/sfx'
import { setupReflectors } from '../client/reflectors'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
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
  const bannerLeftPrize = engine.getEntityOrNullByName<EntityNames>(EntityNames.banner_left_prize)
  const bannerRight = engine.getEntityOrNullByName<EntityNames>(EntityNames.banner_right)
  const bannerRightPrize = engine.getEntityOrNullByName<EntityNames>(EntityNames.banner_right_prize)
  const leaderboard = engine.getEntityOrNullByName<EntityNames>(EntityNames.leaderboard)
  const leaderboard2 = engine.getEntityOrNullByName<EntityNames>(EntityNames.leaderboard_2)

  if (bannerRight) {
    applyBannerMaterial(bannerRight, 'images/banner.png')
  }

  if (bannerLeft) {
    applyBannerMaterial(bannerLeft, 'images/banner-rules-v2.jpg')
    MeshCollider.setPlane(bannerLeft, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      { entity: bannerLeft, opts: { button: InputAction.IA_POINTER, hoverText: 'How scoring works' } },
      () => { playClick(); openProdeInfo() }
    )
  }

  if (bannerLeftPrize) {
    applyBannerMaterial(bannerLeftPrize, 'images/KickoffChallenge-Banner-Prizes.png')
  }

  if (bannerRightPrize) {
    applyBannerMaterial(bannerRightPrize, 'images/KickoffChallenge-Banner-Prizes.png')
  }

  if (leaderboard) {
    applyLeaderboardMaterial(leaderboard)
  }

  if (leaderboard2) {
    applyLeaderboardMaterial(leaderboard2)
  }
}

function applyBannerMaterial(entity: Entity, src: string) {
  MeshRenderer.setPlane(entity)
  Material.setBasicMaterial(entity, {
    texture: Material.Texture.Common({ src })
  })
}

function applyLeaderboardMaterial(entity: Entity) {
  MeshRenderer.setPlane(entity)
  Material.setBasicMaterial(entity, {
    diffuseColor: Color4.fromHexString('#08111cff')
  })
}

function buildWorld() {
  const groupPanelsZOffset = -2

  for (let i = 0; i < GROUPS.length; i++) {
    const left = i % 2 === 0
    const z = left ? 56 : 44                 // even groups (A,C,E…) on the player's LEFT, read left→right
    const x = 56 + Math.floor(i / 2) * 6
    const yaw = 90

    addProdePanel(i, {
      position: Vector3.create(x, 3, z + groupPanelsZOffset),
      rotation: Quaternion.fromEulerDegrees(0, yaw, 0),
      scale: Vector3.create(2.2, 2.2, 2.2)
    })
  }
}
