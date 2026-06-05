import {
  engine, Entity, Transform, MeshRenderer, MeshCollider,
  Material, TextShape, TextAlignMode, ColliderLayer,
  VisibilityComponent, pointerEventsSystem, InputAction,
  TransformTypeWithOptionals
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { DATES, predictions, isDateComplete } from './prodeData'
import { openPredictionForm } from './prodeUi'

// ── Colors — shared with the 2D UI (prodeUi.tsx) ──────────────────────────────
const TEAL     = Color4.fromHexString('#18A187ff')       // teal text accent
const PRIMARY  = Color4.create(0.98, 0.17, 0.33, 1)      // DCL primary button (bordo/pink)
const DARK     = Color4.create(0.08, 0.08, 0.2, 0.97)    // main background
const DARK_BTN = Color4.create(0.15, 0.15, 0.32, 1)      // header / secondary button

const BG           = DARK
const BG_COMPLETE  = Color4.fromHexString('#0d2a1aff')   // dark green when done
const HEADER_BG    = DARK_BTN
const HDR_COMPLETE = Color4.fromHexString('#0f3a22ff')
const ACCENT    = TEAL
const WHITE     = Color4.White()
const GRAY      = DARK_BTN
const BTN       = PRIMARY

// ── One panel per date — no date navigation, only match sub-nav ───────────────
export function addProdePanel(dateGroupIndex: number, transform: TransformTypeWithOptionals) {
  const dg = DATES[dateGroupIndex]
  if (!dg) return

  let currentMatchIndex = 0

  const root = engine.addEntity()
  Transform.createOrReplace(root, transform)

  // Background
  const bg = engine.addEntity()
  Transform.createOrReplace(bg, {
    position: Vector3.create(0, 0, 0.01),
    scale: Vector3.create(2.6, 2.3, 1),
    parent: root
  })
  MeshRenderer.setPlane(bg)
  Material.setBasicMaterial(bg, { diffuseColor: BG })

  // Header bar
  const hdr = engine.addEntity()
  Transform.createOrReplace(hdr, {
    position: Vector3.create(0, 0.95, 0),
    scale: Vector3.create(2.6, 0.28, 1),
    parent: root
  })
  MeshRenderer.setPlane(hdr)
  Material.setBasicMaterial(hdr, { diffuseColor: HEADER_BG })

  // Date (static — never changes for this panel)
  const dateLbl = engine.addEntity()
  Transform.createOrReplace(dateLbl, {
    position: Vector3.create(0, 0.95, -0.005),
    parent: root
  })
  TextShape.createOrReplace(dateLbl, {
    text: dg.date,
    fontSize: 0.95,
    textColor: ACCENT,
    outlineColor: ACCENT,
    outlineWidth: 0.1,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // Group label (dynamic)
  const groupLbl = engine.addEntity()
  Transform.createOrReplace(groupLbl, {
    position: Vector3.create(0, 0.72, -0.005),
    parent: root
  })
  TextShape.createOrReplace(groupLbl, {
    text: '',
    fontSize: 0.6,
    textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // Time
  const timeLbl = engine.addEntity()
  Transform.createOrReplace(timeLbl, {
    position: Vector3.create(0, 0.52, -0.005),
    parent: root
  })
  TextShape.createOrReplace(timeLbl, {
    text: '',
    fontSize: 0.7,
    textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // Flag 1
  const flag1 = engine.addEntity()
  Transform.createOrReplace(flag1, {
    position: Vector3.create(-0.72, 0.12, 0),
    scale: Vector3.create(0.6, 0.4, 1),
    parent: root
  })
  MeshRenderer.setPlane(flag1)

  // Name 1
  const name1 = engine.addEntity()
  Transform.createOrReplace(name1, {
    position: Vector3.create(-0.72, -0.16, -0.005),
    parent: root
  })
  TextShape.createOrReplace(name1, {
    text: '',
    fontSize: 0.6,
    textColor: WHITE,
    outlineColor: WHITE,
    outlineWidth: 0.1,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // VS
  const vs = engine.addEntity()
  Transform.createOrReplace(vs, {
    position: Vector3.create(0, 0.12, -0.005),
    parent: root
  })
  TextShape.createOrReplace(vs, {
    text: 'VS',
    fontSize: 1.1,
    textColor: ACCENT,
    outlineColor: ACCENT,
    outlineWidth: 0.15,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // Flag 2
  const flag2 = engine.addEntity()
  Transform.createOrReplace(flag2, {
    position: Vector3.create(0.72, 0.12, 0),
    scale: Vector3.create(0.6, 0.4, 1),
    parent: root
  })
  MeshRenderer.setPlane(flag2)

  // Name 2
  const name2 = engine.addEntity()
  Transform.createOrReplace(name2, {
    position: Vector3.create(0.72, -0.16, -0.005),
    parent: root
  })
  TextShape.createOrReplace(name2, {
    text: '',
    fontSize: 0.6,
    textColor: WHITE,
    outlineColor: WHITE,
    outlineWidth: 0.1,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // Pronóstico button
  const pronoBtn = engine.addEntity()
  Transform.createOrReplace(pronoBtn, {
    position: Vector3.create(0, -0.42, 0),
    scale: Vector3.create(1.0, 0.22, 1),
    parent: root
  })
  MeshRenderer.setPlane(pronoBtn)
  MeshCollider.setPlane(pronoBtn, ColliderLayer.CL_POINTER)
  Material.setBasicMaterial(pronoBtn, { diffuseColor: BTN })

  const pronoBtnTxt = engine.addEntity()
  Transform.createOrReplace(pronoBtnTxt, {
    position: Vector3.create(0, -0.42, -0.005),
    parent: root
  })
  TextShape.createOrReplace(pronoBtnTxt, {
    text: 'LOAD PREDICTION',
    fontSize: 0.6,
    textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  pointerEventsSystem.onPointerDown(
    { entity: pronoBtn, opts: { button: InputAction.IA_POINTER, hoverText: 'Load prediction', showHighlight: false } },
    () => {
      const match = dg.matches[currentMatchIndex]
      openPredictionForm(match.id, () => refresh())
    }
  )

  // Submitted label
  const submittedLbl = engine.addEntity()
  Transform.createOrReplace(submittedLbl, {
    position: Vector3.create(0, -0.65, -0.005),
    parent: root
  })
  TextShape.createOrReplace(submittedLbl, {
    text: 'Prediction saved',
    fontSize: 0.5,
    textColor: ACCENT,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  VisibilityComponent.createOrReplace(submittedLbl, { visible: false })

  // Match sub-navigation (only for dates with 2+ matches)
  const prevMatchBtn = makeBtn(root, -0.45, -0.82, GRAY)
  const prevMatchLbl = makeLbl(root, -0.45, -0.82, '<')
  pointerEventsSystem.onPointerDown(
    { entity: prevMatchBtn, opts: { button: InputAction.IA_POINTER, hoverText: 'Previous match', showHighlight: false } },
    () => { if (currentMatchIndex > 0) { currentMatchIndex--; refresh() } }
  )

  const nextMatchBtn = makeBtn(root, 0.45, -0.82, GRAY)
  const nextMatchLbl = makeLbl(root, 0.45, -0.82, '>')
  pointerEventsSystem.onPointerDown(
    { entity: nextMatchBtn, opts: { button: InputAction.IA_POINTER, hoverText: 'Next match', showHighlight: false } },
    () => {
      if (currentMatchIndex < dg.matches.length - 1) { currentMatchIndex++; refresh() }
    }
  )

  // ── Refresh ────────────────────────────────────────────────────────────────
  function refresh() {
    const match    = dg.matches[currentMatchIndex]
    const multi    = dg.matches.length > 1
    const complete = isDateComplete(dateGroupIndex)

    // Panel tint: green when date is fully predicted
    Material.setBasicMaterial(bg,  { diffuseColor: complete ? BG_COMPLETE  : BG })
    Material.setBasicMaterial(hdr, { diffuseColor: complete ? HDR_COMPLETE : HEADER_BG })

    TextShape.getMutable(groupLbl).text = match.group
    TextShape.getMutable(timeLbl).text  = match.time
    TextShape.getMutable(name1).text    = match.team1
    TextShape.getMutable(name2).text    = match.team2

    Material.setBasicMaterial(flag1, {
      texture:      Material.Texture.Common({ src: match.flag1 }),
      alphaTexture: Material.Texture.Common({ src: match.flag1 })
    })
    Material.setBasicMaterial(flag2, {
      texture:      Material.Texture.Common({ src: match.flag2 }),
      alphaTexture: Material.Texture.Common({ src: match.flag2 })
    })

    const pred = predictions.find(p => p.matchId === match.id)
    VisibilityComponent.getMutable(submittedLbl).visible = pred?.submitted ?? false

    VisibilityComponent.createOrReplace(prevMatchBtn, { visible: multi && currentMatchIndex > 0 })
    VisibilityComponent.createOrReplace(prevMatchLbl, { visible: multi && currentMatchIndex > 0 })
    VisibilityComponent.createOrReplace(nextMatchBtn, { visible: multi && currentMatchIndex < dg.matches.length - 1 })
    VisibilityComponent.createOrReplace(nextMatchLbl, { visible: multi && currentMatchIndex < dg.matches.length - 1 })
  }

  refresh()
  panelRefreshers.push(refresh)
}

// ── Refresh registry — re-tint every panel after a server snapshot ────────────
const panelRefreshers: Array<() => void> = []
export function refreshAllPanels() { for (const r of panelRefreshers) r() }

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeBtn(parent: Entity, x: number, y: number, color: Color4): Entity {
  const e = engine.addEntity()
  Transform.createOrReplace(e, {
    position: Vector3.create(x, y, 0),
    scale: Vector3.create(0.2, 0.22, 1),
    parent
  })
  MeshRenderer.setPlane(e)
  MeshCollider.setPlane(e, ColliderLayer.CL_POINTER)
  Material.setBasicMaterial(e, { diffuseColor: color })
  return e
}

function makeLbl(parent: Entity, x: number, y: number, text: string): Entity {
  const e = engine.addEntity()
  Transform.createOrReplace(e, {
    position: Vector3.create(x, y, -0.005),
    parent
  })
  TextShape.createOrReplace(e, {
    text,
    fontSize: 0.9,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  return e
}
