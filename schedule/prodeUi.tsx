import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity, Button } from '@dcl/sdk/react-ecs'
import { getPlayer } from '@dcl/sdk/players'
import {
  MATCHES, GROUPS, predictions, savePrediction, unsubmitPrediction, getCompletedCount, isGroupComplete,
  getResult, hasResult, submitOfficialResult, scorePrediction, myPoints, Outcome, FlagRef
} from './prodeData'
import { getLeaderboard, setOnPredictionAck, isServerReady } from '../client/prodeClient'
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
const scoreState = { visible: false }
export function openScorePanel() { scoreState.visible = true }

// Welcome overlay shown on entry; 3 steps, dismissed with "Join the Challenge".
const welcomeState = { visible: true, step: 0 }

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
const CHECKLIST_PARTIAL = Color4.fromHexString('#7a1f31ff')
const CHECKLIST_COMPLETE = Color4.fromHexString('#39ff78ff')
const CELL_EMPTY = Color4.create(0.42, 0.42, 0.52, 1)    // pending checklist cell
const BTN_DISABLED = Color4.create(0.24, 0.24, 0.30, 1)  // greyed/disabled button

// Outcome implied by a score (used by the admin result form).
function impliedWinner(s1: number, s2: number): Outcome {
  return s1 > s2 ? 'team1' : s1 < s2 ? 'team2' : 'draw'
}

// ── Component ─────────────────────────────────────────────────────────────────
const ProdeUi = () => {
  const allComplete = getCompletedCount() === MATCHES.length
  const mob = isMobile()
  return (
    // Single root wrapper
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}>

      {/* ── Confetti celebration overlay (on top) ───────────────────────────── */}
      <ConfettiOverlay />

      {/* ── Progress checklist — top on desktop, bottom-center on mobile ─────── */}
      <MatchChecklist />

      {/* ── My Score entry button — only once every match is predicted ──────── */}
      {allComplete && !scoreState.visible && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: S(mob ? 150 : 100), left: 0 },
            width: '100%', height: S(mob ? 150 : 130),
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <ImgButton src="images/buttons/myscore.png"
            width={S((mob ? 150 : 130) * 2.716)} height={S(mob ? 150 : 130)}
            onMouseDown={() => openScorePanel()} />
        </UiEntity>
      )}

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
      <WelcomeOverlay />

      {/* ── Wearable claim status overlay ────────────────────────────────────── */}
      <ClaimOverlay />

      {/* ── Prediction rejected toast ─────────────────────────────────────────── */}
      <RejectionToast />

    </UiEntity>
  )
}

// ── Match checklist ───────────────────────────────────────────────────────────
// Desktop: single horizontal row of 12 groups at the top.
// Mobile:  compact 3×4 vertical sidebar on the left (avoids blocking gameplay).
const MatchChecklist = () => {
  const mob = isMobile()
  const k = mob ? 1.55 : 1
  const hidden =
    welcomeState.visible ||
    groupState.visible || adminState.visible || infoState.visible || scoreState.visible || celebrateState.visible ||
    (mob && getCompletedCount() === MATCHES.length)

  const cluster = (g: (typeof GROUPS)[number]) => {
    const done = g.matches.filter((m) => predictions.find(p => p.matchId === m.id)?.submitted ?? false).length
    const complete = done === g.matches.length
    const activeColor = complete ? CHECKLIST_COMPLETE : done > 0 ? CHECKLIST_PARTIAL : VIOLET

    return (
      <UiEntity key={g.name} uiTransform={{
        flexDirection: 'column', alignItems: 'center',
        margin: mob ? `${S(4 * k)}px ${S(4 * k)}px ${S(4 * k)}px ${S(4 * k)}px` : `0px ${S(5)}px 0px ${S(5)}px`
      }}>
        <UiEntity uiTransform={{ flexDirection: 'row' }}>
          {g.matches.map((m, mi) => {
            const sub = predictions.find(p => p.matchId === m.id)?.submitted ?? false
            return (
              <UiEntity key={mi}
                uiTransform={{ width: S(14 * k), height: S(14 * k), margin: S(1 * k), borderRadius: S(3 * k) }}
                uiBackground={{ color: sub ? activeColor : CELL_EMPTY }} />
            )
          })}
        </UiEntity>
        <Label value={g.name.replace('Group ', '')} fontSize={F(13 * k)}
          color={complete ? CHECKLIST_COMPLETE : Color4.create(0.6, 0.6, 0.7, 1)}
          uiTransform={{ height: S(16 * k) }} />
      </UiEntity>
    )
  }

  // Desktop: 2 rows × 6 groups centered. Mobile: 6 rows × 2 groups (vertical sidebar).
  const rows = mob
    ? [GROUPS.slice(0, 2), GROUPS.slice(2, 4), GROUPS.slice(4, 6), GROUPS.slice(6, 8), GROUPS.slice(8, 10), GROUPS.slice(10, 12)]
    : [GROUPS.slice(0, 6), GROUPS.slice(6, 12)]

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: mob ? { top: S(300), left: S(240) } : { top: S(12), left: 0 },
        width: mob ? 'auto' : '100%',
        flexDirection: 'column',
        alignItems: mob ? 'flex-start' : 'center',
        justifyContent: 'flex-start',
        display: hidden ? 'none' : 'flex'
      }}
    >
      <UiEntity
        uiTransform={{
          padding: S(10 * k),
          flexDirection: 'column',
          alignItems: 'center',
          alignSelf: mob ? 'flex-start' : 'center',
          borderRadius: S(16),
          pointerFilter: 'block'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.88) }}
      >
        <Label
          value={mob
            ? `${getCompletedCount()}/${MATCHES.length}  •  ${myPoints()} pts`
            : `Predictions  ${getCompletedCount()} / ${MATCHES.length}      ${myPoints()} pts`}
          fontSize={F(mob ? 14 * k : 18)} color={Color4.White()}
          uiTransform={{ height: S(mob ? 18 * k : 24), margin: '0 0 6px 0' }}
        />
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
          {rows.map((rowGroups, ri) => (
            <UiEntity key={ri} uiTransform={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {rowGroups.map(g => cluster(g))}
            </UiEntity>
          ))}
        </UiEntity>
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
  const complete = total > 0 && done === total
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

  // Hits breakdown over matches that already have an official result.
  let exact = 0, winner = 0, missed = 0, pending = 0
  for (const p of predictions) {
    if (!p.submitted) continue
    const r = getResult(p.matchId)
    if (!r) { pending++; continue }
    const s = scorePrediction(p, r)
    if (s === PTS_WINNER + PTS_SCORE) exact++
    else if (s === PTS_WINNER) winner++
    else missed++
  }
  const played   = exact + winner + missed
  const accuracy = played > 0 ? Math.round(((exact + winner) / played) * 100) : null
  const points   = myPoints()

  // Rank from the cached leaderboard (sorted desc by points), matched by wallet.
  const lb   = getLeaderboard()
  const me   = getPlayer()?.userId?.toLowerCase()
  const idx  = me ? lb.findIndex(r => r.address?.toLowerCase() === me) : -1
  const rank = idx >= 0 ? `#${idx + 1} / ${lb.length}` : 'Unranked'

  const statBlock = (label: string, value: string, color: Color4) => (
    <UiEntity uiTransform={{ width: S(360), height: S(150), padding: S(16), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: S(20) }}
      uiBackground={{ color: DARK_BTN }}>
      <Label value={value} fontSize={F(56)} color={color} uiTransform={{ width: '100%', height: S(80) }} />
      <Label value={label} fontSize={F(24)} color={Color4.create(0.7, 0.7, 0.7, 1)} uiTransform={{ width: '100%', height: S(36) }} />
    </UiEntity>
  )

  const breakdownRow = (label: string, count: number, color: Color4) => (
    <UiEntity uiTransform={{ width: '100%', height: S(52), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: `0 0 ${S(10)}px 0` }}>
      <Label value={label} fontSize={F(28)} color={Color4.White()} uiTransform={{ height: S(52) }} />
      <Label value={String(count)} fontSize={F(30)} color={color} uiTransform={{ height: S(52) }} />
    </UiEntity>
  )

  // Matches already played in the tournament (those with an official result).
  const playedTotal = MATCHES.filter(m => hasResult(m.id)).length

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
          width: S(880), height: S(mob ? 860 : 800), padding: S(56), alignSelf: 'center',
          flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between',
          borderRadius: S(36)
        }}
        uiBackground={{ color: DARK }}
      >
        <Label value="MY SCORE" fontSize={F(46)} color={VIOLET}
          uiTransform={{ width: '100%', height: S(60), margin: `0 0 ${S(4)}px 0` }} />
        <Label value={`Matches played: ${playedTotal} / ${MATCHES.length}`} fontSize={F(24)}
          color={Color4.create(0.7, 0.7, 0.7, 1)} uiTransform={{ width: '100%', height: S(34), margin: `0 0 ${S(14)}px 0` }} />

        {/* Points + rank */}
        <UiEntity uiTransform={{ width: '100%', height: S(150), flexDirection: 'row', justifyContent: 'space-between', margin: `0 0 ${S(24)}px 0` }}>
          {statBlock('Total points', `${points}`, GOLD)}
          {statBlock('Leaderboard', rank, VIOLET)}
        </UiEntity>

        {/* Hits breakdown */}
        <Label value="Results so far" fontSize={F(26)} color={Color4.create(0.7, 0.7, 0.7, 1)}
          uiTransform={{ width: '100%', height: S(36), margin: `0 0 ${S(12)}px 0` }} />
        {breakdownRow(`Exact scores  (+${PTS_WINNER + PTS_SCORE})`, exact, GOLD)}
        {breakdownRow(`Correct winner  (+${PTS_WINNER})`, winner, TEAL)}
        {breakdownRow('Missed', missed, RED)}
        {breakdownRow('Pending (not played yet)', pending, Color4.create(0.6, 0.6, 0.7, 1))}

        {/* Accuracy */}
        <Label
          value={accuracy === null ? 'Accuracy: - (no matches played yet)' : `Accuracy: ${accuracy}%   (${exact + winner} hits / ${played} played)`}
          fontSize={F(26)} color={VIOLET}
          uiTransform={{ width: '100%', height: S(40), margin: `${S(6)}px 0 ${S(14)}px 0` }}
        />

        <UiEntity uiTransform={{ width: '100%', height: S(88), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
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
  const advance = () => {
    if (last) welcomeState.visible = false
    else welcomeState.step += 1
  }

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
    <UiEntity uiTransform={{ width: '100%', height: S(96), flexDirection: 'column', margin: '0 0 18px 0' }}>
      <UiEntity uiTransform={{ width: '100%', height: S(48), flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label value={title} fontSize={F(30)} color={Color4.White()} uiTransform={{ height: S(48) }} />
        <Label value={pts} fontSize={F(32)} color={GOLD} uiTransform={{ height: S(48) }} />
      </UiEntity>
      <Label value={note} fontSize={F(22)} color={Color4.create(0.65, 0.65, 0.65, 1)} uiTransform={{ width: '100%', height: S(36) }} />
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
        <Label value="How scoring works" fontSize={F(44)} color={TEAL}
          uiTransform={{ width: '100%', height: S(64), margin: '0 0 8px 0' }} />
        <Label value="Predict the result and the exact score of every match." fontSize={F(24)}
          color={Color4.create(0.7, 0.7, 0.7, 1)} uiTransform={{ width: '100%', height: S(36), margin: '0 0 28px 0' }} />

        {row('Correct result', `${PTS_WINNER} pts`, 'You called the winner — or correctly picked a draw — but not the exact score.')}
        {row('Exact score', `${PTS_WINNER + PTS_SCORE} pts`, `You nailed the scoreline. That's the ${PTS_WINNER} for the result, plus a ${PTS_SCORE}-point bonus.`)}
        {row('Missed it', '0 pts', "The match didn't go the way you predicted.")}

        <Label value="Predicting a draw? Enter the same score for both teams (e.g. 1-1)." fontSize={F(22)}
          color={RED} uiTransform={{ width: '100%', height: S(36), margin: '0 0 6px 0' }} />
        <Label value="Predictions lock at match kickoff — once a match starts, your pick is final." fontSize={F(22)}
          color={Color4.create(0.65, 0.65, 0.65, 1)} uiTransform={{ width: '100%', height: S(36), margin: '0 0 24px 0' }} />

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
