import {
  engine,
  Transform,
  MainCamera,
  VirtualCamera,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

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
// 0 → Avatar spawn point — ground level, looking east (matches scene.json cameraTarget)
// 1 → Establishing shot — rises, sweeps south-east toward bracket area
// 2 → Rising approach on field Z-center, bracket corridor in sight
// 3 → Inside corridor, slightly north, focusing on center SF/Final
// 4 → Far east end — looking back west at all bracket layers
// 5 → 180° reveal pulled further back — wide view of the full layout
// Positions are equally spaced on the straight line from spawn to final:
//   start (-4.8, 4.1, 49.8)  →  end (137, 10.3, 49.3)
//   t = 0, 0.2, 0.4, 0.6, 0.8, 1
// lookAt varies to highlight different parts of the bracket along the way.
const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  {
    position: Vector3.create(-4.8, 4.1, 49.8),
    lookAt:   Vector3.create(10.1, 2.7, 49.1),
    duration: 2500
  },
  {
    position: Vector3.create(23.6, 5.3, 49.7),
    lookAt:   Vector3.create(50.2, 2.1, 49.4),
    duration: 2500
  },
  {
    position: Vector3.create(51.9, 6.6, 49.6),
    lookAt:   Vector3.create(86, 4, 47),
    duration: 2000
  },
  {
    position: Vector3.create(80.3, 7.8, 49.5),
    lookAt:   Vector3.create(86, 4, 47),
    duration: 2000
  },
  {
    position: Vector3.create(108.6, 9.1, 49.4),
    lookAt:   Vector3.create(86, 4, 47),
    duration: 2000
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

  console.log('[Cinematic] Starting bracket reveal tour')
  cinematicState = 'playing'
  cinematicStartTime = Date.now()
  hasPlayedOnce = true

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
}

export function skipCinematic() {
  if (cinematicState !== 'playing') return

  console.log('[Cinematic] Skipping')
  cinematicState = 'skipping'

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
    () => {
      if (cinematicState !== 'playing') return
      if (!cameraEntity) return

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
