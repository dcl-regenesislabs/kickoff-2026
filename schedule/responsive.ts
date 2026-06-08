import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'

export { isMobile }

// Responsive layout scale, read fresh each render (React-ECS re-renders per frame,
// so resize / rotation adjusts automatically).
// UiCanvasInformation.width/height are virtual pixels (already pixel-ratio normalized).
// Base design space is 1920x1080; clamp the scale. On mobile the modals are tuned
// for desktop (large) and overflow the small screen, so shrink them to ~0.72 so a
// 1360-wide panel lands around half the width (like a mobile shop panel).
const MOBILE_FACTOR = 0.72
export function layoutScale(): number {
  const c = UiCanvasInformation.getOrNull(engine.RootEntity)
  const w = c?.width ?? 1920
  const h = c?.height ?? 1080
  let s = Math.min(w / 1920, h / 1080)
  s = Math.max(0.78, Math.min(1.12, s))
  if (isMobile()) s *= MOBILE_FACTOR
  return s
}
