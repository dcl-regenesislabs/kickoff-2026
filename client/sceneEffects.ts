import { engine, Transform, AudioSource } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { startConfetti, isConfettiActive } from '../schedule/confetti'

const CROWD_SRC = 'sounds/vishiv-crowd-cheering-in-stadium-435357.mp3'

// Crowd audio that rises as the player walks forward (+X) from spawn toward the
// stands. Player X is mapped to volume: barely audible at spawn (x≈X_START) and
// full from the goal line (x≈X_LOUD) onward.
const X_START = 10   // spawn — quietest
const X_LOUD  = 32   // goal line — crowd at full volume from here on
const VOL_MIN = 0.05
const VOL_MAX = 1.0

export function setupCrowdAudio() {
  const crowd = engine.addEntity()
  Transform.create(crowd, { position: Vector3.create(X_LOUD, 5, 32) })
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
    const t = clamp01((p.position.x - X_START) / (X_LOUD - X_START))
    AudioSource.getMutable(crowd).volume = VOL_MIN + t * (VOL_MAX - VOL_MIN)
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

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v }
