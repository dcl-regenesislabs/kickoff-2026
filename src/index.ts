import { addProdePanel, addKnockoutPanel, refreshAllPanels } from '../schedule/prodePanel'
import { setupProdeUi, openProdeInfo } from '../schedule/prodeUi'
import { GROUPS } from '../schedule/prodeData'
import { startProdeClient } from '../client/prodeClient'
import { initProdeLeaderboard } from '../client/prodeLeaderboard'
import { setupWearableSpin } from '../client/wearableDisplay'
import { setupCrowdAudio, setupFieldTrigger } from '../client/sceneEffects'
import { setupSfx, playClick } from '../client/sfx'
import { setupReflectors } from '../client/reflectors'
import { Portal } from './portal'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import {
  engine, Entity, MeshRenderer, MeshCollider, Material,
  ColliderLayer, pointerEventsSystem, InputAction
} from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { changeRealm, openExternalUrl } from '~system/RestrictedActions'
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
  setupKapuPortal()
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
      { entity: bannerLeft, opts: { button: InputAction.IA_POINTER, hoverText: 'Terms & Conditions' } },
      () => {
        playClick()
        void openExternalUrl({
          url: 'https://confirmed-copper-f3a.notion.site/DCL-Kickoff-Challenge-Terms-Conditions-3755f96e0b70801f8c6ff1ddf0139d7b'
        })
      }
    )
  }

  if (bannerLeftPrize) {
    applyBannerMaterial(bannerLeftPrize, 'images/kickoffchallenge-banner-prizes.png')
    MeshCollider.setPlane(bannerLeftPrize, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      { entity: bannerLeftPrize, opts: { button: InputAction.IA_POINTER, hoverText: 'How scoring works' } },
      () => { playClick(); openProdeInfo() }
    )
  }

  if (bannerRightPrize) {
    applyBannerMaterial(bannerRightPrize, 'images/kickoffchallenge-banner-prizes.png')
    MeshCollider.setPlane(bannerRightPrize, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      { entity: bannerRightPrize, opts: { button: InputAction.IA_POINTER, hoverText: 'How scoring works' } },
      () => { playClick(); openProdeInfo() }
    )
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

function setupKapuPortal() {
  new Portal({
    position: {
      x: 35.3,
      y: 0,
      z: 15.3
    },
    rotation: { x: 0, y: 180, z: 0 },
    size: 0.75,
    hoverText: 'Go to Goal Legends',
    onActivate: () => {
      void changeRealm({
        realm: 'goallegends.dcl.eth',
        message: 'Go to goallegends.dcl.eth?'
      })
    }
  })
}

function buildWorld() {
  // Group stage panels — hidden while knockout layout is active
  // for (let i = 0; i < GROUPS.length; i++) {
  //   const left = i % 2 === 0
  //   const z = left ? 56 : 44
  //   const x = 56 + Math.floor(i / 2) * 6
  //   addProdePanel(i, {
  //     position: Vector3.create(x, 3, z - 2),
  //     rotation: Quaternion.fromEulerDegrees(0, 90, 0),
  //     scale: Vector3.create(2.2, 2.2, 2.2)
  //   })
  // }

  buildKnockoutPanels()
}

function buildKnockoutPanels() {
  const S = Vector3.create(2.2, 2.2, 2.2)
  const Y = 3
  const L = Quaternion.fromEulerDegrees(0, 90, 0)   // left side — face east
  const R = Quaternion.fromEulerDegrees(0, 270, 0)  // right side — face west

  // ── R16 — LEFT (small brackets, x=61) ─────────────────────────────────────
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(61.05, Y, 70.65), rotation: L, scale: S })
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(61.05, Y, 55.55), rotation: L, scale: S })
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(61.05, Y, 39.55), rotation: L, scale: S })
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(61.05, Y, 24.45), rotation: L, scale: S })

  // ── QF — LEFT (medium brackets, x=69) ─────────────────────────────────────
  addKnockoutPanel('QUARTER FINAL', { position: Vector3.create(69.05, Y, 63.15), rotation: L, scale: S })
  addKnockoutPanel('QUARTER FINAL', { position: Vector3.create(69.15, Y, 32.05), rotation: L, scale: S })

  // ── SF — LEFT (large bracket, x=76) ───────────────────────────────────────
  addKnockoutPanel('SEMI FINAL', { position: Vector3.create(76.15, Y, 48.05), rotation: L, scale: S })

  // ── FINAL — center (double-sided, perpendicular to rest) ─────────────────
  const FINAL_ROT = Quaternion.fromEulerDegrees(0, 180, 0)
  const THIRD_PLACE_ROT = Quaternion.fromEulerDegrees(0, 0, 0)
  const FINAL_POS = Vector3.create(86.46, Y, 55.10)
  const THIRD_PLACE_POS = Vector3.create(86.46, Y, 39.78)
  addKnockoutPanel('FINAL', { position: FINAL_POS, rotation: FINAL_ROT, scale: S })
  addKnockoutPanel('THIRD PLACE', { position: THIRD_PLACE_POS, rotation: THIRD_PLACE_ROT, scale: S })

  // ── SF — RIGHT (large bracket, x=97) ──────────────────────────────────────
  addKnockoutPanel('SEMI FINAL', { position: Vector3.create(96.76, Y, 47.22), rotation: R, scale: S })

  // ── QF — RIGHT (medium brackets, x=104) ───────────────────────────────────
  addKnockoutPanel('QUARTER FINAL', { position: Vector3.create(103.86, Y, 63.00), rotation: R, scale: S })
  addKnockoutPanel('QUARTER FINAL', { position: Vector3.create(103.86, Y, 32.12), rotation: R, scale: S })

  // ── R16 — RIGHT (small brackets, x=112) ───────────────────────────────────
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(111.86, Y, 70.82), rotation: R, scale: S })
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(111.86, Y, 55.72), rotation: R, scale: S })
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(111.86, Y, 39.72), rotation: R, scale: S })
  addKnockoutPanel('ROUND OF 16', { position: Vector3.create(111.86, Y, 24.62), rotation: R, scale: S })
}
