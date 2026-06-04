import { engine, Transform, AudioSource } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { startConfetti, isConfettiActive } from '../schedule/confetti'

const CROWD_SRC = 'sounds/vishiv-crowd-cheering-in-stadium-435357.mp3'

// Crowd audio that rises as the player advances through the tunnel toward the
// field. Player Z is mapped to volume so it's barely audible at the start and
// full near the ramp/field end.
const Z_START = 8
const Z_END = 58
const VOL_MIN = 0.05
const VOL_MAX = 1.0

export function setupCrowdAudio() {
  const crowd = engine.addEntity()
  Transform.create(crowd, { position: Vector3.create(32, 5, 60) })
  AudioSource.create(crowd, {
    audioClipUrl: CROWD_SRC,
    playing: true,
    loop: true,
    volume: VOL_MIN,
    global: true
  })

  engine.addSystem(() => {
    const p = getPlayer()
    if (!p?.position) return
    const t = clamp01((p.position.z - Z_START) / (Z_END - Z_START))
    AudioSource.getMutable(crowd).volume = VOL_MIN + t * (VOL_MAX - VOL_MIN)
  })
}

// Fires the confetti once when the player crests the ramp into the field,
// re-arming after they walk back down.
const FIELD_Z = 58
const FIELD_Y = 4.5

export function setupFieldTrigger() {
  let inField = false
  engine.addSystem(() => {
    const p = getPlayer()
    if (!p?.position) return
    const entered = p.position.z >= FIELD_Z && p.position.y >= FIELD_Y
    if (entered && !inField) {
      inField = true
      if (!isConfettiActive()) startConfetti()
    } else if (!entered && p.position.z < FIELD_Z - 8) {
      inField = false
    }
  })
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v }
