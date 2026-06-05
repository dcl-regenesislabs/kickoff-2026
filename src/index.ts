import { addProdePanel, refreshAllPanels } from '../schedule/prodePanel'
import { setupProdeUi } from '../schedule/prodeUi'
import { DATES } from '../schedule/prodeData'
import { startProdeClient } from '../client/prodeClient'
import { initProdeLeaderboard } from '../client/prodeLeaderboard'
import { setupCrowdAudio, setupFieldTrigger } from '../client/sceneEffects'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { engine, Transform, GltfContainer, MeshRenderer, MeshCollider, Material } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { Color4 } from '@dcl/sdk/math'

export async function main() {
  // On the authoritative server: only run persistence logic, no visuals.
  if (isServer()) {
    const { startProdeServer } = await import('../server/prodeServer')
    startProdeServer()
    return
  }

  buildWorld()
  setupProdeUi()
  setupCrowdAudio()
  setupFieldTrigger()
  // Leaderboard board standing at the field end, facing players up the tunnel.
  initProdeLeaderboard({
    position: Vector3.create(32, 7, 63),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    size: Vector3.create(5, 7, 1)
  })
  startProdeClient(refreshAllPanels)
}

function buildWorld() {
  // Ramp — from z=10 (y=0) to z=60 (y=5)
  // dZ=50, dY=5 → angle=5.71°, length≈50.25m, center at (32, 2.5, 35)
  const ramp = engine.addEntity()
  Transform.create(ramp, {
    position: Vector3.create(32, 2.5, 35),
    rotation: Quaternion.fromEulerDegrees(-5.71, 0, 0),
    scale: Vector3.create(10, 0.3, 50.25)
  })
  MeshRenderer.setBox(ramp)
  MeshCollider.setBox(ramp)
  Material.setPbrMaterial(ramp, { albedoColor: Color4.create(0.55, 0.45, 0.35, 1) })

  // Stadium model
  const stadium = engine.addEntity()
  Transform.create(stadium, {
    position: Vector3.create(32, 5, 64),
    scale: Vector3.create(0.01, 0.01, 0.01)
  })
  GltfContainer.create(stadium, { src: 'models/modern_stadium.glb' })

  // 18 panels, alternating left/right in date order so
  // the player passes them one by one walking toward the ramp.
  for (let i = 0; i < DATES.length; i++) {
    const left = i % 2 === 0
    const x = left ? 26 : 38                 // left wall x=26 / right wall x=38
    const z = 10 + Math.floor(i / 2) * 6     // z = 10 .. 58, one row per pair
    const yaw = left ? 90 : -90              // face the corridor center

    addProdePanel(i, {
      position: Vector3.create(x, 3, z),
      rotation: Quaternion.fromEulerDegrees(0, yaw, 0),
      scale: Vector3.create(2.2, 2.2, 2.2)
    })
  }
}
