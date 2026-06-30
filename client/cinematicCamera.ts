import {
  engine,
  Transform,
  MainCamera,
  VirtualCamera,
  Entity,
  inputSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { hasSeenCinematicBefore, markCinematicSeen } from './prodeClient'

// ============================================
// CINEMATIC CAMERA — BRACKET REVEAL TOUR
// ============================================
// Flies from the entrance through the full bracket corridor (X=61→112),
// arriving at the far east end and doing a 180° sweep back across the layout.
// ============================================

export type CinematicState = 'idle' | 'playing' | 'skipping'

type CameraKeyframe = {
  position: Vector3
  lookAt: Vector3
  duration: number
}

// Tour path:
// 0 → Avatar spawn point — ground level, looking east [unchanged]
// 1 → Mid-corridor approach, rising [unchanged]
// 2 → Near R32-left panels (X≈61), camera breaks north toward the stands
// 3 → High up in the north bleachers — wide overhead view of the full bracket
// 4 → Horizontal dolly east across the stands, bracket below
// 5 → Far east end at the back panels [unchanged]
const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  {
    position: Vector3.create(-4.8, 4.1, 49.8),
    lookAt:   Vector3.create(10.1, 2.7, 49.1),
    duration: 2500
  },
  {
    position: Vector3.create(23.6, 5.3, 49.7),
    lookAt:   Vector3.create(50.2, 2.1, 49.4),
    duration: 2000
  },
  {
    position: Vector3.create(58, 11, 78),
    lookAt:   Vector3.create(86, 4, 47),
    duration: 2000
  },
  {
    position: Vector3.create(75, 17, 92),
    lookAt:   Vector3.create(86, 4, 47),
    duration: 2000
  },
  {
    position: Vector3.create(108, 16, 88),
    lookAt:   Vector3.create(86, 4, 47),
    duration: 2500
  },
  {
    position: Vector3.create(137, 10.3, 49.3),
    lookAt:   Vector3.create(122.7, 5.7, 48.8),
    duration: 2500
  }
]

const TOTAL_DURATION = CAMERA_KEYFRAMES.reduce((sum, kf) => sum + kf.duration, 0)

let cinematicState: CinematicState = 'idle'
let cinematicStartTime = 0
let cameraEntity: Entity | null = null
let hasPlayedOnce = false

// ── Hold-F-to-skip ──────────────────────────────────────────────────────────
// Only offered once the server confirms this wallet has seen the cinematic before —
// a first-time visitor always gets the full, uninterruptible tour.
const SKIP_HOLD_SECONDS = 1.1
const SKIP_DECAY_RATE   = 2.6   // releasing the key drains the ring faster than holding fills it
let skipHoldProgress = 0        // 0..1

// Mobile has no physical F key — the on-screen skip button reports its touch state here
// so the same hold/decay loop below drives both input methods.
let mobileSkipPressed = false
export function setMobileSkipPressed(pressed: boolean) {
  mobileSkipPressed = pressed
}

export function getSkipHoldProgress(): number {
  return skipHoldProgress
}

export function canSkipCinematic(): boolean {
  return cinematicState === 'playing' && hasSeenCinematicBefore()
}

export function getCinematicState(): CinematicState {
  return cinematicState
}

export function isCinematicPlaying(): boolean {
  return cinematicState === 'playing'
}

export function shouldAutoPlayCinematic(): boolean {
  return !hasPlayedOnce
}

export function playCinematic() {
  if (cinematicState === 'playing') return

  hasPlayedOnce = true
  skipHoldProgress = 0
  mobileSkipPressed = false

  // VirtualCamera requires the production DCL renderer; skip gracefully in local preview.
  if (!MainCamera.has(engine.CameraEntity)) {
    console.log('[Cinematic] MainCamera not available — skipping cinematic (local preview?)')
    return
  }

  cinematicState = 'playing'
  cinematicStartTime = Date.now()

  try {
    if (!cameraEntity) {
      cameraEntity = engine.addEntity()
      Transform.create(cameraEntity, {
        position: CAMERA_KEYFRAMES[0].position,
        rotation: lookAtRotation(CAMERA_KEYFRAMES[0].position, CAMERA_KEYFRAMES[0].lookAt)
      })
      VirtualCamera.create(cameraEntity, {
        defaultTransition: {
          transitionMode: VirtualCamera.Transition.Time(0.5)
        }
      })
    } else {
      const t = Transform.getMutable(cameraEntity)
      t.position = CAMERA_KEYFRAMES[0].position
      t.rotation = lookAtRotation(CAMERA_KEYFRAMES[0].position, CAMERA_KEYFRAMES[0].lookAt)
    }

    MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = cameraEntity
  } catch (e) {
    console.log('[Cinematic] VirtualCamera unavailable — skipping cinematic:', e)
    cinematicState = 'idle'
    if (cameraEntity) { engine.removeEntity(cameraEntity); cameraEntity = null }
  }
}

export function skipCinematic() {
  if (cinematicState !== 'playing') return

  cinematicState = 'skipping'
  skipHoldProgress = 0
  mobileSkipPressed = false
  markCinematicSeen()   // covers both a manual skip and a natural full playthrough

  if (MainCamera.has(engine.CameraEntity)) {
    MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = undefined
  }

  setTimeout(() => {
    cinematicState = 'idle'
  }, 100)
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec3(a: Vector3, b: Vector3, t: number): Vector3 {
  return Vector3.create(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t))
}

function getCurrentFrame(elapsed: number): { from: number; to: number; t: number } {
  let acc = 0
  for (let i = 0; i < CAMERA_KEYFRAMES.length - 1; i++) {
    const dur = CAMERA_KEYFRAMES[i].duration
    if (elapsed < acc + dur) {
      return { from: i, to: i + 1, t: (elapsed - acc) / dur }
    }
    acc += dur
  }
  const last = CAMERA_KEYFRAMES.length - 1
  return { from: last, to: last, t: 1 }
}

function lookAtRotation(from: Vector3, to: Vector3): Quaternion {
  const dir = Vector3.subtract(to, from)
  const len = Vector3.length(dir)
  if (len < 0.0001) return Quaternion.Identity()

  const n = Vector3.scale(dir, 1 / len)
  const pitch = Math.atan2(n.y, Math.sqrt(n.x * n.x + n.z * n.z))
  const yaw   = Math.atan2(n.x, n.z)
  return Quaternion.fromEulerDegrees(-(pitch * 180) / Math.PI, (yaw * 180) / Math.PI, 0)
}

// ── Main system ───────────────────────────────────────────────────────────────

export function setupCinematicSystem() {
  engine.addSystem(
    (dt: number) => {
      if (cinematicState !== 'playing') {
        if (skipHoldProgress !== 0) skipHoldProgress = 0
        return
      }
      if (!cameraEntity) return

      if (hasSeenCinematicBefore()) {
        if (inputSystem.isPressed(InputAction.IA_SECONDARY) || mobileSkipPressed) {
          skipHoldProgress = Math.min(1, skipHoldProgress + dt / SKIP_HOLD_SECONDS)
          if (skipHoldProgress >= 1) {
            skipCinematic()
            return
          }
        } else if (skipHoldProgress > 0) {
          skipHoldProgress = Math.max(0, skipHoldProgress - dt * SKIP_DECAY_RATE)
        }
      } else if (skipHoldProgress !== 0) {
        skipHoldProgress = 0
      }

      const elapsed = Date.now() - cinematicStartTime

      if (elapsed >= TOTAL_DURATION) {
        skipCinematic()
        return
      }

      const { from, to, t } = getCurrentFrame(elapsed)
      const pos    = lerpVec3(CAMERA_KEYFRAMES[from].position, CAMERA_KEYFRAMES[to].position, t)
      const lookAt = lerpVec3(CAMERA_KEYFRAMES[from].lookAt,   CAMERA_KEYFRAMES[to].lookAt,   t)

      const transform = Transform.getMutable(cameraEntity)
      transform.position = pos
      transform.rotation = lookAtRotation(pos, lookAt)
    },
    undefined,
    'cinematic-camera-system'
  )
}
