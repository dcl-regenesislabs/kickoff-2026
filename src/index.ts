import { addProdePanel, refreshAllPanels } from '../schedule/prodePanel'
import { setupProdeUi } from '../schedule/prodeUi'
import { DATES } from '../schedule/prodeData'
import { startProdeClient } from '../client/prodeClient'
import { setupCrowdAudio, setupFieldTrigger } from '../client/sceneEffects'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { engine, Transform } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'

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
  startProdeClient(refreshAllPanels)
}

function buildWorld() {
  for (let i = 0; i < DATES.length; i++) {
    const left = i % 2 === 0
    const z = left ? 44 : 56                 // north wall z=44 / south wall z=56, centered at spawn z≈50
    const x = 56 + Math.floor(i / 2) * 6     // x = 56 .. 104, spread along X
    const yaw = 90                            // all face west (+X) toward spawn at x≈10

    addProdePanel(i, {
      position: Vector3.create(x, 3, z),
      rotation: Quaternion.fromEulerDegrees(0, yaw, 0),
      scale: Vector3.create(2.2, 2.2, 2.2)
    })
  }
}
