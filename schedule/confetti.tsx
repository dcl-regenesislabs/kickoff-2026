import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

// ── 2D confetti overlay — falling pieces in screen space ──────────────────────
// UiTransform has no rotation, so each piece fakes a tumble by oscillating its
// width while it falls. Positions are in % of the screen.
type Piece = { x: number; y: number; vy: number; vx: number; phase: number; w: number; color: Color4 }

const N = 60
const DURATION = 15 // seconds
const COLORS = [
  Color4.fromHexString('#18A187ff'),     // teal
  Color4.create(0.98, 0.17, 0.33, 1),    // bordo/pink
  Color4.fromHexString('#F2C037ff'),     // yellow
  Color4.White(),
  Color4.fromHexString('#4D7BFFff')      // blue
]

let pieces: Piece[] = []
let active = false
let elapsed = 0

export function isConfettiActive() { return active }

export function startConfetti() {
  pieces = Array.from({ length: N }, (_, i) => ({
    x:     (i * 37) % 100,                 // spread across width (deterministic)
    y:     -((i * 17) % 40),               // staggered above the top
    vy:    25 + ((i * 13) % 35),           // %/sec downward
    vx:    (((i * 7) % 10) - 5),           // slight horizontal drift
    phase: (i % 8) * 0.8,
    w:     8 + ((i * 5) % 8),
    color: COLORS[i % COLORS.length]
  }))
  active = true
  elapsed = 0
}

export function stopConfetti() { active = false; pieces = [] }

// Register once (from setupProdeUi).
export function setupConfettiSystem() {
  engine.addSystem((dt: number) => {
    if (!active) return
    elapsed += dt
    for (const p of pieces) {
      p.y += p.vy * dt
      p.x += p.vx * dt
      p.phase += dt * 6
      if (p.y > 110) { p.y = -10 }         // recycle while active
    }
    if (elapsed >= DURATION) stopConfetti()
  })
}

// Mounted inside the main UI tree.
export const ConfettiOverlay = () => {
  if (!active) return null
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}>
      {pieces.map((p, i) => (
        <UiEntity
          key={i}
          uiTransform={{
            positionType: 'absolute',
            position: { top: `${p.y}%`, left: `${p.x}%` },
            width: Math.max(2, Math.abs(Math.cos(p.phase)) * p.w),
            height: 12
          }}
          uiBackground={{ color: p.color }}
        />
      ))}
    </UiEntity>
  )
}
