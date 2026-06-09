import {
  engine, Entity, Transform, MeshRenderer, MeshCollider,
  Material, TextShape, TextAlignMode, ColliderLayer,
  VisibilityComponent, pointerEventsSystem, InputAction,
  GltfContainer, TransformTypeWithOptionals
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { GROUPS, predictions, isGroupComplete, abbr, getResult } from './prodeData'
import { getMatchDate, fmtDate } from './matchDates'
import { openGroupForm } from './prodeUi'
import { playClick } from '../client/sfx'

// ── Colors ────────────────────────────────────────────────────────────────────
const ACCENT       = Color4.fromHexString('#18A187ff')
const WHITE        = Color4.White()
const GRAY         = Color4.fromHexString('#888888ff')
const GREEN        = Color4.fromHexString('#22cc55ff')
const RED          = Color4.fromHexString('#ff5555ff')
const VIOLET       = Color4.fromHexString('#9f78e7ff')
const VIOLET_TRACK = Color4.fromHexString('#3a2d5cff')
const MUTED        = Color4.create(0.60, 0.60, 0.75, 1)
const TBL_HEADER   = Color4.fromHexString('#169b62ff')
const PROG_HEADER  = Color4.fromHexString('#7a1f31ff')
const TBL_COL_HDR  = Color4.create(0.13, 0.10, 0.28, 1)
const TBL_ROW_EVEN = Color4.create(0.10, 0.07, 0.22, 0.92)
const TBL_ROW_ODD  = Color4.create(0.07, 0.05, 0.16, 0.92)
const COMPLETE_BADGE_COLOR = Color4.fromHexString('#39ff78ff')

// ── Panel model ───────────────────────────────────────────────────────────────
const PANEL_MODEL  = 'assets/scene/Models/StadiumPanel/StadiumPanel.glb'
const PANEL_CS     = 2.6 / 9.753
const PANEL_OFFSET = Vector3.create(
  0,
  -((-0.084 + 8.46) / 2) * PANEL_CS,
  -((2.476 + 2.928) / 2) * PANEL_CS
)
const FRONT_Z = -0.10
const BG_Z    = -0.07

// ── Layout — complete table ───────────────────────────────────────────────────
// Title:       y = 0.44 (h=0.16)
// Col headers: y = 0.28 (h=0.14)
// Row 0..5:    y = 0.10, -0.09, -0.28, -0.47, -0.66, -0.85  (step=-0.19, h=0.17)
//
// X columns:
//   flag1  -0.97  (w=0.16, h=0.105)
//   abbr1  -0.72  fontSize=0.82
//   vs     -0.46  fontSize=0.70
//   flag2  -0.21  (w=0.16, h=0.105)
//   abbr2   0.04  fontSize=0.82
//   pred    0.52  fontSize=0.88
//   real    0.93  fontSize=0.88

const PROG_W    = 2.1
const ROW_Y0    =  0.10
const ROW_STEP  =  0.19
const ROW_H     =  0.17

// ── Helper: full-width background plane ──────────────────────────────────────
function mkBg(y: number, h: number, color: Color4, root: Entity): Entity {
  const e = engine.addEntity()
  Transform.createOrReplace(e, {
    position: Vector3.create(0, y, BG_Z),
    scale: Vector3.create(2.48, h, 1),
    parent: root
  })
  MeshRenderer.setPlane(e)
  Material.setBasicMaterial(e, { diffuseColor: color })
  VisibilityComponent.createOrReplace(e, { visible: false })
  return e
}

// ── One clickable board per group ─────────────────────────────────────────────
export function addProdePanel(groupIndex: number, transform: TransformTypeWithOptionals) {
  const g = GROUPS[groupIndex]
  if (!g) return

  const root = engine.addEntity()
  Transform.createOrReplace(root, transform)

  const panel = engine.addEntity()
  Transform.createOrReplace(panel, {
    position: PANEL_OFFSET,
    scale: Vector3.create(PANEL_CS, PANEL_CS, PANEL_CS),
    parent: root
  })
  GltfContainer.create(panel, {
    src: PANEL_MODEL,
    visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })

  // Main click surface — always opens predictions (mobile and desktop)
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

  // Group name (always visible)
  const nameLbl = engine.addEntity()
  Transform.createOrReplace(nameLbl, { position: Vector3.create(0, 0.92, FRONT_Z), parent: root })
  TextShape.createOrReplace(nameLbl, {
    text: g.name, fontSize: 1.1, textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  // ══ STATE: INCOMPLETE ═══════════════════════════════════════════════════════

  const progHdrBg = mkBg(0.44, 0.16, PROG_HEADER, root)

  const progLbl = engine.addEntity()
  Transform.createOrReplace(progLbl, { position: Vector3.create(0, 0.44, FRONT_Z), parent: root })
  TextShape.createOrReplace(progLbl, {
    text: '', fontSize: 0.90, textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  VisibilityComponent.createOrReplace(progLbl, { visible: true })

  const progTrack = engine.addEntity()
  Transform.createOrReplace(progTrack, {
    position: Vector3.create(0, 0.1, FRONT_Z), scale: Vector3.create(PROG_W, 0.12, 1), parent: root
  })
  MeshRenderer.setPlane(progTrack)
  Material.setBasicMaterial(progTrack, { diffuseColor: VIOLET_TRACK })
  VisibilityComponent.createOrReplace(progTrack, { visible: true })

  const progFill = engine.addEntity()
  Transform.createOrReplace(progFill, {
    position: Vector3.create(-PROG_W / 2, 0.1, FRONT_Z - 0.005),
    scale: Vector3.create(0.001, 0.12, 1), parent: root
  })
  MeshRenderer.setPlane(progFill)
  Material.setBasicMaterial(progFill, { diffuseColor: VIOLET })
  VisibilityComponent.createOrReplace(progFill, { visible: false })

  const groupFlagEnts: Entity[] = []
  const flagXs = [-0.9, -0.3, 0.3, 0.9]
  g.flags.forEach((flagRef, i) => {
    const flag = engine.addEntity()
    Transform.createOrReplace(flag, {
      position: Vector3.create(flagXs[i] ?? 0, -0.18, FRONT_Z),
      scale: Vector3.create(0.5, 0.33, 1), parent: root
    })
    MeshRenderer.setPlane(flag, flagRef.uvs)
    Material.setBasicMaterial(flag, { texture: Material.Texture.Common({ src: flagRef.src }) })
    VisibilityComponent.createOrReplace(flag, { visible: true })
    groupFlagEnts.push(flag)
  })

  const hint = engine.addEntity()
  Transform.createOrReplace(hint, { position: Vector3.create(0, -0.55, FRONT_Z), parent: root })
  TextShape.createOrReplace(hint, {
    text: 'Click to predict', fontSize: 0.7, textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  VisibilityComponent.createOrReplace(hint, { visible: true })

  // ══ STATE: COMPLETE — 3-column summary table (mobile + desktop) ═════════════
  //
  // Columns: [flag abbr vs flag abbr] | [prediction] | [result]
  // 6 rows, no pagination.  All text at fontSize >= 0.70.

  const mkHide = (e: Entity) => VisibilityComponent.createOrReplace(e, { visible: false })

  // Title header
  const tblHdrBg  = mkBg(0.44, 0.16, TBL_HEADER, root)
  const tblHdrLbl = engine.addEntity()
  Transform.createOrReplace(tblHdrLbl, { position: Vector3.create(0, 0.44, FRONT_Z), parent: root })
  TextShape.createOrReplace(tblHdrLbl, {
    text: 'GROUP STAGE SUMMARY', fontSize: 0.90, textColor: WHITE,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  mkHide(tblHdrLbl)

  // Column header row
  const colHdrBg = mkBg(0.28, 0.14, TBL_COL_HDR, root)
  const mkColHdr = (x: number, text: string): Entity => {
    const e = engine.addEntity()
    Transform.createOrReplace(e, { position: Vector3.create(x, 0.28, FRONT_Z), parent: root })
    TextShape.createOrReplace(e, {
      text, fontSize: 0.76, textColor: MUTED, textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    mkHide(e)
    return e
  }
  const colMatchHdr = mkColHdr(-0.47, 'MATCH')
  const colPredHdr  = mkColHdr( 0.52, 'PRED')
  const colRealHdr  = mkColHdr( 0.93, 'RESULT')

  const completeTick = engine.addEntity()
  Transform.createOrReplace(completeTick, {
    position: Vector3.create(0.52, -1.01, FRONT_Z),
    parent: root
  })
  TextShape.createOrReplace(completeTick, {
    text: '✓', fontSize: 0.7, textColor: COMPLETE_BADGE_COLOR,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  mkHide(completeTick)

  const completeBadgeText = engine.addEntity()
  Transform.createOrReplace(completeBadgeText, {
    position: Vector3.create(0, -1.01, FRONT_Z),
    parent: root
  })
  TextShape.createOrReplace(completeBadgeText, {
    text: 'ALL GROUP COMPLETED', fontSize: 0.56, textColor: COMPLETE_BADGE_COLOR,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  mkHide(completeBadgeText)

  const completeHeaderEnts: Entity[] = [
    tblHdrBg,
    tblHdrLbl,
    colHdrBg,
    colMatchHdr,
    colPredHdr,
    colRealHdr,
    completeTick,
    completeBadgeText
  ]

  // Data rows
  type SummaryRow = {
    bg: Entity; f1: Entity; abbr1: Entity; vs: Entity
    f2: Entity; abbr2: Entity; pred: Entity; real: Entity
  }
  const summaryRows: SummaryRow[] = []

  g.matches.forEach((m, i) => {
    const ry    = ROW_Y0 - i * ROW_STEP
    const color = i % 2 === 0 ? TBL_ROW_EVEN : TBL_ROW_ODD

    const bg = mkBg(ry, ROW_H, color, root)

    const f1 = engine.addEntity()
    Transform.createOrReplace(f1, {
      position: Vector3.create(-0.97, ry, FRONT_Z), scale: Vector3.create(0.16, 0.105, 1), parent: root
    })
    MeshRenderer.setPlane(f1, m.flag1.uvs)
    Material.setBasicMaterial(f1, { texture: Material.Texture.Common({ src: m.flag1.src }) })
    mkHide(f1)

    const abbr1 = engine.addEntity()
    Transform.createOrReplace(abbr1, { position: Vector3.create(-0.72, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(abbr1, {
      text: abbr(m.team1), fontSize: 0.82, textColor: WHITE,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    mkHide(abbr1)

    const vsLbl = engine.addEntity()
    Transform.createOrReplace(vsLbl, { position: Vector3.create(-0.46, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(vsLbl, {
      text: 'vs', fontSize: 0.70, textColor: MUTED, textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    mkHide(vsLbl)

    const f2 = engine.addEntity()
    Transform.createOrReplace(f2, {
      position: Vector3.create(-0.21, ry, FRONT_Z), scale: Vector3.create(0.16, 0.105, 1), parent: root
    })
    MeshRenderer.setPlane(f2, m.flag2.uvs)
    Material.setBasicMaterial(f2, { texture: Material.Texture.Common({ src: m.flag2.src }) })
    mkHide(f2)

    const abbr2 = engine.addEntity()
    Transform.createOrReplace(abbr2, { position: Vector3.create(0.04, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(abbr2, {
      text: abbr(m.team2), fontSize: 0.82, textColor: WHITE,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    mkHide(abbr2)

    const pred = engine.addEntity()
    Transform.createOrReplace(pred, { position: Vector3.create(0.52, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(pred, {
      text: '', fontSize: 0.88, textColor: VIOLET,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    mkHide(pred)

    const real = engine.addEntity()
    Transform.createOrReplace(real, { position: Vector3.create(0.93, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(real, {
      text: '-', fontSize: 0.88, textColor: GRAY,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    mkHide(real)

    summaryRows.push({ bg, f1, abbr1, vs: vsLbl, f2, abbr2, pred, real })
  })

  // ── Refresh ───────────────────────────────────────────────────────────────
  function refresh() {
    const done     = g.matches.filter(m => predictions.find(p => p.matchId === m.id)?.submitted ?? false).length
    const total    = g.matches.length
    const complete = isGroupComplete(groupIndex)

    // Incomplete state
    VisibilityComponent.getMutable(progHdrBg).visible = !complete
    VisibilityComponent.getMutable(progLbl).visible   = !complete
    VisibilityComponent.getMutable(progTrack).visible = !complete
    VisibilityComponent.getMutable(hint).visible      = !complete
    for (const e of groupFlagEnts) VisibilityComponent.getMutable(e).visible = !complete

    if (!complete) {
      TextShape.getMutable(progLbl).text = `${done} / ${total} predicted`
      const fw = PROG_W * (total > 0 ? done / total : 0)
      VisibilityComponent.getMutable(progFill).visible = fw > 0.001
      Transform.getMutable(progFill).scale    = Vector3.create(Math.max(fw, 0.001), 0.12, 1)
      Transform.getMutable(progFill).position = Vector3.create(-PROG_W / 2 + fw / 2, 0.1, FRONT_Z - 0.005)
    } else {
      VisibilityComponent.getMutable(progFill).visible = false
    }

    // Complete header
    for (const e of completeHeaderEnts) VisibilityComponent.getMutable(e).visible = complete

    // Summary rows
    for (let i = 0; i < summaryRows.length; i++) {
      const row = summaryRows[i]
      const m   = g.matches[i]
      const ents: Entity[] = [row.bg, row.f1, row.abbr1, row.vs, row.f2, row.abbr2, row.pred, row.real]
      for (const e of ents) VisibilityComponent.getMutable(e).visible = complete

      if (!complete || !m) continue

      const p = predictions.find(px => px.matchId === m.id)
      const r = getResult(m.id)

      const predTs = TextShape.getMutable(row.pred)
      predTs.text = p?.submitted ? `${p.score1}-${p.score2}` : '?'
      if (r && p?.submitted) {
        const exact = p.score1 === r.score1 && p.score2 === r.score2
        predTs.textColor = exact ? ACCENT : p.winner === r.winner ? GREEN : RED
      } else {
        predTs.textColor = VIOLET
      }

      const realTs = TextShape.getMutable(row.real)
      if (r) {
        realTs.text      = `${r.score1}-${r.score2}`
        realTs.textColor = WHITE
      } else {
        realTs.text      = '-'
        realTs.textColor = GRAY
      }
    }
  }

  refresh()
  panelRefreshers.push(refresh)
}

// ── Refresh registry ──────────────────────────────────────────────────────────
const panelRefreshers: (() => void)[] = []
export function refreshAllPanels() { for (const r of panelRefreshers) r() }
