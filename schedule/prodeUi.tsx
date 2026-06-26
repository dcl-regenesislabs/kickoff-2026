import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity, Button } from '@dcl/sdk/react-ecs'
import { getPlayer } from '@dcl/sdk/players'
import { engine } from '@dcl/sdk/ecs'
import {
  MATCHES, GROUPS, predictions, savePrediction, unsubmitPrediction, getCompletedCount, isGroupComplete,
  isMatchDone, getResult, hasResult, submitOfficialResult, scorePrediction, myPoints, Outcome, FlagRef
} from './prodeData'
import { koFixtures, koPredictions, koResults, myKoPoints, scoreKoPrediction } from './knockoutData'
import { getLeaderboard, setOnPredictionAck, isServerReady } from '../client/prodeClient'
import { getMobileKickButtonState, setMobileKickPressed, getKickHintVisible } from '../client/ball'
import { isMatchLocked } from './matchDates'
import { playClick, playComplete } from '../client/sfx'
import { layoutScale, isMobile } from './responsive'
import { isAdmin, PTS_WINNER, PTS_SCORE } from './prodeConfig'

// Responsive helpers — read the live layout scale each render (desktop ~1, mobile x1.5).
// S() scales sizes/spacings, F() scales font sizes. On desktop scale is 1 so the
// carefully-tuned layout is unchanged.
const S = (n: number) => Math.round(n * layoutScale())
const F = (n: number) => Math.round(n * layoutScale())
import { ConfettiOverlay, setupConfettiSystem, startConfetti } from './confetti'

function normalizeDegrees(angle: number): number {
  let value = angle % 360
  if (value < 0) value += 360
  return value
}

// Same technique used in cozy-farm's map arrow: rotate the 4 UV corners around
// the center of the sprite. Positive degrees = clockwise visual rotation.
function rotateUVs(angleDeg: number): number[] {
  const a = (angleDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)

  function rot(u: number, v: number): [number, number] {
    const du = u - 0.5
    const dv = v - 0.5
    return [du * c - dv * s + 0.5, du * s + dv * c + 0.5]
  }

  const [u0, v0] = rot(0, 1)
  const [u1, v1] = rot(1, 1)
  const [u2, v2] = rot(1, 0)
  const [u3, v3] = rot(0, 0)
  return [u0, v0, u1, v1, u2, v2, u3, v3]
}

// ── Group form state ──────────────────────────────────────────────────────────
// The board is just a clickable; opening it shows this UI to step through the
// group's matches and set each score.
const groupState = {
  visible:        false,
  groupIndex:     0,
  matchIndex:     0,
  score1:         0,
  score2:         0,
  dirty:          false,
  onChange:       null as (() => void) | null,
  saving:         false,                        // true while waiting for server ack
  pendingAdvance: null as (() => void) | null   // queued navigation after successful save
}

// Admin form state — iterates the flat MATCHES list to load official results.
const adminState = {
  visible:   false,
  index:     0,
  score1:    0,
  score2:    0,
  onConfirm: null as (() => void) | null
}

// Info overlay — explains the scoring rules (opened from the instructions banner).
const infoState = { visible: false }
export function openProdeInfo() { infoState.visible = true }

// Player stats overlay ("MY SCORE").
const scoreState = { visible: false, tab: 'total' as 'total' | 'group' | 'knockout' }
export function openScorePanel() { scoreState.visible = true; scoreState.tab = 'total' }

// Welcome overlay shown on entry; 3 steps, dismissed with "Join the Challenge".
const welcomeState = { visible: true, step: 0 }

// Server gate overlay shown before onboarding. It blocks interaction until the
// authoritative multiplayer room is ready, then remains visible for 3 seconds.
const serverGateState = {
  visible: true,
  holdElapsed: 0,
  spinnerAngle: 0
}

const SPINNER_DEG_PER_SEC = 220

const predictionPanelState = {
  expanded: null as 'knockout' | 'group' | null
}


// Wearable claim status overlay ("on the way" → "received!").
const claimState = { visible: false, done: false }
export function showClaimPending() { claimState.visible = true; claimState.done = false }
export function showClaimDone() { claimState.visible = true; claimState.done = true }
export function hideClaim() { claimState.visible = false }

// Rejection toast — shown briefly when the server rejects a prediction.
const toastState = { visible: false, message: '' }
function showRejectionToast(reason: 'locked' | 'error' | 'disconnected') {
  toastState.message =
    reason === 'locked'       ? 'Match is locked — prediction not saved' :
    reason === 'disconnected' ? 'Server not connected — prediction not saved' :
                                'Server error — please try again'
  toastState.visible = true
  setTimeout(() => { toastState.visible = false }, 3000)
}

// All-predictions-complete celebration (fires once when the 72nd is saved).
const celebrateState = { visible: false }
let celebrated = false
function maybeCelebrate() {
  if (celebrated) return
  if (getCompletedCount() < MATCHES.length) return
  celebrated = true
  celebrateState.visible = true
  startConfetti()
  playComplete()
}

// Button wrapper that plays the UI click sound before its handler.
// `RawButton` avoids the global `<Button>`→`<SfxButton>` rename hitting itself.
const RawButton: typeof Button = Button
const SfxButton = (props: any) => (
  <RawButton {...props} onMouseDown={() => { playClick(); props.onMouseDown?.() }} />
)

// Image button: a clickable UiEntity whose face is a texture (text baked into it).
// `tint` lets us dim it for a disabled look.
const ImgButton = (props: { src: string; width: number; height: number; onMouseDown: () => void; tint?: Color4 }) => (
  <UiEntity
    uiTransform={{ width: props.width, height: props.height }}
    uiBackground={{ texture: { src: props.src }, textureMode: 'stretch', color: props.tint }}
    onMouseDown={() => { playClick(); props.onMouseDown() }}
  />
)

export function openGroupForm(groupIndex: number, onChange: () => void) {
  groupState.groupIndex = groupIndex
  groupState.matchIndex = 0
  groupState.onChange   = onChange
  loadGroupMatch()
  groupState.visible    = true
}

// Load the currently-selected match's saved score into the form.
function loadGroupMatch() {
  const g = GROUPS[groupState.groupIndex]
  const match = g?.matches[groupState.matchIndex]
  const pred = match ? predictions.find(p => p.matchId === match.id) : undefined
  groupState.score1 = pred?.score1 ?? 0
  groupState.score2 = pred?.score2 ?? 0
  groupState.dirty  = false
}

function openAdminForm(index: number) {
  adminState.index   = index
  loadAdminMatch(index)
  adminState.visible = true
}

function loadAdminMatch(index: number) {
  const match = MATCHES[index]
  const r = match ? getResult(match.id) : undefined
  adminState.score1 = r?.score1 ?? 0
  adminState.score2 = r?.score2 ?? 0
}

export function setupProdeUi() {
  setupConfettiSystem()
  engine.addSystem((dt: number) => {
    if (!serverGateState.visible) return

    serverGateState.spinnerAngle = normalizeDegrees(serverGateState.spinnerAngle + dt * SPINNER_DEG_PER_SEC)

    if (isServerReady()) {
      serverGateState.holdElapsed += dt
      if (serverGateState.holdElapsed >= 3) {
        serverGateState.visible = false
      }
    } else {
      serverGateState.holdElapsed = 0
    }
  })
  setOnPredictionAck((matchId, ok, reason) => {
    const wasExplicit = groupState.pendingAdvance !== null
    groupState.saving = false
    if (ok) {
      groupState.pendingAdvance?.()
    } else {
      unsubmitPrediction(matchId)
      if (wasExplicit) showRejectionToast(reason === 'locked' ? 'locked' : reason === 'disconnected' ? 'disconnected' : 'error')
    }
    groupState.pendingAdvance = null
  })
  ReactEcsRenderer.setUiRenderer(ProdeUi)
}

// True only for the configured admin wallet(s).
function localIsAdmin(): boolean {
  return isAdmin(getPlayer()?.userId)
}

// ── Colors ────────────────────────────────────────────────────────────────────
const TEAL      = Color4.fromHexString('#18A187ff')
const DARK      = Color4.create(0.08, 0.08, 0.2, 0.97)
const DARK_BTN  = Color4.create(0.15, 0.15, 0.32, 1)
const OVERLAY   = Color4.create(0, 0, 0, 0.7)
const RED       = Color4.fromHexString('#FF6B6Bff')
const GOLD      = Color4.fromHexString('#F2C14Eff')
const VIOLET    = Color4.fromHexString('#9f78e7ff')
const MUTED     = Color4.create(0.6, 0.6, 0.7, 1)
const PANEL_BG      = Color4.create(0.05, 0.04, 0.11, 0.97)
const ACCENT_KO     = Color4.fromHexString('#9f78e7ff')
const ACCENT_GS     = Color4.fromHexString('#F28C28ff')
const ACCENT_GS_CHIP = Color4.fromHexString('#B9BBC7ff')
const TAB_INACTIVE  = Color4.create(0.45, 0.44, 0.55, 1)
const CHIP_HOVER    = Color4.create(0.09, 0.08, 0.18, 1)
const CHECKLIST_PARTIAL  = Color4.fromHexString('#7a1f31ff')
const CHECKLIST_COMPLETE = Color4.fromHexString('#39ff78ff')
const CELL_EMPTY = Color4.create(0.42, 0.42, 0.52, 1)    // pending checklist cell
const BTN_DISABLED = Color4.create(0.24, 0.24, 0.30, 1)  // greyed/disabled button

// Outcome implied by a score (used by the admin result form).
function impliedWinner(s1: number, s2: number): Outcome {
  return s1 > s2 ? 'team1' : s1 < s2 ? 'team2' : 'draw'
}

// ── Component ─────────────────────────────────────────────────────────────────
const ProdeUi = () => {
  const mob = isMobile()
  return (
    // Single root wrapper
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}>

      {/* ── Confetti celebration overlay (on top) ───────────────────────────── */}
      <ConfettiOverlay />

      {/* ── Progress checklist — top on desktop, bottom-center on mobile ─────── */}
      <MatchChecklist />

      {/* ── My Score entry button — only once every match is predicted ──────── */}
      <ScoreEntryButton />

      {/* ── Admin entry button — TOP-right (off the bottom joystick/action area) */}
      {localIsAdmin() && !adminState.visible && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: S(120), right: S(24) },
            width: S(200), height: S(64)
          }}
        >
          <SfxButton value="ADMIN" variant="primary" fontSize={F(24)}
            uiTransform={{ width: S(200), height: S(64), borderRadius: S(14) }}
            color={GOLD}
            onMouseDown={() => openAdminForm(adminState.index)}
          />
        </UiEntity>
      )}

      {/* ── Group prediction form overlay ───────────────────────────────────── */}
      <MobileKickButton />
      <DesktopKickHint />
      <GroupForm />

      {/* ── Admin result form overlay ────────────────────────────────────────── */}
      <AdminForm />

      {/* ── Scoring info overlay ─────────────────────────────────────────────── */}
      <InfoForm />

      {/* ── My Score / stats overlay ─────────────────────────────────────────── */}
      <ScorePanel />

      {/* ── All-complete celebration overlay ─────────────────────────────────── */}
      <CompletionOverlay />

      {/* ── Welcome overlay (on entry) ───────────────────────────────────────── */}
      {!serverGateState.visible && <WelcomeOverlay />}

      {/* ── Wearable claim status overlay ────────────────────────────────────── */}
      <ClaimOverlay />
      <ServerGateOverlay />

      {/* ── Prediction rejected toast ─────────────────────────────────────────── */}
      <RejectionToast />

    </UiEntity>
  )
}

// ── Kick UI (from main) ───────────────────────────────────────────────────────
let kickHintShownAt  = 0
let kickHintHiddenAt = 0
const HINT_ENTER_MS  = 300
const HINT_EXIT_MS   = 220
const HINT_TARGET_LEFT = 100  // final resting x in unscaled px

const DesktopKickHint = () => {
  if (isMobile()) return <UiEntity uiTransform={{ display: 'none' }} />

  const visible = getKickHintVisible()
  const now = Date.now()

  if (visible) {
    if (kickHintShownAt === 0) kickHintShownAt = now
    kickHintHiddenAt = 0
  } else {
    if (kickHintShownAt > 0 && kickHintHiddenAt === 0) kickHintHiddenAt = now
  }

  // Exit animation finished — fully hide
  if (kickHintHiddenAt > 0 && now - kickHintHiddenAt > HINT_EXIT_MS) {
    kickHintShownAt = 0
    kickHintHiddenAt = 0
  }

  // Always render the entity (never destroy/recreate it) so borderRadius is
  // applied from the start. Visibility is controlled purely via position.
  const targetL = S(HINT_TARGET_LEFT)
  const offscreen = -500

  let leftPos: number
  if (kickHintShownAt === 0) {
    leftPos = offscreen
  } else if (kickHintHiddenAt > 0) {
    // Exit: ease-in slide back left
    const t = Math.min(1, (now - kickHintHiddenAt) / HINT_EXIT_MS)
    const eased = t * t
    leftPos = Math.round(targetL - (targetL - offscreen) * eased)
  } else {
    // Enter: ease-out cubic slide from left
    const t = Math.min(1, (now - kickHintShownAt) / HINT_ENTER_MS)
    const eased = 1 - Math.pow(1 - t, 3)
    leftPos = Math.round(offscreen + (targetL - offscreen) * eased)
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: S(160), left: leftPos },
        padding: { top: S(14), bottom: S(14), left: S(26), right: S(26) },
        borderRadius: S(28),
      }}
      uiBackground={{ color: Color4.create(0.45, 0.18, 0.9, 0.82) }}
    >
      <Label
        value="Hold  <b>E</b>  to kick"
        fontSize={S(18)}
        color={Color4.create(1, 1, 1, 0.88)}
        textAlign="middle-center"
      />
    </UiEntity>
  )
}

const MobileKickButton = () => {
  if (!isMobile()) return <UiEntity uiTransform={{ display: 'none' }} />

  const state = getMobileKickButtonState()
  if (!state.visible) {
    if (state.pressed) setMobileKickPressed(false)
    return <UiEntity uiTransform={{ display: 'none' }} />
  }

  const btnH = S(144)
  const btnW = S(Math.round((386 / 200) * 144))
  return (
    <UiEntity
      uiTransform={{
        width: btnW,
        height: btnH,
        positionType: 'absolute',
        position: {
          right: S(280),
          top: '50%'
        },
        margin: { top: -Math.round(btnH / 2) }
      }}
      onMouseDown={() => setMobileKickPressed(true)}
      onMouseUp={() => setMobileKickPressed(false)}
      onMouseLeave={() => setMobileKickPressed(false)}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}
        uiBackground={{ texture: { src: 'images/kick.png' }, textureMode: 'stretch' }}
      />
      {state.pressed && (
        <UiEntity
          uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}
          uiBackground={{ texture: { src: 'images/kick_pressed.png' }, textureMode: 'stretch' }}
        />
      )}
    </UiEntity>
  )
}

// ── Prediction panels ─────────────────────────────────────────────────────────
const KNOCKOUT_TOTAL_MATCHES = 32
const MOBILE_KO_BOARD_SRC = 'images/knockout-mobile-board.png'
const MOBILE_KO_BASE_W = 1200
const MOBILE_KO_BASE_H = 460
const MOBILE_KO_BOX_W = 82
const MOBILE_KO_BOX_H = 28
const MOBILE_KO_X = {
  r32L: 42,
  r16L: 166,
  qfL: 290,
  sfL: 414,
  final: 538,
  sfR: 662,
  qfR: 786,
  r16R: 910,
  r32R: 1034
}
const MOBILE_KO_R32_Y = [76, 118, 160, 202, 244, 286, 328, 370]
const MOBILE_KO_R16_Y = [97, 181, 265, 349]
const MOBILE_KO_QF_Y = [139, 307]
const MOBILE_KO_FINAL_Y = 181
const MOBILE_KO_THIRD_Y = 265
const MOBILE_KO_SF_Y = 223
const KO_ROUND_SLOTS = [
  { round: '32', count: 16 },
  { round: '16', count: 8 },
  { round: '8', count: 4 },
  { round: '4', count: 2 },
  { round: '2', count: 2 }
]

type KnockoutBoardProgress = {
  completed: number
  total: number
  r32Left: boolean[]
  r32Right: boolean[]
  r16Left: boolean[]
  r16Right: boolean[]
  qfLeft: boolean[]
  qfRight: boolean[]
  sfLeft: boolean
  sfRight: boolean
  final: boolean
  third: boolean
}

function getKnockoutPredictionSlots(): boolean[] {
  const submittedByFixtureId = new Map(koPredictions.map((prediction) => [prediction.fixtureId, prediction.submitted]))
  const orderedSlots = KO_ROUND_SLOTS.flatMap(({ round, count }) => {
    const fixturesInRound = koFixtures
      .filter((fixture) => fixture.round === round)
      .sort((a, b) => a.kickoff - b.kickoff || a.id - b.id)

    return Array.from({ length: count }, (_, i) => {
      const fixture = fixturesInRound[i]
      return fixture ? (submittedByFixtureId.get(fixture.id) ?? false) : false
    })
  })

  return Array.from({ length: KNOCKOUT_TOTAL_MATCHES }, (_, i) => orderedSlots[i] ?? false)
}

function getKnockoutBoardProgress(): KnockoutBoardProgress {
  const slots = getKnockoutPredictionSlots()
  const take = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => slots[start + i] ?? false)

  return {
    completed: slots.filter(Boolean).length,
    total: KNOCKOUT_TOTAL_MATCHES,
    r32Left: take(0, 8),
    r32Right: take(8, 8),
    r16Left: take(16, 4),
    r16Right: take(20, 4),
    qfLeft: take(24, 2),
    qfRight: take(26, 2),
    sfLeft: slots[28] ?? false,
    sfRight: slots[29] ?? false,
    final: slots[30] ?? false,
    third: slots[31] ?? false
  }
}

type MobileKnockoutSlot = {
  key: string
  x: number
  y: number
  active: boolean
  color: Color4
  idleColor: Color4
}

function getMobileKnockoutSlots(progress: KnockoutBoardProgress): MobileKnockoutSlot[] {
  const roundColors = (values: boolean[]) => {
    const done = values.filter(Boolean).length
    const total = values.length
    const complete = total > 0 && done === total
    const partial = done > 0 && done < total
    return {
      active: complete ? CHECKLIST_COMPLETE : CHECKLIST_PARTIAL,
      idle: done === 0 ? VIOLET : CELL_EMPTY,
      marker: complete ? CHECKLIST_COMPLETE : partial ? CHECKLIST_PARTIAL : VIOLET
    }
  }

  const r32 = roundColors([...progress.r32Left, ...progress.r32Right])
  const r16 = roundColors([...progress.r16Left, ...progress.r16Right])
  const qf = roundColors([...progress.qfLeft, ...progress.qfRight])
  const sf = roundColors([progress.sfLeft, progress.sfRight])
  const finals = roundColors([progress.final, progress.third])

  return [
    ...progress.r32Left.map((active, i) => ({ key: `r32l-${i}`, x: MOBILE_KO_X.r32L, y: MOBILE_KO_R32_Y[i], active, color: r32.active, idleColor: r32.idle })),
    ...progress.r32Right.map((active, i) => ({ key: `r32r-${i}`, x: MOBILE_KO_X.r32R, y: MOBILE_KO_R32_Y[i], active, color: r32.active, idleColor: r32.idle })),
    ...progress.r16Left.map((active, i) => ({ key: `r16l-${i}`, x: MOBILE_KO_X.r16L, y: MOBILE_KO_R16_Y[i], active, color: r16.active, idleColor: r16.idle })),
    ...progress.r16Right.map((active, i) => ({ key: `r16r-${i}`, x: MOBILE_KO_X.r16R, y: MOBILE_KO_R16_Y[i], active, color: r16.active, idleColor: r16.idle })),
    ...progress.qfLeft.map((active, i) => ({ key: `qfl-${i}`, x: MOBILE_KO_X.qfL, y: MOBILE_KO_QF_Y[i], active, color: qf.active, idleColor: qf.idle })),
    ...progress.qfRight.map((active, i) => ({ key: `qfr-${i}`, x: MOBILE_KO_X.qfR, y: MOBILE_KO_QF_Y[i], active, color: qf.active, idleColor: qf.idle })),
    { key: 'sfl', x: MOBILE_KO_X.sfL, y: MOBILE_KO_SF_Y, active: progress.sfLeft, color: sf.active, idleColor: sf.idle },
    { key: 'sfr', x: MOBILE_KO_X.sfR, y: MOBILE_KO_SF_Y, active: progress.sfRight, color: sf.active, idleColor: sf.idle },
    { key: 'final', x: MOBILE_KO_X.final, y: MOBILE_KO_FINAL_Y, active: progress.final, color: finals.active, idleColor: finals.idle },
    { key: 'third', x: MOBILE_KO_X.final, y: MOBILE_KO_THIRD_Y, active: progress.third, color: finals.active, idleColor: finals.idle }
  ]
}

const PredictionChip = (props: {
  type: 'knockout' | 'group'
  mob: boolean
  active?: boolean
  onOpen: () => void
}) => {
  const { mob, type } = props
  const uiScale = mob ? 1.3 : 0.9
  const accent = type === 'knockout' ? ACCENT_KO : ACCENT_GS_CHIP
  const label = type === 'knockout' ? 'KNOCKOUT' : 'GROUP STAGE'
  const isActive = props.active ?? false
  const completed = type === 'knockout' ? getKnockoutBoardProgress().completed : getCompletedCount()
  const total = type === 'knockout' ? KNOCKOUT_TOTAL_MATCHES : MATCHES.length
  const pct = total > 0 ? Math.round(completed / total * 100) : 0
  const chipW = S((mob ? 224 : 232) * uiScale)
  const chipH = S((mob ? 88 : 78) * uiScale)

  return (
    <UiEntity
      uiTransform={{
        width: chipW,
        height: chipH,
        flexDirection: 'row',
        alignItems: 'stretch',
        margin: `0 0 ${S((mob ? 10 : 8) * uiScale)}px 0`,
        borderRadius: S(14),
        pointerFilter: 'block',
        overflow: 'hidden'
      }}
      uiBackground={{ color: isActive ? Color4.create(accent.r * 0.32, accent.g * 0.32, accent.b * 0.32, 1) : CHIP_HOVER }}
      onMouseDown={props.onOpen}
    >
      <UiEntity uiTransform={{ width: S(5), height: '100%' }} uiBackground={{ color: accent }} />
      <UiEntity
        uiTransform={{
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'center',
          padding: { top: S(10 * uiScale), bottom: S(10 * uiScale), left: S(14 * uiScale), right: S((mob ? 6 : 10) * uiScale) }
        }}
      >
        <Label value={label} fontSize={F((mob ? 13 : 12) * uiScale)} color={Color4.White()}
          uiTransform={{ height: S((mob ? 16 : 15) * uiScale) }} />
        <Label value={`${completed} / ${total}`} fontSize={F((mob ? 22 : 21) * uiScale)} color={Color4.White()}
          uiTransform={{ height: S((mob ? 26 : 24) * uiScale), margin: `${S(2 * uiScale)}px 0 0 0` }} />
        <Label value={`${pct}% complete`} fontSize={F((mob ? 12 : 11) * uiScale)} color={accent}
          uiTransform={{ height: S((mob ? 14 : 13) * uiScale), margin: `${S(2 * uiScale)}px 0 0 0` }} />
      </UiEntity>
      <UiEntity
        uiTransform={{
          width: S((mob ? 48 : 24) * uiScale),
          alignItems: 'center',
          justifyContent: 'flex-end',
          margin: `0 ${S((mob ? 10 : 10) * uiScale)}px 0 0`
        }}
      >
        <Label value="›" fontSize={F((mob ? 42 : 20) * uiScale)} color={accent} />
      </UiEntity>
    </UiEntity>
  )
}

const Divider = (props: { mob: boolean }) => (
  <UiEntity
    uiTransform={{ width: '96%', height: S(1), margin: `0 0 ${S(props.mob ? 10 : 8)}px 0` }}
    uiBackground={{ color: props.mob ? Color4.create(1, 1, 1, 0.18) : Color4.create(1, 1, 1, 0.07) }}
  />
)

const MobilePanelHeader = (props: { title: string }) => (
  <UiEntity
    uiTransform={{
      width: '100%',
      flexDirection: 'column',
      alignItems: 'flex-start',
      padding: { top: S(16), bottom: S(10), left: S(16), right: S(16) }
    }}
  >
    <Label value={props.title} fontSize={F(24)} color={Color4.White()}
      uiTransform={{ height: S(30) }} />
  </UiEntity>
)

const MatchChecklist = () => {
  const mob = isMobile()
  const mobileUiScale = mob ? 1.3 : 1
  const k = mob ? 1.55 * mobileUiScale : 1
  const desktopChipScale = 0.9
  const mobileButtonsLeft = S(184)
  const mobileButtonsTop = '21%'
  const mobileGap = S(24)
  const mobileChipWidth = S(248 * 1.3)
  const desktopButtonsLeft = S(64)
  const desktopButtonsTop = '29%'
  const desktopGap = S(28)
  const desktopChipWidth = S(232 * desktopChipScale)
  const buttonsLeft = mob ? mobileButtonsLeft : desktopButtonsLeft
  const buttonsTop = mob ? mobileButtonsTop : desktopButtonsTop
  const panelGap = mob ? mobileGap : desktopGap
  const chipWidth = mob ? mobileChipWidth : desktopChipWidth
  const hidden =
    welcomeState.visible ||
    groupState.visible || adminState.visible || infoState.visible || scoreState.visible || celebrateState.visible

  const switchTab = (panel: 'knockout' | 'group') => {
    playClick()
    predictionPanelState.expanded = panel
  }
  const minimize = () => {
    playClick()
    predictionPanelState.expanded = null
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        display: hidden ? 'none' : 'flex'
      }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: buttonsTop, left: buttonsLeft },
          width: 'auto',
          flexDirection: 'column',
          alignItems: 'flex-start'
        }}
      >
        <PredictionChip
          type="knockout"
          mob={mob}
          active={predictionPanelState.expanded === 'knockout'}
          onOpen={() => switchTab('knockout')}
        />
        <PredictionChip
          type="group"
          mob={mob}
          active={predictionPanelState.expanded === 'group'}
          onOpen={() => switchTab('group')}
        />
      </UiEntity>

      {predictionPanelState.expanded !== null && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: buttonsTop, left: buttonsLeft + chipWidth + panelGap },
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: S(24),
            overflow: 'hidden'
          }}
          uiBackground={{ color: Color4.create(0.015, 0.02, 0.06, 0.995) }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: S(mob ? 10 : 12), right: S(mob ? 10 : 12) },
              width: S(mob ? 58 : 29),
              height: S(mob ? 58 : 29),
              borderRadius: S(mob ? 14 : 7),
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'block'
            }}
            uiBackground={{ color: Color4.create(0.18, 0.14, 0.28, 1) }}
            onMouseDown={minimize}
          >
            <Label value="×" fontSize={F(mob ? 36 : 18)} color={Color4.White()} />
          </UiEntity>
          <MobilePanelHeader title={predictionPanelState.expanded === 'knockout' ? 'KNOCKOUT STAGE' : 'GROUP STAGE'} />
          <Divider mob={mob} />
          {predictionPanelState.expanded === 'knockout' && (
            <KnockoutChecklistPanel mob={mob} k={k} />
          )}
          {predictionPanelState.expanded === 'group' && (
            <GroupStageChecklistPanel mob={mob} k={k} />
          )}
        </UiEntity>
      )}

    </UiEntity>
  )
}

const ScoreEntryButton = () => {
  const mob = isMobile()
  const uiScale = mob ? 1.3 : 0.9
  const chipWidth = S((mob ? 248 : 232) * uiScale)
  const hidden =
    welcomeState.visible ||
    groupState.visible || adminState.visible || infoState.visible || celebrateState.visible

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: S(mob ? 150 : 100), left: 0 },
        width: '100%',
        height: S(mob ? 120 : 100),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        display: hidden ? 'none' : 'flex'
      }}
    >
      <ImgButton
        src={scoreState.visible ? 'images/buttons/myscore_pressed.png' : 'images/buttons/myscore.png'}
        width={chipWidth}
        height={S((mob ? 92 : 84) * uiScale)}
        onMouseDown={() => openScorePanel()}
      />
    </UiEntity>
  )
}

const GroupStageChecklistPanel = (props: { mob: boolean; k: number }) => {
  const cluster = (g: (typeof GROUPS)[number]) => {
    const done = g.matches.filter(isMatchDone).length
    const complete = done === g.matches.length
    const activeColor = complete ? CHECKLIST_COMPLETE : done > 0 ? CHECKLIST_PARTIAL : VIOLET

    return (
      <UiEntity key={g.name} uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: `${S(4 * props.k)}px ${S(5)}px` }}>
        <UiEntity uiTransform={{ flexDirection: 'row' }}>
          {g.matches.map((m, mi) => (
            <UiEntity key={mi}
              uiTransform={{
                width: S(14 * props.k),
                height: S(14 * props.k),
                margin: S(1 * props.k),
                borderRadius: S(3 * props.k)
              }}
              uiBackground={{ color: isMatchDone(m) ? activeColor : CELL_EMPTY }} />
          ))}
        </UiEntity>
        <Label value={g.name.replace('Group ', '')} fontSize={F(13 * props.k)}
          color={complete ? CHECKLIST_COMPLETE : TAB_INACTIVE}
          uiTransform={{ height: S(16 * props.k) }} />
      </UiEntity>
    )
  }

  const rows = [GROUPS.slice(0, 2), GROUPS.slice(2, 4), GROUPS.slice(4, 6), GROUPS.slice(6, 8), GROUPS.slice(8, 10), GROUPS.slice(10, 12)]
  const pct = Math.round(getCompletedCount() / MATCHES.length * 100)

  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: 0, bottom: S(10 * props.k), left: S(14 * props.k), right: S(14 * props.k) }
      }}
    >
      <UiEntity
        uiTransform={{
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          margin: `0 0 ${S(props.mob ? 14 : 10)}px 0`
        }}
      >
        <Label
          value={`MATCHES PREDICTED ${getCompletedCount()} / ${MATCHES.length}`}
          fontSize={F(props.mob ? 19 : 15)}
          color={Color4.White()}
          uiTransform={{ height: S(props.mob ? 24 : 18) }}
        />
      </UiEntity>
      <UiEntity
        uiTransform={{
          width: '100%',
          height: S(props.mob ? 6 : 5),
          borderRadius: S(3),
          margin: `0 0 ${S(props.mob ? 14 : 10)}px 0`
        }}
        uiBackground={{ color: Color4.create(1, 1, 1, 0.08) }}
      >
        <UiEntity
          uiTransform={{ width: `${pct}%`, height: '100%', borderRadius: S(3) }}
          uiBackground={{ color: ACCENT_GS_CHIP }}
        />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
        {rows.map((rowGroups, ri) => (
          <UiEntity key={ri} uiTransform={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {rowGroups.map(g => cluster(g))}
          </UiEntity>
        ))}
      </UiEntity>
    </UiEntity>
  )
}

const KnockoutChecklistPanel = (props: { mob: boolean; k: number }) => {
  const progress = getKnockoutBoardProgress()
  const panelScale = props.k / 1.55
  const labelColor = Color4.White()
  const compactScale = 1.1
  const boardW = S(760 * compactScale)
  const boardH = Math.round(boardW * MOBILE_KO_BASE_H / MOBILE_KO_BASE_W)
  const boxW = Math.round(boardW * MOBILE_KO_BOX_W / MOBILE_KO_BASE_W)
  const boxH = Math.round(boardH * MOBILE_KO_BOX_H / MOBILE_KO_BASE_H)
  const slotCoreW = Math.round(boxW * 0.7)
  const slotCoreH = Math.round(boxH * 0.58)
  const slotCoreRadius = Math.max(4, Math.round(boxH * 0.18))
  const slotMarker = Math.max(8, Math.round(boxH * 0.28))
  const slotMarkerRadius = Math.max(3, Math.round(slotMarker * 0.3))
  const slotCoreColor = Color4.fromHexString('#1b2437ff')
  const slots = getMobileKnockoutSlots(progress)

  return (
    <UiEntity
      uiTransform={{
        padding: {
          top: S(4 * panelScale * compactScale),
          bottom: S(14 * panelScale * compactScale),
          left: S(20 * panelScale * compactScale),
          right: S(20 * panelScale * compactScale)
        },
        flexDirection: 'column',
        alignItems: 'flex-start',
        alignSelf: 'flex-start'
      }}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: `0 0 ${S(8 * panelScale * compactScale)}px 0`
        }}
      >
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <Label value="MATCHES PREDICTED" fontSize={F(15 * compactScale)} color={labelColor}
            uiTransform={{ height: S(18 * compactScale) }} />
          <Label value={`${progress.completed} / ${progress.total}`} fontSize={F(34 * compactScale)} color={Color4.White()}
            uiTransform={{ height: S(40 * compactScale), margin: `${S(4 * compactScale)}px 0 0 0` }} />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-end' }}>
          <Label value="BRACKET STATUS" fontSize={F(15 * compactScale)} color={labelColor}
            uiTransform={{ height: S(18 * compactScale) }} />
          <Label
            value={progress.completed === progress.total ? 'COMPLETE' : `${Math.round(progress.completed / progress.total * 100)}%`}
            fontSize={F(34 * compactScale)}
            color={ACCENT_KO}
            uiTransform={{ height: S(40 * compactScale), margin: `${S(4 * compactScale)}px 0 0 0` }}
          />
        </UiEntity>
      </UiEntity>

      <UiEntity
        uiTransform={{
          width: boardW,
          height: boardH,
          positionType: 'relative',
          margin: `${S(6 * compactScale)}px 0 0 0`
        }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { left: 0, top: 0 } }}
          uiBackground={{ texture: { src: MOBILE_KO_BOARD_SRC }, textureMode: 'stretch' }}
        />

        {slots.map((slot) => (
          <UiEntity
            key={slot.key}
            uiTransform={{
              width: boxW,
              height: boxH,
              positionType: 'absolute',
              position: {
                left: Math.round(boardW * slot.x / MOBILE_KO_BASE_W),
                top: Math.round(boardH * slot.y / MOBILE_KO_BASE_H)
              },
              borderRadius: S(8 * compactScale),
              alignItems: 'center',
              justifyContent: 'center'
            }}
            uiBackground={{ color: slot.active ? slot.color : slot.idleColor }}
          >
            <UiEntity
              uiTransform={{
                width: slotCoreW,
                height: slotCoreH,
                borderRadius: slotCoreRadius
              }}
              uiBackground={{ color: slot.active ? Color4.create(0, 0, 0, 0.18) : (slot.idleColor === VIOLET ? Color4.create(0, 0, 0, 0.14) : slotCoreColor) }}
            />
            <UiEntity
              uiTransform={{
                width: slotMarker,
                height: slotMarker,
                borderRadius: slotMarkerRadius,
                positionType: 'absolute'
              }}
              uiBackground={{ color: slot.active ? Color4.White() : (slot.idleColor === VIOLET ? Color4.White() : Color4.create(1, 1, 1, 0.36)) }}
            />
          </UiEntity>
        ))}
      </UiEntity>
    </UiEntity>
  )
}

// ── Group prediction form — step through a group's matches and set scores ──────
const GroupForm = () => {
  if (!groupState.visible) return <UiEntity uiTransform={{ display: 'none' }} />
  const g = GROUPS[groupState.groupIndex]
  if (!g) return <UiEntity uiTransform={{ display: 'none' }} />
  const match = g.matches[groupState.matchIndex]
  if (!match) return <UiEntity uiTransform={{ display: 'none' }} />

  const total  = g.matches.length
  const connected  = isServerReady()
  const finished   = hasResult(match.id)
  const timeLocked = isMatchLocked(match.team1, match.team2)
  const locked = finished || timeLocked     // can't edit a finished or about-to-start match
  const saved  = predictions.find(p => p.matchId === match.id)?.submitted ?? false
  const done   = g.matches.filter(m => predictions.find(p => p.matchId === m.id)?.submitted ?? false).length
  const complete = total > 0 && g.matches.every(isMatchDone)
  const canPrev = groupState.matchIndex > 0
  const canNext = groupState.matchIndex < total - 1

  const mob = isMobile()
  const stepH = mob ? 112 : 84    // +/- score buttons (bigger touch target on mobile)
  const actH  = mob ? 116 : 96    // bottom action buttons
  const teamsH = mob ? 470 : 440  // team column height (room for bigger +/- on mobile)
  const inferred = impliedWinner(groupState.score1, groupState.score2)
  const resultText =
    inferred === 'draw'  ? 'Draw' :
    inferred === 'team1' ? `${match.team1} wins` :
                           `${match.team2} wins`

  // Persist the current match. `force` saves even an untouched 0-0 (explicit Save);
  // otherwise (nav/close) we only save if it was actually edited.
  const commit = (force: boolean) => {
    if (!locked && connected && (force || groupState.dirty)) {
      const wasComplete = isGroupComplete(groupState.groupIndex)
      savePrediction(match.id, inferred, groupState.score1, groupState.score2)
      groupState.onChange?.()
      // Group just got completed (but not the whole prode) → play the complete sound.
      if (!wasComplete && isGroupComplete(groupState.groupIndex) && getCompletedCount() < MATCHES.length) {
        playComplete()
      }
      maybeCelebrate()
      groupState.dirty = false
    }
  }
  const go = (delta: number) => {
    const next = groupState.matchIndex + delta
    if (next < 0 || next >= total) return
    commit(false)                         // navigating: save only edited matches
    groupState.matchIndex = next
    loadGroupMatch()
  }
  const close = () => { commit(false); groupState.visible = false }
  // Explicit save: send to server and wait for ack before advancing.
  const saveNext = () => {
    if (groupState.saving || locked || !connected) return
    groupState.saving = true
    groupState.pendingAdvance = () => {
      if (canNext) { groupState.matchIndex += 1; loadGroupMatch() }
      else groupState.visible = false
    }
    commit(true)
  }

  // One team column: flag + name + score + +/- , highlighted when it's the winner.
  const teamCol = (
    name: string, flag: FlagRef, score: number, win: boolean,
    dec: () => void, inc: () => void
  ) => (
    <UiEntity
      uiTransform={{
        width: S(510), height: S(teamsH), padding: S(22),
        flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        borderRadius: S(28)
      }}
      uiBackground={{ color: win ? TEAL : DARK_BTN }}
    >
      <UiEntity uiTransform={{ width: S(240), height: S(160) }}
        uiBackground={{ texture: { src: flag.src }, textureMode: 'stretch', uvs: flag.uvs }} />
      <Label value={name} fontSize={F(32)} color={Color4.White()} uiTransform={{ width: '100%', height: S(56) }} />
      <Label value={String(score)} fontSize={F(92)} color={Color4.White()} uiTransform={{ width: '100%', height: S(110) }} />
      <UiEntity uiTransform={{ width: '100%', height: S(stepH), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ImgButton src="images/buttons/-.png"
          width={S(stepH * 1.116)} height={S(stepH)}
          tint={locked ? Color4.create(0.4, 0.4, 0.4, 1) : undefined}
          onMouseDown={() => { if (!locked && score > 0) dec() }} />
        <ImgButton src="images/buttons/+.png"
          width={S(stepH * 1.144)} height={S(stepH)}
          tint={locked ? Color4.create(0.4, 0.4, 0.4, 1) : undefined}
          onMouseDown={() => { if (!locked) inc() }} />
      </UiEntity>
    </UiEntity>
  )

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%',
        positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: S(1360), height: S(mob ? 1040 : 900), padding: S(56), alignSelf: 'center',
          flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between',
          borderRadius: S(40)
        }}
        uiBackground={{ color: DARK }}
      >
        {/* Header: group name + completion badge */}
        <UiEntity uiTransform={{ width: '100%', height: S(64), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: `0 0 ${S(12)}px 0` }}>
          <Label value={g.name} fontSize={F(50)} color={Color4.White()} uiTransform={{ height: S(64) }} />
          <UiEntity uiTransform={{ height: S(52), alignItems: 'center', justifyContent: 'center', padding: `0 ${S(22)}px 0 ${S(22)}px`, borderRadius: S(26) }}
            uiBackground={ complete ? { color: VIOLET } : undefined }>
            <Label value={complete ? 'GROUP COMPLETE' : `${done} / ${total} predicted`}
              fontSize={F(30)} color={complete ? Color4.White() : TEAL} uiTransform={{ height: S(52) }} />
          </UiEntity>
        </UiEntity>

        {/* Progress bar */}
        <UiEntity uiTransform={{ width: '100%', height: S(18), borderRadius: S(9), margin: `0 0 ${S(22)}px 0` }}
          uiBackground={{ color: Color4.create(0.15, 0.15, 0.3, 1) }}>
          <UiEntity uiTransform={{ width: `${Math.round(100 * done / total)}%`, height: S(18), borderRadius: S(9) }}
            uiBackground={{ color: VIOLET }} />
        </UiEntity>



        {/* Teams */}
        <UiEntity uiTransform={{ width: '100%', height: S(teamsH), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: `0 0 ${S(10)}px 0` }}>
          {teamCol(match.team1, match.flag1, groupState.score1, inferred === 'team1',
            () => { groupState.score1--; groupState.dirty = true }, () => { groupState.score1++; groupState.dirty = true })}
          <Label value="VS" fontSize={F(44)} color={Color4.create(0.55, 0.55, 0.55, 1)} uiTransform={{ width: S(110), height: S(teamsH) }} />
          {teamCol(match.team2, match.flag2, groupState.score2, inferred === 'team2',
            () => { groupState.score2--; groupState.dirty = true }, () => { groupState.score2++; groupState.dirty = true })}
        </UiEntity>

        {/* Inferred result / lock status / connection warning */}
        <Label
          value={!connected ? 'Server not connected — predictions disabled'
            : finished ? 'Match finished - predictions are locked'
            : timeLocked ? 'Voting closed - kickoff is near'
            : resultText}
          fontSize={F(36)} color={!connected ? RED : locked ? RED : GOLD}
          uiTransform={{ width: '100%', height: S(52), margin: `0 0 ${S(mob ? 26 : 18)}px 0` }}
        />

        {/* Actions — CLOSE · PREV (images) · SAVE & NEXT (text until its image) */}
        <UiEntity uiTransform={{ width: '100%', height: S(actH + 6), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ImgButton src="images/buttons/close.png"
            width={S(actH * 2.27)} height={S(actH)}
            onMouseDown={close} />
          <ImgButton src="images/buttons/prev.png"
            width={S(actH * 2.18)} height={S(actH)}
            tint={canPrev ? undefined : Color4.create(0.4, 0.4, 0.4, 1)}
            onMouseDown={() => { if (canPrev) go(-1) }} />
          {locked
            ? (canNext
                // Locked match → can't save, but you can still skip ahead to the next ones.
                ? <ImgButton src="images/buttons/Next-primary.png"
                    width={S(actH * 2.356)} height={S(actH)}
                    onMouseDown={() => go(1)} />
                // Locked + last match → nothing to advance to; keep layout with a spacer.
                : <UiEntity uiTransform={{ width: S(actH * 2.356), height: S(actH) }} />)
            : <ImgButton src={canNext ? 'images/buttons/saveandnext.png' : 'images/buttons/save-primary.png'}
                width={S(actH * (canNext ? 3.148 : 3.034))} height={S(actH)}
                tint={(groupState.saving || !connected) ? Color4.create(0.4, 0.4, 0.4, 1) : undefined}
                onMouseDown={saveNext} />}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── Celebration: all 72 predictions complete ──────────────────────────────────
const CompletionOverlay = () => {
  if (!celebrateState.visible) return <UiEntity uiTransform={{ display: 'none' }} />
  const mob = isMobile()
  const imgW = mob ? 1360 : 1000          // match the welcome / voting panel width
  const imgH = imgW / 1.647               // allComplete.png is 850x516
  const BTN_BOTTOM = mob ? 90 : 50        // LetsGo distance from image bottom
  const btnH = mob ? 96 : 80
  const btnW = btnH * 3.034               // LetsGo-primary.png ratio
  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      {/* Completion panel (text baked into the image) — LetsGo button overlaid */}
      <UiEntity
        uiTransform={{
          width: S(imgW), height: S(imgH), alignSelf: 'center',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end'
        }}
        uiBackground={{ texture: { src: 'images/buttons/allComplete.png' }, textureMode: 'stretch' }}
      >
        <UiEntity uiTransform={{ margin: `0 0 ${S(BTN_BOTTOM)}px 0` }}>
          <ImgButton src="images/buttons/LetsGo-primary.png"
            width={S(btnW)} height={S(btnH)}
            onMouseDown={() => { celebrateState.visible = false }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── My Score — player stats (points + rank, hits breakdown, accuracy) ──────────
const ScorePanel = () => {
  if (!scoreState.visible) return <UiEntity uiTransform={{ display: 'none' }} />
  const mob = isMobile()
  const activeTab = scoreState.tab
  const totalAccent = Color4.fromHexString('#F28C28ff')
  const totalAccentSoft = Color4.fromHexString('#FFD089ff')
  const totalAccentDim = Color4.fromHexString('#C96D1Dff')
  const groupAccent = Color4.fromHexString('#B9BBC7ff')
  const groupAccentSoft = Color4.fromHexString('#E6E7EDff')
  const groupAccentDim = Color4.fromHexString('#8F92A0ff')
  const knockoutAccent = ACCENT_KO
  const knockoutAccentSoft = Color4.fromHexString('#CEB1FFFF')
  const knockoutAccentDim = Color4.fromHexString('#7B5FC8ff')
  const panelAccent = activeTab === 'total' ? totalAccent : activeTab === 'group' ? groupAccent : knockoutAccent
  const panelSoft = activeTab === 'total' ? Color4.create(0.22, 0.12, 0.03, 0.45) : activeTab === 'group' ? Color4.create(0.16, 0.18, 0.24, 0.45) : Color4.create(0.16, 0.10, 0.28, 0.45)
  const cardBg = activeTab === 'total' ? Color4.create(0.24, 0.16, 0.08, 0.92) : activeTab === 'group' ? Color4.create(0.22, 0.24, 0.30, 0.92) : Color4.create(0.21, 0.19, 0.38, 0.92)
  const sectionBg = activeTab === 'total' ? Color4.create(0.15, 0.09, 0.03, 0.42) : activeTab === 'group' ? Color4.create(0.15, 0.17, 0.22, 0.42) : Color4.create(0.12, 0.09, 0.20, 0.42)
  const totalGroupCardBg = Color4.create(0.24, 0.24, 0.30, 0.92)
  const totalKnockoutCardBg = Color4.create(0.21, 0.19, 0.38, 0.92)

  let groupExact = 0, groupWinner = 0, groupMissed = 0, groupPending = 0
  for (const p of predictions) {
    if (!p.submitted) continue
    const r = getResult(p.matchId)
    if (!r) { groupPending++; continue }
    const s = scorePrediction(p, r)
    if (s === PTS_WINNER + PTS_SCORE) groupExact++
    else if (s === PTS_WINNER) groupWinner++
    else groupMissed++
  }

  let koExact = 0, koWinner = 0, koMissed = 0, koPending = 0
  for (const p of koPredictions) {
    if (!p.submitted) continue
    const r = koResults.get(p.fixtureId)
    if (!r) { koPending++; continue }
    const s = scoreKoPrediction(p, r)
    if (s === PTS_WINNER + PTS_SCORE) koExact++
    else if (s === PTS_WINNER) koWinner++
    else koMissed++
  }

  const groupPlayed = groupExact + groupWinner + groupMissed
  const koPlayed = koExact + koWinner + koMissed
  const totalPlayed = groupPlayed + koPlayed
  const groupAccuracy = groupPlayed > 0 ? Math.round(((groupExact + groupWinner) / groupPlayed) * 100) : null
  const koAccuracy = koPlayed > 0 ? Math.round(((koExact + koWinner) / koPlayed) * 100) : null
  const totalAccuracy = totalPlayed > 0 ? Math.round(((groupExact + groupWinner + koExact + koWinner) / totalPlayed) * 100) : null
  const groupPoints = myPoints()
  const koPoints = myKoPoints()
  const totalPoints = groupPoints + koPoints

  // Rank from the cached leaderboard (sorted desc by points), matched by wallet.
  const lb   = getLeaderboard()
  const me   = getPlayer()?.userId?.toLowerCase()
  const idx  = me ? lb.findIndex(r => r.address?.toLowerCase() === me) : -1
  const rank = idx >= 0 ? `#${idx + 1} / ${lb.length}` : 'Unranked'

  const statBlock = (label: string, value: string, color: Color4, bg: Color4, compact = false) => (
    <UiEntity
      uiTransform={{
        width: S(compact ? (mob ? 298 : 168) : (mob ? 318 : 286)),
        height: S(compact ? (mob ? 104 : 84) : (mob ? 112 : 102)),
        padding: S(compact ? 10 : 14),
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: S(18)
      }}
      uiBackground={{ color: bg }}
    >
      <UiEntity
        uiTransform={{ width: S(compact ? 34 : 46), height: S(4), borderRadius: S(2), margin: `0 0 ${S(compact ? 8 : 10)}px 0` }}
        uiBackground={{ color }}
      />
      <Label value={value} fontSize={F(compact ? (mob ? 40 : 28) : (mob ? 46 : 40))} color={color}
        uiTransform={{ width: '100%', height: S(compact ? (mob ? 44 : 32) : (mob ? 52 : 46)) }} />
      <Label value={label} fontSize={F(compact ? (mob ? 19 : 15) : (mob ? 21 : 19))} color={Color4.create(0.78, 0.78, 0.82, 1)}
        uiTransform={{ width: '100%', height: S(compact ? 24 : 30) }} />
    </UiEntity>
  )

  const totalStatGrid = () => {
    if (!mob) {
      return (
        <UiEntity uiTransform={{ width: '100%', height: S(84), flexDirection: 'row', justifyContent: 'space-between', margin: `0 0 ${S(20)}px 0` }}>
          {statBlock('Group stage', `${groupPoints}`, Color4.White(), totalGroupCardBg, true)}
          {statBlock('Knockout stage', `${koPoints}`, knockoutAccentSoft, totalKnockoutCardBg, true)}
          {statBlock('Total points', `${totalPoints}`, totalAccent, cardBg, true)}
          {statBlock('Leaderboard', rank, totalAccentSoft, cardBg, true)}
        </UiEntity>
      )
    }

    return (
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', margin: `0 0 ${S(20)}px 0` }}>
        <UiEntity uiTransform={{ width: '100%', height: S(104), flexDirection: 'row', justifyContent: 'space-between', margin: `0 0 ${S(12)}px 0` }}>
          {statBlock('Group stage', `${groupPoints}`, Color4.White(), totalGroupCardBg, true)}
          {statBlock('Knockout stage', `${koPoints}`, knockoutAccentSoft, totalKnockoutCardBg, true)}
        </UiEntity>
        <UiEntity uiTransform={{ width: '100%', height: S(104), flexDirection: 'row', justifyContent: 'space-between' }}>
          {statBlock('Total points', `${totalPoints}`, totalAccent, cardBg, true)}
          {statBlock('Leaderboard', rank, totalAccentSoft, cardBg, true)}
        </UiEntity>
      </UiEntity>
    )
  }

  const tabButton = (id: 'total' | 'group' | 'knockout', label: string, accent: Color4) => {
    const active = activeTab === id
    return (
      <UiEntity
        key={id}
        uiTransform={{
          width: 'auto',
          height: S(mob ? 64 : 44),
          margin: `0 ${S(mob ? 12 : 10)}px 0 ${S(mob ? 12 : 10)}px`,
          padding: { left: S(4), right: S(4), top: 0, bottom: 0 },
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'block'
        }}
        onMouseDown={() => { playClick(); scoreState.tab = id }}
      >
        <Label
          value={label}
          fontSize={F(mob ? 24 : 17)}
          color={active ? Color4.White() : MUTED}
          uiTransform={{ height: S(mob ? 30 : 20), margin: `0 0 ${S(6)}px 0` }}
        />
        <UiEntity
          uiTransform={{ width: '100%', height: S(3), borderRadius: S(2) }}
          uiBackground={{ color: active ? accent : Color4.create(0, 0, 0, 0) }}
        />
      </UiEntity>
    )
  }

  const breakdownRow = (label: string, count: number, color: Color4) => (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: S(mob ? 54 : 48),
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: `0 0 ${S(8)}px 0`,
        padding: { left: S(12), right: S(12) },
        borderRadius: S(14)
      }}
      uiBackground={{ color: Color4.create(1, 1, 1, 0.03) }}
    >
      <Label value={label} fontSize={F(mob ? 26 : 24)} color={Color4.White()} uiTransform={{ height: S(40) }} />
      <Label value={String(count)} fontSize={F(mob ? 30 : 28)} color={color} uiTransform={{ height: S(40) }} />
    </UiEntity>
  )

  // Matches already played in the tournament (those with an official result).
  const groupResolved = MATCHES.filter(m => hasResult(m.id)).length
  const totalResolved = groupResolved + koResults.size
  const totalFixtures = MATCHES.length + koFixtures.length

  const breakdownSection = (
    title: string,
    accent: Color4,
    strong: Color4,
    mid: Color4,
    low: Color4,
    exact: number,
    winner: number,
    missed: number,
    pending: number,
    played: number,
    accuracy: number | null,
    predictedCount: number,
    totalCount: number
  ) => (
    <UiEntity
      uiTransform={{
        width: '100%',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: S(20),
        borderRadius: S(24)
      }}
      uiBackground={{ color: sectionBg }}
    >
      <Label value={title} fontSize={F(mob ? 28 : 26)} color={accent}
        uiTransform={{ width: '100%', height: S(38), margin: `0 0 ${S(10)}px 0` }} />
      <Label value={`Predicted: ${predictedCount} / ${totalCount}`} fontSize={F(24)}
        color={Color4.create(0.7, 0.7, 0.7, 1)} uiTransform={{ width: '100%', height: S(34), margin: `0 0 ${S(12)}px 0` }} />
      {breakdownRow(`Exact scores  (+${PTS_WINNER + PTS_SCORE})`, exact, strong)}
      {breakdownRow(`Correct winner  (+${PTS_WINNER})`, winner, mid)}
      {breakdownRow('Missed', missed, low)}
      {breakdownRow('Pending (not played yet)', pending, Color4.create(0.6, 0.6, 0.7, 1))}
      <Label
        value={accuracy === null ? 'Accuracy: - (no matches played yet)' : `Accuracy: ${accuracy}%   (${exact + winner} hits / ${played} played)`}
        fontSize={F(26)} color={accent}
        uiTransform={{ width: '100%', height: S(40), margin: `${S(6)}px 0 0 0` }}
      />
    </UiEntity>
  )

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: S(880), height: S(mob ? 1030 : 900), padding: S(40), alignSelf: 'center',
          flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
          borderRadius: S(36)
        }}
        uiBackground={{ color: DARK }}
      >
        <UiEntity
          uiTransform={{
            width: '100%',
            padding: { top: S(18), bottom: S(18), left: S(22), right: S(22) },
            margin: `0 0 ${S(18)}px 0`,
            borderRadius: S(24),
            flexDirection: 'column',
            alignItems: 'center'
          }}
          uiBackground={{ color: panelSoft }}
        >
        <Label value="MY SCORE" fontSize={F(46)} color={panelAccent}
          uiTransform={{ width: '100%', height: S(60), margin: `0 0 ${S(4)}px 0` }} />
        <Label value={`Matches with results: ${totalResolved} / ${totalFixtures}`} fontSize={F(24)}
          color={Color4.create(0.78, 0.78, 0.82, 1)} uiTransform={{ width: '100%', height: S(34) }} />
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: S(mob ? 64 : 44), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: `0 0 ${S(20)}px 0` }}>
          {tabButton('total', 'TOTAL SCORE', totalAccent)}
          {tabButton('group', 'GROUP STAGE', groupAccent)}
          {tabButton('knockout', 'KNOCKOUT STAGE', knockoutAccent)}
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', flex: 1, flexDirection: 'column', alignItems: 'stretch' }}>
          {activeTab === 'total' && (
            <UiEntity
              uiTransform={{
                width: '100%',
                flexDirection: 'column',
                alignItems: 'stretch',
                padding: S(20),
                borderRadius: S(24)
              }}
              uiBackground={{ color: sectionBg }}
            >
              {totalStatGrid()}
              <Label value="Overall summary" fontSize={F(26)} color={totalAccent}
                uiTransform={{ width: '100%', height: S(36), margin: `0 0 ${S(16)}px 0` }} />
              {breakdownRow('Exact scores total', groupExact + koExact, totalAccentSoft)}
              {breakdownRow('Correct winners total', groupWinner + koWinner, totalAccent)}
              {breakdownRow('Missed total', groupMissed + koMissed, totalAccentDim)}
              {breakdownRow('Pending total', groupPending + koPending, Color4.create(0.6, 0.6, 0.7, 1))}
              <Label
                value={totalAccuracy === null ? 'Accuracy: - (no matches played yet)' : `Accuracy: ${totalAccuracy}%   (${groupExact + groupWinner + koExact + koWinner} hits / ${totalPlayed} played)`}
                fontSize={F(26)} color={totalAccent}
                uiTransform={{ width: '100%', height: S(40), margin: `${S(12)}px 0 0 0` }}
              />
            </UiEntity>
          )}

          {activeTab === 'group' && breakdownSection(
            'Group Stage Results',
            groupAccent,
            groupAccentSoft,
            groupAccent,
            groupAccentDim,
            groupExact,
            groupWinner,
            groupMissed,
            groupPending,
            groupPlayed,
            groupAccuracy,
            predictions.filter(p => p.submitted).length,
            MATCHES.length
          )}

          {activeTab === 'knockout' && breakdownSection(
            'Knockout Stage Results',
            knockoutAccent,
            knockoutAccentSoft,
            knockoutAccent,
            knockoutAccentDim,
            koExact,
            koWinner,
            koMissed,
            koPending,
            koPlayed,
            koAccuracy,
            koPredictions.filter(p => p.submitted).length,
            koFixtures.length
          )}
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: S(88), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: `${S(24)}px 0 0 0` }}>
          <ImgButton src="images/buttons/close.png"
            width={S(88 * 2.27)} height={S(88)}
            onMouseDown={() => { scoreState.visible = false }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── Prediction rejected toast — non-blocking banner, auto-dismisses after 3s ──
const RejectionToast = () => {
  if (!toastState.visible) return <UiEntity uiTransform={{ display: 'none' }} />
  const mob = isMobile()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: S(mob ? 180 : 140), left: 0 },
        width: '100%', height: S(mob ? 80 : 64),
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          padding: `${S(12)}px ${S(32)}px`,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          borderRadius: S(16)
        }}
        uiBackground={{ color: Color4.fromHexString('#B03030ee') }}
      >
        <Label
          value={toastState.message}
          fontSize={F(mob ? 22 : 18)}
          color={Color4.White()}
          uiTransform={{ height: S(mob ? 32 : 26) }}
        />
      </UiEntity>
    </UiEntity>
  )
}

// ── Wearable claim status — "on the way" while requesting, "received!" on success
const ClaimOverlay = () => {
  if (!claimState.visible) return <UiEntity uiTransform={{ display: 'none' }} />
  const mob = isMobile()
  const done = claimState.done
  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: S(mob ? 900 : 880), height: S(done ? 480 : 340), padding: S(56), alignSelf: 'center',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: S(36)
        }}
        uiBackground={{ color: DARK }}
      >
        <Label value={done ? 'Received!' : 'New item on the way'} fontSize={F(46)}
          color={done ? TEAL : VIOLET} uiTransform={{ width: '100%', height: S(70), margin: `0 0 ${S(8)}px 0` }} />
        <Label
          value={done
            ? 'The wearable is on its way to your wallet — check your backpack.'
            : 'Claiming your wearable...'}
          fontSize={F(26)} color={Color4.create(0.75, 0.75, 0.75, 1)}
          uiTransform={{ width: '100%', height: S(72) }} />
        {done && (
          <UiEntity uiTransform={{ width: '100%', height: S(92), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <ImgButton src="images/buttons/gotit-primary.png"
              width={S(92 * 3.034)} height={S(92)}
              onMouseDown={() => { hideClaim() }} />
          </UiEntity>
        )}
      </UiEntity>
    </UiEntity>
  )
}

// ── Welcome — shown on entry, dismissed with "Go!" ────────────────────────────
const ServerGateOverlay = () => {
  if (!serverGateState.visible) return <UiEntity uiTransform={{ display: 'none' }} />
  const mob = isMobile()
  const imgW = mob ? 1360 : 1000
  const imgH = imgW / 1.647
  const spinnerSize = mob ? 170 : 132

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: S(imgW), height: S(imgH),
          positionType: 'relative',
          alignItems: 'center', justifyContent: 'center'
        }}
        uiBackground={{ texture: { src: 'images/server_modal.png' }, textureMode: 'stretch' }}
      >
        <UiEntity
          uiTransform={{
            width: S(spinnerSize), height: S(spinnerSize),
            positionType: 'absolute',
            position: { bottom: S(mob ? 78 : 58) }
          }}
        >
          <UiEntity
            uiTransform={{
              width: '100%', height: '100%',
              positionType: 'absolute', position: { top: 0, left: 0 }
            }}
            uiBackground={{ texture: { src: 'images/loadingback.png' }, textureMode: 'stretch' }}
          />
          <UiEntity
            uiTransform={{
              width: '100%', height: '100%',
              positionType: 'absolute', position: { top: 0, left: 0 }
            }}
            uiBackground={{
              texture: { src: 'images/loadingcolor.png' },
              textureMode: 'stretch',
              uvs: rotateUVs(serverGateState.spinnerAngle)
            }}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

const WelcomeOverlay = () => {
  if (!welcomeState.visible) return <UiEntity uiTransform={{ display: 'none' }} />
  const mob = isMobile()
  const imgW = mob ? 1360 : 1000         // mobile: match the voting modal width
  const imgH = imgW / 1.647              // welcome_1/2/3.png are 850x516
  const BTN_BOTTOM = mob ? 90 : 50       // button distance from image bottom — mobile : desktop

  const last = welcomeState.step >= 2
  const btnSrc   = last ? 'images/buttons/jointhechallenge.png' : 'images/buttons/Next-primary.png'
  const btnRatio = last ? 6.66 : 2.356
  const btnH = mob ? 96 : 80
  const btnW = btnH * btnRatio
  const closeSize = mob ? 168 : 56
  const closeRight = mob ? 10 : 18
  const closeTop = mob ? -10 : 18
  const advance = () => {
    if (last) welcomeState.visible = false
    else welcomeState.step += 1
  }
  const close = () => { welcomeState.visible = false }

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      {/* Welcome panel (3 steps) — button overlaid near the bottom of the image */}
      <UiEntity
        uiTransform={{
          width: S(imgW), height: S(imgH),
          flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end'
        }}
        uiBackground={{ texture: { src: `images/welcome_${welcomeState.step + 1}.png` }, textureMode: 'stretch' }}
      >
        <UiEntity
          uiTransform={{
            width: S(closeSize), height: S(closeSize),
            positionType: 'absolute',
            position: { top: S(closeTop), right: S(closeRight) },
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseDown={() => { playClick(); close() }}
        >
          <Label value="×" fontSize={F(mob ? 98 : 34)} color={Color4.White()}
            uiTransform={{ width: '100%', height: '100%' }} />
        </UiEntity>
        <UiEntity uiTransform={{ margin: `0 0 ${S(BTN_BOTTOM)}px 0` }}>
          <ImgButton src={btnSrc} width={S(btnW)} height={S(btnH)} onMouseDown={advance} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── Info: how the scoring works ────────────────────────────────────────────────
const InfoForm = () => {
  if (!infoState.visible) return <UiEntity uiTransform={{ display: 'none' }} />

  const row = (title: string, pts: string, note: string) => (
    <UiEntity uiTransform={{ width: '100%', height: S(104), flexDirection: 'column', margin: '0 0 16px 0' }}>
      <UiEntity uiTransform={{ width: '100%', height: S(48), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label value={title} fontSize={F(30)} color={Color4.White()} textAlign="middle-left" uiTransform={{ height: S(48) }} />
        <Label value={pts} fontSize={F(32)} color={GOLD} textAlign="middle-right" uiTransform={{ height: S(48) }} />
      </UiEntity>
      <Label value={note} fontSize={F(22)} color={Color4.create(0.7, 0.7, 0.7, 1)} textAlign="middle-left"
        uiTransform={{ width: '100%', height: S(48) }} />
    </UiEntity>
  )

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: S(1000), height: S(820), padding: S(56), alignSelf: 'center',
          flexDirection: 'column', alignItems: 'stretch',
          justifyContent: 'space-between', borderRadius: S(36)
        }}
        uiBackground={{ color: DARK }}
      >
        <Label value="How scoring works" fontSize={F(44)} color={TEAL} textAlign="middle-left"
          uiTransform={{ width: '100%', height: S(64), margin: '0 0 8px 0' }} />
        <Label value="Predict the result and the exact score of every match." fontSize={F(24)}
          color={Color4.create(0.7, 0.7, 0.7, 1)} textAlign="middle-left" uiTransform={{ width: '100%', height: S(36), margin: '0 0 28px 0' }} />

        {row('Correct result', `${PTS_WINNER} pts`, 'Right winner (or a draw), but not the exact score.')}
        {row('Exact score', `${PTS_WINNER + PTS_SCORE} pts`, `Perfect scoreline: ${PTS_WINNER} for the result + a ${PTS_SCORE}-pt bonus.`)}
        {row('Missed it', '0 pts', "Your pick didn't match the result.")}

        <Label value="Predicting a draw? Enter the same score for both teams (e.g. 1-1)." fontSize={F(22)}
          color={RED} textAlign="middle-left" uiTransform={{ width: '100%', height: S(40), margin: '0 0 6px 0' }} />
        <Label value="Predictions lock at kickoff — once a match starts, your pick is final." fontSize={F(22)}
          color={Color4.create(0.65, 0.65, 0.65, 1)} textAlign="middle-left" uiTransform={{ width: '100%', height: S(40), margin: '0 0 24px 0' }} />

        <UiEntity uiTransform={{ width: '100%', height: S(92), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <ImgButton src="images/buttons/gotit-primary.png"
            width={S(92 * 3.034)} height={S(92)}
            onMouseDown={() => { infoState.visible = false }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── Admin: load official match results, iterating match by match ───────────────
const AdminForm = () => {
  if (!adminState.visible) return <UiEntity uiTransform={{ display: 'none' }} />

  const match = MATCHES[adminState.index]
  if (!match) return <UiEntity uiTransform={{ display: 'none' }} />

  const winner = impliedWinner(adminState.score1, adminState.score2)
  const saved  = getResult(match.id)
  const outcomeText =
    winner === 'draw' ? 'DRAW' : winner === 'team1' ? `${match.team1} WIN` : `${match.team2} WIN`

  const save = () => {
    submitOfficialResult(match.id, winner, adminState.score1, adminState.score2)
  }

  const go = (delta: number) => {
    const next = adminState.index + delta
    if (next < 0 || next >= MATCHES.length) return
    adminState.index = next
    loadAdminMatch(next)
  }

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%',
        positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: S(1000), height: S(900), padding: S(56), alignSelf: 'center',
          flexDirection: 'column', alignItems: 'stretch',
          justifyContent: 'space-between', borderRadius: S(36)
        }}
        uiBackground={{ color: DARK }}
      >
        {/* Header */}
        <UiEntity uiTransform={{ width: '100%', height: S(50), flexDirection: 'row', justifyContent: 'space-between', margin: '0 0 8px 0' }}>
          <Label value="ADMIN - Load result" fontSize={F(32)} color={GOLD} uiTransform={{ height: S(50) }} />
          <Label value={`${adminState.index + 1} / ${MATCHES.length}`} fontSize={F(28)} color={Color4.create(0.7,0.7,0.7,1)} uiTransform={{ height: S(50) }} />
        </UiEntity>

        <Label
          value={`${match.team1}  vs  ${match.team2}`}
          fontSize={F(44)} color={Color4.White()}
          uiTransform={{ width: '100%', height: S(64), margin: '0 0 4px 0' }}
        />
        <Label
          value={`${match.group}  -  ${match.time}${saved ? '   (result loaded)' : ''}`}
          fontSize={F(24)} color={saved ? TEAL : Color4.create(0.6,0.6,0.6,1)}
          uiTransform={{ width: '100%', height: S(36), margin: '0 0 20px 0' }}
        />

        {/* Score editor */}
        <Label value="Final score" fontSize={F(28)} color={Color4.create(0.7,0.7,0.7,1)}
          uiTransform={{ width: '100%', height: S(40), margin: '0 0 16px 0' }} />
        <UiEntity
          uiTransform={{
            width: '100%', height: S(128), flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center', margin: '0 0 24px 0'
          }}
        >
          <SfxButton value="-" variant="primary" fontSize={F(40)}
            uiTransform={{ width: S(80), height: S(80), borderRadius: S(16) }} color={DARK_BTN}
            onMouseDown={() => { if (adminState.score1 > 0) adminState.score1-- }} />
          <Label value={String(adminState.score1)} fontSize={F(56)} color={Color4.White()} uiTransform={{ width: S(104), height: S(88) }} />
          <SfxButton value="+" variant="primary" fontSize={F(40)}
            uiTransform={{ width: S(80), height: S(80), borderRadius: S(16) }} color={DARK_BTN}
            onMouseDown={() => { adminState.score1++ }} />

          <Label value=" — " fontSize={F(48)} color={Color4.create(0.5,0.5,0.5,1)} uiTransform={{ width: S(72), height: S(88) }} />

          <SfxButton value="-" variant="primary" fontSize={F(40)}
            uiTransform={{ width: S(80), height: S(80), borderRadius: S(16) }} color={DARK_BTN}
            onMouseDown={() => { if (adminState.score2 > 0) adminState.score2-- }} />
          <Label value={String(adminState.score2)} fontSize={F(56)} color={Color4.White()} uiTransform={{ width: S(104), height: S(88) }} />
          <SfxButton value="+" variant="primary" fontSize={F(40)}
            uiTransform={{ width: S(80), height: S(80), borderRadius: S(16) }} color={DARK_BTN}
            onMouseDown={() => { adminState.score2++ }} />
        </UiEntity>

        {/* Derived outcome */}
        <Label value={`Outcome:  ${outcomeText}`} fontSize={F(30)} color={TEAL}
          uiTransform={{ width: '100%', height: S(44), margin: '0 0 20px 0' }} />

        {/* Match navigation */}
        <UiEntity uiTransform={{ width: '100%', height: S(84), flexDirection: 'row', justifyContent: 'space-between', margin: '0 0 16px 0' }}>
          <SfxButton value="< Prev match" variant="secondary" fontSize={F(26)}
            uiTransform={{ width: S(300), height: S(80), borderRadius: S(18) }}
            onMouseDown={() => go(-1)} />
          <SfxButton value="Save result" variant="primary" fontSize={F(28)}
            uiTransform={{ width: S(320), height: S(80), borderRadius: S(18) }}
            color={GOLD}
            onMouseDown={save} />
          <SfxButton value="Next match >" variant="secondary" fontSize={F(26)}
            uiTransform={{ width: S(300), height: S(80), borderRadius: S(18) }}
            onMouseDown={() => go(1)} />
        </UiEntity>

        {/* Close */}
        <SfxButton value="Close" variant="secondary" fontSize={F(30)}
          uiTransform={{ width: '100%', height: S(84), borderRadius: S(18) }}
          onMouseDown={() => { adminState.visible = false }} />
      </UiEntity>
    </UiEntity>
  )
}


