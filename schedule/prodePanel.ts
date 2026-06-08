import {
  engine, Transform, MeshRenderer, MeshCollider,
  Material, TextShape, TextAlignMode, ColliderLayer,
  VisibilityComponent, pointerEventsSystem, InputAction,
  GltfContainer, TransformTypeWithOptionals
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { GROUPS, predictions, isGroupComplete } from './prodeData'
import { openGroupForm } from './prodeUi'
import { playClick } from '../client/sfx'

// ── Colors — shared with the 2D UI (prodeUi.tsx) ──────────────────────────────
const ACCENT       = Color4.fromHexString('#18A187ff')
const WHITE        = Color4.White()
const VIOLET       = Color4.fromHexString('#9f78e7ff')   // progress fill
const VIOLET_TRACK = Color4.fromHexString('#3a2d5cff')   // progress track

// StadiumPanel.glb raw bbox: x[-4.876,4.876] y[-0.084,8.46] z[2.476,2.928].
// Scale it to ~2.6 wide in root-local (matching the old plane footprint) and
// offset so the model's center sits at the root origin — both the geometry and
// this offset scale with root, so it stays put at any root scale.
const PANEL_MODEL  = 'assets/scene/Models/StadiumPanel/StadiumPanel.glb'
const PANEL_CS     = 2.6 / 9.753                                  // ≈ 0.2666 uniform scale
const PANEL_OFFSET = Vector3.create(
  0,
  -((-0.084 + 8.46) / 2) * PANEL_CS,                              // center Y → origin
  -((2.476 + 2.928) / 2) * PANEL_CS                               // center Z → origin
)
const FRONT_Z = -0.10                                             // overlay text in front of the slab

// ── One clickable board per group — opens the 2D group form ───────────────────
export function addProdePanel(groupIndex: number, transform: TransformTypeWithOptionals) {
  const g = GROUPS[groupIndex]
  if (!g) return

  const root = engine.addEntity()
  Transform.createOrReplace(root, transform)

  // Stadium panel model — the visual body of the board.
  const panel = engine.addEntity()
  Transform.createOrReplace(panel, {
    position: PANEL_OFFSET,
    scale: Vector3.create(PANEL_CS, PANEL_CS, PANEL_CS),
    parent: root
  })
  GltfContainer.create(panel, { src: PANEL_MODEL })

  // Invisible click surface over the board face — the whole board opens the form.
  const clicker = engine.addEntity()
  Transform.createOrReplace(clicker, {
    position: Vector3.create(0, 0, FRONT_Z),
    scale: Vector3.create(2.6, 2.3, 1),
    parent: root
  })
  MeshCollider.setPlane(clicker, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: clicker, opts: { button: InputAction.IA_POINTER, hoverText: `Open ${g.name}`, showHighlight: false } },
    () => { playClick(); openGroupForm(groupIndex, () => refresh()) }
  )

  // Group name (static)
  const nameLbl = engine.addEntity()
  Transform.createOrReplace(nameLbl, { position: Vector3.create(0, 0.92, FRONT_Z), parent: root })
  TextShape.createOrReplace(nameLbl, {
    text: g.name, fontSize: 1.1, textColor: ACCENT,
    outlineColor: ACCENT, outlineWidth: 0.1, textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // Progress counter (e.g. "3 / 6 predicted")
  const progLbl = engine.addEntity()
  Transform.createOrReplace(progLbl, { position: Vector3.create(0, 0.42, FRONT_Z), parent: root })
  TextShape.createOrReplace(progLbl, {
    text: '', fontSize: 0.62, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // Progress bar — track + left-anchored fill
  const PROG_W = 2.1
  const progTrack = engine.addEntity()
  Transform.createOrReplace(progTrack, {
    position: Vector3.create(0, 0.1, FRONT_Z), scale: Vector3.create(PROG_W, 0.12, 1), parent: root
  })
  MeshRenderer.setPlane(progTrack)
  Material.setBasicMaterial(progTrack, { diffuseColor: VIOLET_TRACK })

  const progFill = engine.addEntity()
  Transform.createOrReplace(progFill, {
    position: Vector3.create(-PROG_W / 2, 0.1, FRONT_Z - 0.005), scale: Vector3.create(0.001, 0.12, 1), parent: root
  })
  MeshRenderer.setPlane(progFill)
  Material.setBasicMaterial(progFill, { diffuseColor: VIOLET })
  VisibilityComponent.createOrReplace(progFill, { visible: false })

  // Group flags — one little flag per team in the group
  const flagXs = [-0.9, -0.3, 0.3, 0.9]
  g.flags.forEach((src, i) => {
    const flag = engine.addEntity()
    Transform.createOrReplace(flag, {
      position: Vector3.create(flagXs[i] ?? 0, -0.18, FRONT_Z),
      scale: Vector3.create(0.5, 0.33, 1),
      parent: root
    })
    MeshRenderer.setPlane(flag)
    Material.setBasicMaterial(flag, {
      texture: Material.Texture.Common({ src })
    })
  })

  // Call-to-action hint (turns into a completed message)
  const hint = engine.addEntity()
  Transform.createOrReplace(hint, { position: Vector3.create(0, -0.55, FRONT_Z), parent: root })
  TextShape.createOrReplace(hint, {
    text: 'Click to predict', fontSize: 0.7, textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // ── Refresh — progress counter, bar and completion state ────────────────────
  function refresh() {
    const done  = g.matches.filter(m => predictions.find(p => p.matchId === m.id)?.submitted ?? false).length
    const total = g.matches.length
    const complete = isGroupComplete(groupIndex)

    TextShape.getMutable(progLbl).text = `${done} / ${total} predicted`

    const hintTs = TextShape.getMutable(hint)
    hintTs.text      = complete ? 'Group complete!' : 'Click to predict'
    hintTs.textColor = complete ? ACCENT : WHITE

    const fw = PROG_W * (total > 0 ? done / total : 0)
    VisibilityComponent.getMutable(progFill).visible = fw > 0.001
    Transform.getMutable(progFill).scale    = Vector3.create(Math.max(fw, 0.001), 0.12, 1)
    Transform.getMutable(progFill).position = Vector3.create(-PROG_W / 2 + fw / 2, 0.1, FRONT_Z - 0.005)
  }

  refresh()
  panelRefreshers.push(refresh)
}

// ── Refresh registry — re-render every board after a server snapshot ──────────
const panelRefreshers: Array<() => void> = []
export function refreshAllPanels() { for (const r of panelRefreshers) r() }
