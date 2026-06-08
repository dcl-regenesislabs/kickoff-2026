import { engine, Transform, AudioSource } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { startConfetti, isConfettiActive } from '../schedule/confetti'

const CROWD_SRC = 'sounds/vishiv-crowd-cheering-in-stadium-435357.mp3'

// Crowd audio — always playing at a constant, gentle volume (no position ramp).
const CROWD_VOLUME = 0.15   // soft background

export function setupCrowdAudio() {
  const crowd = engine.addEntity()
  Transform.create(crowd, { position: Vector3.create(32, 5, 32) })
  AudioSource.create(crowd, {
    audioClipUrl: CROWD_SRC,
    playing: true,
    loop: true,
    volume: CROWD_VOLUME,
    global: true
  })
}

// Fires the confetti once when the player crosses the goal line (x ≥ LINE_X)
// walking forward from spawn, re-arming after they walk back past it.
const LINE_X = 32
const REARM_MARGIN = 8   // step back past x≈24 to re-arm the trigger

export function setupFieldTrigger() {
  let crossed = false
  engine.addSystem(() => {
    const p = getPlayer()
    if (!p?.position) return
    const past = p.position.x >= LINE_X
    if (past && !crossed) {
      crossed = true
      if (!isConfettiActive()) startConfetti()
    } else if (!past && p.position.x < LINE_X - REARM_MARGIN) {
      crossed = false
    }
  })
}
