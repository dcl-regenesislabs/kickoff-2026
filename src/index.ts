import { addProdePanel, refreshAllPanels } from '../schedule/prodePanel'
import { setupProdeUi, openProdeInfo } from '../schedule/prodeUi'
import { GROUPS } from '../schedule/prodeData'
import { startProdeClient } from '../client/prodeClient'
import { initProdeLeaderboard } from '../client/prodeLeaderboard'
import { setupWearableSpin } from '../client/wearableDisplay'
import { setupCrowdAudio, setupFieldTrigger } from '../client/sceneEffects'
import { setupSfx, playClick } from '../client/sfx'
import { setupReflectors } from '../client/reflectors'
import { Vector3, Quaternion, Color3 } from '@dcl/sdk/math'
import {
  engine, Transform, MeshRenderer, MeshCollider, Material,
  ColliderLayer, pointerEventsSystem, InputAction
} from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'

export async function main() {
  // On the authoritative server: only run persistence logic, no visuals.
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
  // Leaderboard greets the player at spawn — placed straight ahead in their line
  // of sight (spawn ≈ x7,z50 looking toward cameraTarget x32,z47), facing back
  // toward spawn (-X).
  initProdeLeaderboard({
    position: Vector3.create(28, 3.5, 47.25),
    rotation: Quaternion.fromEulerDegrees(0, 90, 0),
    size: Vector3.create(5, 7, 1)
  })
  buildBanner()
  setupReflectors()
  // Prize wearable (placed from the Creator Hub) — just spin it in place.
  setupWearableSpin()
  startProdeClient(refreshAllPanels)
}

// Banner planes flanking the leaderboard, each keeping its image aspect ratio.
// The instructions banner (banner2) is clickable and opens the scoring info UI.
function buildBanner() {
  // Same height, each width derived from its own image so neither is distorted.
  const BANNER_H = 8.6
  const wPlain   = BANNER_H * (1080 / 1920)   // Banner.png
  const wRules   = BANNER_H * (1536 / 2752)   // Banner-Rules.png
  const LB_Z     = 47.25   // leaderboard center (along its width axis)
  const LB_HALF  = 2.5     // leaderboard half-width (size 5 / 2)
  const MARGIN   = 1.5     // gap between the leaderboard and each banner

  // Right side — plain banner
  makeBanner('images/Banner.png',       LB_Z + LB_HALF + MARGIN + wPlain / 2, wPlain, BANNER_H, false)

  // Left side — rules banner, clickable
  makeBanner('images/Banner-Rules.png', LB_Z - LB_HALF - MARGIN - wRules / 2, wRules, BANNER_H, true)
}

function makeBanner(src: string, z: number, w: number, h: number, clickable: boolean) {
  const banner = engine.addEntity()
  Transform.create(banner, {
    position: Vector3.create(28, 3.5, z),
    rotation: Quaternion.fromEulerDegrees(0, 90, 0),
    scale: Vector3.create(w, h, 1)
  })
  MeshRenderer.setPlane(banner)
  // Emissive PBR so the banner is self-lit (bright and vivid even in dim lighting).
  Material.setPbrMaterial(banner, {
    texture:          Material.Texture.Common({ src }),
    emissiveTexture:  Material.Texture.Common({ src }),
    emissiveColor:    Color3.White(),
    emissiveIntensity: 1.6,
    roughness: 1,
    metallic: 0,
    specularIntensity: 0
  })
  if (clickable) {
    MeshCollider.setPlane(banner, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      { entity: banner, opts: { button: InputAction.IA_POINTER, hoverText: 'How points work' } },
      () => { playClick(); openProdeInfo() }
    )
  }
}

function buildWorld() {
  // One board per group (12), each holding its 6 round-robin matches.
  // World layout/positioning maintained by the 3D team.
  for (let i = 0; i < GROUPS.length; i++) {
    const left = i % 2 === 0
    const z = left ? 44 : 56                 // north wall z=44 / south wall z=56, centered at spawn z≈50
    const x = 56 + Math.floor(i / 2) * 6     // x = 56 .. 86, spread along X (6 per side)
    const yaw = 90                            // all face west (+X) toward spawn at x≈10

    addProdePanel(i, {
      position: Vector3.create(x, 3, z),
      rotation: Quaternion.fromEulerDegrees(0, yaw, 0),
      scale: Vector3.create(2.2, 2.2, 2.2)
    })
  }
}
