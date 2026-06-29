import { addProdePanel, addKnockoutPanel, addPendingMatchesPanel, refreshAllPanels } from '../schedule/prodePanel'
import { setupProdeUi, openProdeInfo } from '../schedule/prodeUi'
import { GROUPS } from '../schedule/prodeData'
import { startProdeClient } from '../client/prodeClient'
import { initProdeLeaderboard } from '../client/prodeLeaderboard'
import { setupWearableSpin } from '../client/wearableDisplay'
import { setupBallClient } from '../client/ball'
import { setupCrowdAudio, setupFieldTrigger } from '../client/sceneEffects'
import { setupSfx, playClick } from '../client/sfx'
import { setupReflectors } from '../client/reflectors'
import { setupCinematicSystem } from '../client/cinematicCamera'
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
  setupCinematicSystem()
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
  setupBallClient()
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
  // const matchesPerGroup = GROUPS[0]?.matches.length ?? 6
  // for (let i = 0; i < GROUPS.length; i++) {
  //   const left = i % 2 === 0
  //   const z = left ? 56 : 44
  //   const x = 56 + Math.floor(i / 2) * 6
  //   const start = i * matchesPerGroup + 1
  //   const end = start + matchesPerGroup - 1
  //   addProdePanel(i, `${start}-${end}`, {
  //     position: Vector3.create(x, 3, z - 2),
  //     rotation: Quaternion.fromEulerDegrees(0, 90, 0),
  //     scale: Vector3.create(2.2, 2.2, 2.2)
  //   })
  // }

  buildKnockoutPanels()

  // Single board to vote the still-open group-stage matches, placed before the first
  // bracket line, on the lateral facing the field. TUNABLE — adjust pos/rotation.
  addPendingMatchesPanel({
    position: Vector3.create(50, 3, 77),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0),   // perpendicular to the bracket boards (face -Z)
    scale: Vector3.create(2.2, 2.2, 2.2)
  })
}

function buildKnockoutPanels() {
  const S = Vector3.create(2.2, 2.2, 2.2)
  const Y = 3
  const L = Quaternion.fromEulerDegrees(0, 90, 0)   // left side — face east
  const R = Quaternion.fromEulerDegrees(0, 270, 0)  // right side — face west

  // Adds a panel + its back-face twin at the same position with the opposite rotation.
  // Both copies reference the same slot so they always show identical data.
  // The GLTF stand doesn't z-fight because PANEL_OFFSET shifts it in local Z,
  // landing each copy on opposite sides of the root center.
  const addDouble = (label: string, match: string, round: string, slot: number, pos: Vector3, front: ReturnType<typeof Quaternion.fromEulerDegrees>, back: ReturnType<typeof Quaternion.fromEulerDegrees>) => {
    addKnockoutPanel(label, match, round, slot, { position: pos, rotation: front, scale: S })
    addKnockoutPanel(label, match, round, slot, { position: pos, rotation: back,  scale: S })
  }

  // ── ROUND OF 32 — LEFT (slots 0,2,4,6) ────────────────────────────────────
  addDouble('ROUND OF 32', 'MATCH 1-2',   '32', 0,  Vector3.create(61.05, Y, 70.65), L, R)
  addDouble('ROUND OF 32', 'MATCH 3-4',   '32', 2,  Vector3.create(61.05, Y, 55.55), L, R)
  addDouble('ROUND OF 32', 'MATCH 5-6',   '32', 4,  Vector3.create(61.05, Y, 39.55), L, R)
  addDouble('ROUND OF 32', 'MATCH 7-8',   '32', 6,  Vector3.create(61.05, Y, 24.45), L, R)

  // ── ROUND OF 16 — LEFT (slots 0,2) ────────────────────────────────────────
  addDouble('ROUND OF 16', 'MATCH 17-18', '16', 0,  Vector3.create(69.05, Y, 63.15), L, R)
  addDouble('ROUND OF 16', 'MATCH 19-20', '16', 2,  Vector3.create(69.15, Y, 32.05), L, R)

  // ── QUARTER FINAL — LEFT (slot 0) ─────────────────────────────────────────
  addDouble('QUARTER FINAL', 'MATCH 25-26', '8', 0, Vector3.create(76.15, Y, 48.05), L, R)

  // ── SEMI FINAL — center, back faces south (excluded: FINAL / 3RD) ─────────
  const FINAL_ROT       = Quaternion.fromEulerDegrees(0, 180, 0)
  const FINAL_ROT_BACK  = Quaternion.fromEulerDegrees(0, 0, 0)
  const THIRD_PLACE_ROT = Quaternion.fromEulerDegrees(0, 0, 0)
  const FINAL_POS       = Vector3.create(86.46, Y, 55.10)
  const THIRD_PLACE_POS = Vector3.create(86.46, Y, 39.78)
  addDouble('SEMI FINAL', 'MATCH 29-30', '4', 0, FINAL_POS, FINAL_ROT, FINAL_ROT_BACK)
  addKnockoutPanel('FINAL / 3RD', 'MATCH 31-32', '2', 0, { position: THIRD_PLACE_POS, rotation: THIRD_PLACE_ROT, scale: S })

  // ── QUARTER FINAL — RIGHT (slot 2) ────────────────────────────────────────
  addDouble('QUARTER FINAL', 'MATCH 27-28', '8', 2, Vector3.create(96.76, Y, 47.22),  R, L)

  // ── ROUND OF 16 — RIGHT (slots 4,6) ───────────────────────────────────────
  addDouble('ROUND OF 16', 'MATCH 21-22', '16', 4, Vector3.create(103.86, Y, 63.00), R, L)
  addDouble('ROUND OF 16', 'MATCH 23-24', '16', 6, Vector3.create(103.86, Y, 32.12), R, L)

  // ── ROUND OF 32 — RIGHT (slots 8,10,12,14) ────────────────────────────────
  addDouble('ROUND OF 32', 'MATCH 9-10',  '32', 8,  Vector3.create(111.86, Y, 70.82), R, L)
  addDouble('ROUND OF 32', 'MATCH 11-12', '32', 10, Vector3.create(111.86, Y, 55.72), R, L)
  addDouble('ROUND OF 32', 'MATCH 13-14', '32', 12, Vector3.create(111.86, Y, 39.72), R, L)
  addDouble('ROUND OF 32', 'MATCH 15-16', '32', 14, Vector3.create(111.86, Y, 24.62), R, L)
}
