import {
  engine, Entity, Transform, MeshRenderer, MeshCollider,
  Material, TextShape, TextAlignMode, ColliderLayer,
  VisibilityComponent, pointerEventsSystem, InputAction,
  GltfContainer, TransformTypeWithOptionals
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { GROUPS, predictions, isGroupComplete, abbr, getResult, flagFor } from './prodeData'
import { koFixtures, koPredictions, koResults } from './knockoutData'
import { getMatchDate, fmtDate, isMatchLocked } from './matchDates'
import { openGroupForm, openKoForm, openPendingForm, pendingMatchCount } from './prodeUi'
import { playClick } from '../client/sfx'

// ── Colors ────────────────────────────────────────────────────────────────────
const ACCENT       = Color4.fromHexString('#18A187ff')
const WHITE        = Color4.White()
const GRAY         = Color4.fromHexString('#888888ff')
const GREEN        = Color4.fromHexString('#22cc55ff')
const RED          = Color4.fromHexString('#ff5555ff')
const VIOLET       = Color4.fromHexString('#9f78e7ff')
const VIOLET_DARK  = Color4.fromHexString('#4a2d8eff')
const VIOLET_TRACK = Color4.fromHexString('#3a2d5cff')
const MUTED        = Color4.create(0.60, 0.60, 0.75, 1)
const TBL_HEADER   = Color4.fromHexString('#169b62ff')
const PROG_HEADER  = Color4.fromHexString('#7a1f31ff')
const TBL_COL_HDR  = Color4.create(0.13, 0.10, 0.28, 1)
const TBL_ROW_EVEN   = Color4.create(0.10, 0.07, 0.22, 0.92)
const TBL_ROW_ODD    = Color4.create(0.07, 0.05, 0.16, 0.92)
const TBL_ROW_LOCKED = Color4.create(0.28, 0.25, 0.38, 0.92)  // lighter slate for finished/locked matches
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
export function addProdePanel(groupIndex: number, matchRange: string, transform: TransformTypeWithOptionals) {
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
    text: matchRange, fontSize: 1.1, textColor: WHITE,
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

      const locked = getResult(m.id) !== undefined || isMatchLocked(m.team1, m.team2)
      const rowColor = locked ? TBL_ROW_LOCKED : (i % 2 === 0 ? TBL_ROW_EVEN : TBL_ROW_ODD)
      Material.setBasicMaterial(row.bg, { diffuseColor: rowColor })

      const p = predictions.find(px => px.matchId === m.id)
      const r = getResult(m.id)

      const predTs = TextShape.getMutable(row.pred)
      predTs.text = p?.submitted ? `${p.score1}-${p.score2}` : (locked ? '-' : '?')
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

// ── Knockout placeholder panel (no interaction, teams TBD) ────────────────────
// Knockout panel — shows 2 crosses of a round, DATA-DRIVEN from the live `koFixtures`
// cache (fed from the API). Each (round, slot) resolves to the Nth fixture of that
// round (sorted by kickoff). Fills in automatically as the API defines crosses;
// refreshed on every snapshot. `round = ''` keeps it as a static placeholder.
// NOTE: positions are approximate — the designer refines the visual layout.
const KO_PLACEHOLDER = Color4.fromHexString('#2a2a4aff')

export function addKnockoutPanel(
  roundLabel: string, matchLabel: string, round: string, slot0: number, transform: TransformTypeWithOptionals
) {
  const root = engine.addEntity()
  Transform.createOrReplace(root, transform)

  const panel = engine.addEntity()
  Transform.createOrReplace(panel, {
    position: PANEL_OFFSET, scale: Vector3.create(PANEL_CS, PANEL_CS, PANEL_CS), parent: root
  })
  GltfContainer.create(panel, {
    src: PANEL_MODEL,
    visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })

  // Top label — round name (always visible)
  const nameLbl = engine.addEntity()
  Transform.createOrReplace(nameLbl, { position: Vector3.create(0, 0.92, FRONT_Z), parent: root })
  TextShape.createOrReplace(nameLbl, { text: roundLabel, fontSize: 1.1, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  // Header strip (violet) — text toggles between matchLabel and matchLabel + " SUMMARY"
  const hdrBg = engine.addEntity()
  Transform.createOrReplace(hdrBg, { position: Vector3.create(0, 0.44, BG_Z), scale: Vector3.create(2.48, 0.16, 1), parent: root })
  MeshRenderer.setPlane(hdrBg)
  Material.setBasicMaterial(hdrBg, { diffuseColor: VIOLET })
  const hdrLbl = engine.addEntity()
  Transform.createOrReplace(hdrLbl, { position: Vector3.create(0, 0.44, FRONT_Z), parent: root })
  TextShape.createOrReplace(hdrLbl, { text: matchLabel, fontSize: 0.8, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  const mkHide = (e: Entity) => VisibilityComponent.createOrReplace(e, { visible: false })
  const mkShow = (e: Entity) => VisibilityComponent.createOrReplace(e, { visible: true })

  const setFlag = (e: Entity, fr: { src: string; uvs: number[] } | null) => {
    if (fr) {
      MeshRenderer.setPlane(e, fr.uvs)
      Material.setBasicMaterial(e, { texture: Material.Texture.Common({ src: fr.src }) })
    } else {
      MeshRenderer.setPlane(e)
      Material.setBasicMaterial(e, { diffuseColor: KO_PLACEHOLDER })
    }
  }

  // ── INCOMPLETE STATE: large flags + team name ─────────────────────────────
  type KoRow = { flag1: Entity; flag2: Entity; q1: Entity; q2: Entity; teams: Entity; status: Entity }
  const incompleteRows: KoRow[] = [0.02, -0.62].map((y) => {
    const flag1 = engine.addEntity()
    Transform.createOrReplace(flag1, { position: Vector3.create(-0.86, y, BG_Z), scale: Vector3.create(0.46, 0.31, 1), parent: root })
    mkShow(flag1)
    const flag2 = engine.addEntity()
    Transform.createOrReplace(flag2, { position: Vector3.create(0.86, y, BG_Z), scale: Vector3.create(0.46, 0.31, 1), parent: root })
    mkShow(flag2)
    // "?" overlays — visible only when the fixture has no teams yet
    const q1 = engine.addEntity()
    Transform.createOrReplace(q1, { position: Vector3.create(-0.86, y, FRONT_Z), parent: root })
    TextShape.createOrReplace(q1, { text: '?', fontSize: 0.36, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
    mkHide(q1)
    const q2 = engine.addEntity()
    Transform.createOrReplace(q2, { position: Vector3.create(0.86, y, FRONT_Z), parent: root })
    TextShape.createOrReplace(q2, { text: '?', fontSize: 0.36, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
    mkHide(q2)
    const teams = engine.addEntity()
    Transform.createOrReplace(teams, { position: Vector3.create(0, y, FRONT_Z), parent: root })
    TextShape.createOrReplace(teams, { text: '', fontSize: 0.8, textColor: Color4.create(0, 0, 0, 1), textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
    mkShow(teams)
    const status = engine.addEntity()
    Transform.createOrReplace(status, { position: Vector3.create(0, y - 0.22, FRONT_Z), parent: root })
    TextShape.createOrReplace(status, { text: '', fontSize: 0.65, textColor: MUTED, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
    mkShow(status)
    return { flag1, flag2, q1, q2, teams, status }
  })

  // ── COMPLETE STATE: summary table (same layout as group stage) ────────────
  const colHdrBg = mkBg(0.28, 0.14, TBL_COL_HDR, root)
  const mkColHdr = (x: number, text: string): Entity => {
    const e = engine.addEntity()
    Transform.createOrReplace(e, { position: Vector3.create(x, 0.28, FRONT_Z), parent: root })
    TextShape.createOrReplace(e, { text, fontSize: 0.76, textColor: MUTED, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
    mkHide(e)
    return e
  }
  const colMatchHdr = mkColHdr(-0.47, 'MATCH')
  const colPredHdr  = mkColHdr( 0.52, 'PRED')
  const colRealHdr  = mkColHdr( 0.93, 'RESULT')
  const completeTick = engine.addEntity()
  Transform.createOrReplace(completeTick, { position: Vector3.create(0.52, -1.01, FRONT_Z), parent: root })
  TextShape.createOrReplace(completeTick, { text: '✓', fontSize: 0.7, textColor: COMPLETE_BADGE_COLOR, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  mkHide(completeTick)
  const completeBadge = engine.addEntity()
  Transform.createOrReplace(completeBadge, { position: Vector3.create(0, -1.01, FRONT_Z), parent: root })
  TextShape.createOrReplace(completeBadge, { text: 'ALL PREDICTIONS COMPLETE', fontSize: 0.56, textColor: COMPLETE_BADGE_COLOR, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  mkHide(completeBadge)

  const completeHeaderEnts: Entity[] = [colHdrBg, colMatchHdr, colPredHdr, colRealHdr, completeTick, completeBadge]

  type KoSummaryRow = { bg: Entity; f1: Entity; abbr1: Entity; vs: Entity; f2: Entity; abbr2: Entity; pred: Entity; real: Entity }
  const summaryRows: KoSummaryRow[] = [0, 1].map((i) => {
    const ry = ROW_Y0 - i * ROW_STEP
    const bg = mkBg(ry, ROW_H, i % 2 === 0 ? TBL_ROW_EVEN : TBL_ROW_ODD, root)

    const f1 = engine.addEntity()
    Transform.createOrReplace(f1, { position: Vector3.create(-0.97, ry, FRONT_Z), scale: Vector3.create(0.16, 0.105, 1), parent: root })
    MeshRenderer.setPlane(f1); Material.setBasicMaterial(f1, { diffuseColor: KO_PLACEHOLDER }); mkHide(f1)

    const abbr1 = engine.addEntity()
    Transform.createOrReplace(abbr1, { position: Vector3.create(-0.72, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(abbr1, { text: '', fontSize: 0.82, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER }); mkHide(abbr1)

    const vsLbl = engine.addEntity()
    Transform.createOrReplace(vsLbl, { position: Vector3.create(-0.46, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(vsLbl, { text: 'vs', fontSize: 0.70, textColor: MUTED, textAlign: TextAlignMode.TAM_MIDDLE_CENTER }); mkHide(vsLbl)

    const f2 = engine.addEntity()
    Transform.createOrReplace(f2, { position: Vector3.create(-0.21, ry, FRONT_Z), scale: Vector3.create(0.16, 0.105, 1), parent: root })
    MeshRenderer.setPlane(f2); Material.setBasicMaterial(f2, { diffuseColor: KO_PLACEHOLDER }); mkHide(f2)

    const abbr2 = engine.addEntity()
    Transform.createOrReplace(abbr2, { position: Vector3.create(0.04, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(abbr2, { text: '', fontSize: 0.82, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER }); mkHide(abbr2)

    const pred = engine.addEntity()
    Transform.createOrReplace(pred, { position: Vector3.create(0.52, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(pred, { text: '', fontSize: 0.88, textColor: VIOLET, textAlign: TextAlignMode.TAM_MIDDLE_CENTER }); mkHide(pred)

    const real = engine.addEntity()
    Transform.createOrReplace(real, { position: Vector3.create(0.93, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(real, { text: '-', fontSize: 0.88, textColor: GRAY, textAlign: TextAlignMode.TAM_MIDDLE_CENTER }); mkHide(real)

    return { bg, f1, abbr1, vs: vsLbl, f2, abbr2, pred, real }
  })

  // ── Refresh ───────────────────────────────────────────────────────────────
  const refresh = () => {
    const inRound = round
      ? koFixtures.filter(f => f.round === round).sort((a, b) => a.kickoff - b.kickoff || a.id - b.id)
      : []
    const panelFixtures = [inRound[slot0], inRound[slot0 + 1]].filter((f): f is typeof inRound[0] => !!f)
    const complete = panelFixtures.length > 0 && panelFixtures.every(
      fx => koPredictions.find(p => p.fixtureId === fx.id)?.submitted
    )

    TextShape.getMutable(hdrLbl).text = complete ? `${matchLabel} SUMMARY` : matchLabel
    Material.setBasicMaterial(hdrBg, { diffuseColor: complete ? VIOLET : VIOLET_DARK })

    for (const row of incompleteRows)
      for (const e of [row.flag1, row.flag2, row.q1, row.q2, row.teams, row.status])
        VisibilityComponent.getMutable(e).visible = !complete

    for (const e of completeHeaderEnts) VisibilityComponent.getMutable(e).visible = complete
    for (const row of summaryRows)
      for (const e of [row.bg, row.f1, row.abbr1, row.vs, row.f2, row.abbr2, row.pred, row.real])
        VisibilityComponent.getMutable(e).visible = complete

    if (!complete) {
      incompleteRows.forEach((row, i) => {
        const fx = inRound[slot0 + i]
        const teams = TextShape.getMutable(row.teams)
        const status = TextShape.getMutable(row.status)
        if (!fx) {
          setFlag(row.flag1, null); setFlag(row.flag2, null)
          VisibilityComponent.getMutable(row.q1).visible = true
          VisibilityComponent.getMutable(row.q2).visible = true
          teams.text = 'TBD'; teams.textColor = Color4.create(0, 0, 0, 1)
          status.text = 'COMING SOON'; status.textColor = Color4.create(0, 0, 0, 1)
          return
        }
        VisibilityComponent.getMutable(row.q1).visible = false
        VisibilityComponent.getMutable(row.q2).visible = false
        setFlag(row.flag1, flagFor(fx.team1)); setFlag(row.flag2, flagFor(fx.team2))
        teams.text = `${abbr(fx.team1)}  vs  ${abbr(fx.team2)}`; teams.textColor = Color4.create(0, 0, 0, 1)
        const r = koResults.get(fx.id)
        if (r) { status.text = `${r.score1} - ${r.score2}`; status.textColor = ACCENT }
        else { status.text = ''; status.textColor = MUTED }
      })
    } else {
      summaryRows.forEach((row, i) => {
        const fx = panelFixtures[i]
        if (!fx) return

        const fr1 = flagFor(fx.team1)
        if (fr1) { MeshRenderer.setPlane(row.f1, fr1.uvs); Material.setBasicMaterial(row.f1, { texture: Material.Texture.Common({ src: fr1.src }) }) }
        const fr2 = flagFor(fx.team2)
        if (fr2) { MeshRenderer.setPlane(row.f2, fr2.uvs); Material.setBasicMaterial(row.f2, { texture: Material.Texture.Common({ src: fr2.src }) }) }

        TextShape.getMutable(row.abbr1).text = abbr(fx.team1)
        TextShape.getMutable(row.abbr2).text = abbr(fx.team2)

        const p = koPredictions.find(px => px.fixtureId === fx.id)
        const r = koResults.get(fx.id)

        const predTs = TextShape.getMutable(row.pred)
        predTs.text = p?.submitted ? `${p.score1}-${p.score2}` : (r ? '-' : '?')
        if (r && p?.submitted) {
          const exact = p.score1 === r.score1 && p.score2 === r.score2
          const predWinner = p.score1 > p.score2 ? 1 : p.score1 < p.score2 ? 2 : 0
          const realWinner = r.score1 > r.score2 ? 1 : r.score1 < r.score2 ? 2 : 0
          predTs.textColor = exact ? ACCENT : predWinner === realWinner ? GREEN : RED
        } else {
          predTs.textColor = VIOLET
        }

        const realTs = TextShape.getMutable(row.real)
        if (r) { realTs.text = `${r.score1}-${r.score2}`; realTs.textColor = WHITE }
        else { realTs.text = '-'; realTs.textColor = GRAY }

        Material.setBasicMaterial(row.bg, { diffuseColor: r ? TBL_ROW_LOCKED : (i % 2 === 0 ? TBL_ROW_EVEN : TBL_ROW_ODD) })
      })
    }
  }

  refresh()
  panelRefreshers.push(refresh)

  // Click surface → open the KO prediction form for this panel's defined fixtures.
  const clicker = engine.addEntity()
  Transform.createOrReplace(clicker, { position: Vector3.create(0, 0, FRONT_Z), scale: Vector3.create(2.6, 2.3, 1), parent: root })
  MeshCollider.setPlane(clicker, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: clicker, opts: { button: InputAction.IA_POINTER, hoverText: `Open ${roundLabel}`, showHighlight: false } },
    () => {
      playClick()
      const inRound = round
        ? koFixtures.filter(f => f.round === round).sort((a, b) => a.kickoff - b.kickoff || a.id - b.id)
        : []
      const ids = [inRound[slot0]?.id, inRound[slot0 + 1]?.id].filter((x): x is number => x !== undefined)
      if (ids.length > 0) openKoForm(ids, () => refresh())
    }
  )
}

// ── Group-stage summary panel with ‹ › group navigation ──────────────────────
export function addPendingMatchesPanel(transform: TransformTypeWithOptionals) {
  let groupIdx = 0
  const total = GROUPS.length

  const root = engine.addEntity()
  Transform.createOrReplace(root, transform)

  const panel = engine.addEntity()
  Transform.createOrReplace(panel, {
    position: PANEL_OFFSET, scale: Vector3.create(PANEL_CS, PANEL_CS, PANEL_CS), parent: root
  })
  GltfContainer.create(panel, {
    src: PANEL_MODEL,
    visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })

  const mkHide = (e: Entity) => VisibilityComponent.createOrReplace(e, { visible: false })

  // ── Static top label ─────────────────────────────────────────────────────
  const topLbl = engine.addEntity()
  Transform.createOrReplace(topLbl, { position: Vector3.create(0, 0.92, FRONT_Z), parent: root })
  TextShape.createOrReplace(topLbl, { text: 'GROUP STAGE', fontSize: 1.1, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  // ── Header strip with ‹ GROUP A › navigation ─────────────────────────────
  const hdrBg = engine.addEntity()
  Transform.createOrReplace(hdrBg, { position: Vector3.create(0, 0.44, BG_Z), scale: Vector3.create(2.48, 0.16, 1), parent: root })
  MeshRenderer.setPlane(hdrBg)
  Material.setBasicMaterial(hdrBg, { diffuseColor: TBL_HEADER })

  const prevTxt = engine.addEntity()
  Transform.createOrReplace(prevTxt, { position: Vector3.create(-1.05, 0.44, FRONT_Z), parent: root })
  TextShape.createOrReplace(prevTxt, { text: '‹', fontSize: 1.6, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  const nameLbl = engine.addEntity()
  Transform.createOrReplace(nameLbl, { position: Vector3.create(0, 0.44, FRONT_Z), parent: root })
  TextShape.createOrReplace(nameLbl, { text: '', fontSize: 0.85, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  const nextTxt = engine.addEntity()
  Transform.createOrReplace(nextTxt, { position: Vector3.create(1.05, 0.44, FRONT_Z), parent: root })
  TextShape.createOrReplace(nextTxt, { text: '›', fontSize: 1.6, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  const ARROW_Z = FRONT_Z - 0.05
  const prevClicker = engine.addEntity()
  Transform.createOrReplace(prevClicker, { position: Vector3.create(-1.05, 0.44, ARROW_Z), scale: Vector3.create(0.36, 0.18, 1), parent: root })
  MeshCollider.setPlane(prevClicker, ColliderLayer.CL_POINTER)
  mkHide(prevClicker)

  const nextClicker = engine.addEntity()
  Transform.createOrReplace(nextClicker, { position: Vector3.create(1.05, 0.44, ARROW_Z), scale: Vector3.create(0.36, 0.18, 1), parent: root })
  MeshCollider.setPlane(nextClicker, ColliderLayer.CL_POINTER)
  mkHide(nextClicker)

  // ── Bottom PREV / NEXT navigation (aligned with the badge row) ───────────
  const prevBtmTxt = engine.addEntity()
  Transform.createOrReplace(prevBtmTxt, { position: Vector3.create(-1.05, -1.01, FRONT_Z), parent: root })
  TextShape.createOrReplace(prevBtmTxt, { text: '‹ prev', fontSize: 0.72, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  const nextBtmTxt = engine.addEntity()
  Transform.createOrReplace(nextBtmTxt, { position: Vector3.create(1.05, -1.01, FRONT_Z), parent: root })
  TextShape.createOrReplace(nextBtmTxt, { text: 'next ›', fontSize: 0.72, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

  const prevBtmClicker = engine.addEntity()
  Transform.createOrReplace(prevBtmClicker, { position: Vector3.create(-1.05, -1.01, ARROW_Z), scale: Vector3.create(0.36, 0.18, 1), parent: root })
  MeshCollider.setPlane(prevBtmClicker, ColliderLayer.CL_POINTER)
  mkHide(prevBtmClicker)

  const nextBtmClicker = engine.addEntity()
  Transform.createOrReplace(nextBtmClicker, { position: Vector3.create(1.05, -1.01, ARROW_Z), scale: Vector3.create(0.36, 0.18, 1), parent: root })
  MeshCollider.setPlane(nextBtmClicker, ColliderLayer.CL_POINTER)
  mkHide(nextBtmClicker)

  // ── Column headers ────────────────────────────────────────────────────────
  const colHdrBg = mkBg(0.28, 0.14, TBL_COL_HDR, root)
  VisibilityComponent.createOrReplace(colHdrBg, { visible: true })
  const mkColHdr = (x: number, text: string) => {
    const e = engine.addEntity()
    Transform.createOrReplace(e, { position: Vector3.create(x, 0.28, FRONT_Z), parent: root })
    TextShape.createOrReplace(e, { text, fontSize: 0.76, textColor: MUTED, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  }
  mkColHdr(-0.47, 'MATCH')
  mkColHdr( 0.52, 'PRED')
  mkColHdr( 0.93, 'RESULT')

  // ── 6 data rows ───────────────────────────────────────────────────────────
  type GSRow = { bg: Entity; f1: Entity; abbr1: Entity; vs: Entity; f2: Entity; abbr2: Entity; pred: Entity; real: Entity }
  const rows: GSRow[] = [0, 1, 2, 3, 4, 5].map((i) => {
    const ry = ROW_Y0 - i * ROW_STEP
    const bg = mkBg(ry, ROW_H, i % 2 === 0 ? TBL_ROW_EVEN : TBL_ROW_ODD, root)
    VisibilityComponent.createOrReplace(bg, { visible: true })

    const f1 = engine.addEntity()
    Transform.createOrReplace(f1, { position: Vector3.create(-0.97, ry, FRONT_Z), scale: Vector3.create(0.16, 0.105, 1), parent: root })
    MeshRenderer.setPlane(f1); Material.setBasicMaterial(f1, { diffuseColor: KO_PLACEHOLDER })

    const abbr1 = engine.addEntity()
    Transform.createOrReplace(abbr1, { position: Vector3.create(-0.72, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(abbr1, { text: '', fontSize: 0.82, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

    const vsLbl = engine.addEntity()
    Transform.createOrReplace(vsLbl, { position: Vector3.create(-0.46, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(vsLbl, { text: 'vs', fontSize: 0.70, textColor: MUTED, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

    const f2 = engine.addEntity()
    Transform.createOrReplace(f2, { position: Vector3.create(-0.21, ry, FRONT_Z), scale: Vector3.create(0.16, 0.105, 1), parent: root })
    MeshRenderer.setPlane(f2); Material.setBasicMaterial(f2, { diffuseColor: KO_PLACEHOLDER })

    const abbr2 = engine.addEntity()
    Transform.createOrReplace(abbr2, { position: Vector3.create(0.04, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(abbr2, { text: '', fontSize: 0.82, textColor: WHITE, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

    const pred = engine.addEntity()
    Transform.createOrReplace(pred, { position: Vector3.create(0.52, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(pred, { text: '', fontSize: 0.88, textColor: VIOLET, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

    const real = engine.addEntity()
    Transform.createOrReplace(real, { position: Vector3.create(0.93, ry, FRONT_Z), parent: root })
    TextShape.createOrReplace(real, { text: '-', fontSize: 0.88, textColor: GRAY, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })

    return { bg, f1, abbr1, vs: vsLbl, f2, abbr2, pred, real }
  })

  // ── Complete badge ────────────────────────────────────────────────────────
  const completeTick = engine.addEntity()
  Transform.createOrReplace(completeTick, { position: Vector3.create(0.52, -1.01, FRONT_Z), parent: root })
  TextShape.createOrReplace(completeTick, { text: '✓', fontSize: 0.7, textColor: COMPLETE_BADGE_COLOR, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  mkHide(completeTick)
  const completeBadge = engine.addEntity()
  Transform.createOrReplace(completeBadge, { position: Vector3.create(0, -1.01, FRONT_Z), parent: root })
  TextShape.createOrReplace(completeBadge, { text: 'ALL PREDICTIONS COMPLETE', fontSize: 0.56, textColor: COMPLETE_BADGE_COLOR, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  mkHide(completeBadge)

  // ── Refresh ───────────────────────────────────────────────────────────────
  const refresh = () => {
    const g = GROUPS[groupIdx]
    if (!g) return
    TextShape.getMutable(nameLbl).text = g.name
    const complete = isGroupComplete(groupIdx)
    VisibilityComponent.getMutable(completeTick).visible = complete
    VisibilityComponent.getMutable(completeBadge).visible = complete

    g.matches.forEach((m, i) => {
      const row = rows[i]
      if (!row) return
      MeshRenderer.setPlane(row.f1, m.flag1.uvs)
      Material.setBasicMaterial(row.f1, { texture: Material.Texture.Common({ src: m.flag1.src }) })
      MeshRenderer.setPlane(row.f2, m.flag2.uvs)
      Material.setBasicMaterial(row.f2, { texture: Material.Texture.Common({ src: m.flag2.src }) })
      TextShape.getMutable(row.abbr1).text = abbr(m.team1)
      TextShape.getMutable(row.abbr2).text = abbr(m.team2)

      const p = predictions.find(px => px.matchId === m.id)
      const r = getResult(m.id)
      const locked = r !== undefined || isMatchLocked(m.team1, m.team2)

      const predTs = TextShape.getMutable(row.pred)
      predTs.text = p?.submitted ? `${p.score1}-${p.score2}` : (locked ? '-' : '?')
      if (r && p?.submitted) {
        const exact = p.score1 === r.score1 && p.score2 === r.score2
        predTs.textColor = exact ? ACCENT : p.winner === r.winner ? GREEN : RED
      } else {
        predTs.textColor = VIOLET
      }

      const realTs = TextShape.getMutable(row.real)
      if (r) { realTs.text = `${r.score1}-${r.score2}`; realTs.textColor = WHITE }
      else    { realTs.text = '-'; realTs.textColor = GRAY }

      Material.setBasicMaterial(row.bg, { diffuseColor: locked ? TBL_ROW_LOCKED : (i % 2 === 0 ? TBL_ROW_EVEN : TBL_ROW_ODD) })
    })
  }
  refresh()
  panelRefreshers.push(refresh)

  // ── Interactions ──────────────────────────────────────────────────────────
  pointerEventsSystem.onPointerDown(
    { entity: prevClicker, opts: { button: InputAction.IA_POINTER, hoverText: 'Previous group', showHighlight: false } },
    () => { playClick(); groupIdx = (groupIdx - 1 + total) % total; refresh() }
  )
  pointerEventsSystem.onPointerDown(
    { entity: nextClicker, opts: { button: InputAction.IA_POINTER, hoverText: 'Next group', showHighlight: false } },
    () => { playClick(); groupIdx = (groupIdx + 1) % total; refresh() }
  )
  pointerEventsSystem.onPointerDown(
    { entity: prevBtmClicker, opts: { button: InputAction.IA_POINTER, hoverText: 'Previous group', showHighlight: false } },
    () => { playClick(); groupIdx = (groupIdx - 1 + total) % total; refresh() }
  )
  pointerEventsSystem.onPointerDown(
    { entity: nextBtmClicker, opts: { button: InputAction.IA_POINTER, hoverText: 'Next group', showHighlight: false } },
    () => { playClick(); groupIdx = (groupIdx + 1) % total; refresh() }
  )

  const clicker = engine.addEntity()
  Transform.createOrReplace(clicker, { position: Vector3.create(0, 0, FRONT_Z), scale: Vector3.create(2.6, 2.3, 1), parent: root })
  MeshCollider.setPlane(clicker, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: clicker, opts: { button: InputAction.IA_POINTER, hoverText: 'Vote group matches', showHighlight: false } },
    () => { playClick(); openGroupForm(groupIdx, () => refresh()) }
  )
}
