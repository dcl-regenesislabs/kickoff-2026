import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity, Button } from '@dcl/sdk/react-ecs'
import { getPlayer } from '@dcl/sdk/players'
import {
  MATCHES, predictions, savePrediction, getCompletedCount,
  getResult, hasResult, submitOfficialResult, myPoints, Outcome
} from './prodeData'
import { isAdmin, PTS_WINNER, PTS_SCORE } from './prodeConfig'
import { ConfettiOverlay, setupConfettiSystem } from './confetti'

// ── UI state ──────────────────────────────────────────────────────────────────
const uiState = {
  visible:         false,
  matchId:         0,
  winner:          null as Outcome | null,
  score1:          0,
  score2:          0,
  onConfirm:       null as (() => void) | null
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

export function openPredictionForm(matchId: number, onConfirm: () => void) {
  const pred = predictions.find(p => p.matchId === matchId)
  uiState.matchId    = matchId
  uiState.winner     = pred?.winner  ?? null
  uiState.score1     = pred?.score1  ?? 0
  uiState.score2     = pred?.score2  ?? 0
  uiState.onConfirm  = onConfirm
  uiState.visible    = true
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

// Outcome implied by a score (used by the admin result form).
function impliedWinner(s1: number, s2: number): Outcome {
  return s1 > s2 ? 'team1' : s1 < s2 ? 'team2' : 'draw'
}

// ── Component ─────────────────────────────────────────────────────────────────
const ProdeUi = () => {
  const match = MATCHES.find(m => m.id === uiState.matchId)
  const locked = match ? hasResult(match.id) : false

  const btnColor = (w: Outcome | null) =>
    uiState.winner === w ? TEAL : DARK_BTN

  // A draw prediction is only valid when both scores match (e.g. 1-1, 2-2)
  const drawMismatch = uiState.winner === 'draw' && uiState.score1 !== uiState.score2
  const canConfirm   = !!uiState.winner && !drawMismatch && !locked

  const confirm = () => {
    if (!canConfirm) return
    savePrediction(uiState.matchId, uiState.winner!, uiState.score1, uiState.score2)
    uiState.visible = false
    uiState.onConfirm?.()
  }

  return (
    // Single root wrapper
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}>

      {/* ── Confetti celebration overlay (on top) ───────────────────────────── */}
      <ConfettiOverlay />

      {/* ── Bottom HUD: progress + my points ────────────────────────────────── */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { bottom: 24, left: 0 },
          width: '100%',
          height: 80,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <UiEntity
          uiTransform={{
            width: 600,
            padding: 14,
            flexDirection: 'column',
            alignItems: 'stretch',
            borderRadius: 14
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
        >
          <UiEntity uiTransform={{ width: '100%', height: 24, flexDirection: 'row', justifyContent: 'space-between', margin: '0 0 6px 0' }}>
            <Label
              value={`${getCompletedCount()} / ${MATCHES.length} predictions submitted`}
              fontSize={18}
              color={TEAL}
              uiTransform={{ height: 24 }}
            />
            <Label
              value={`${myPoints()} pts`}
              fontSize={18}
              color={GOLD}
              uiTransform={{ height: 24 }}
            />
          </UiEntity>
          <UiEntity
            uiTransform={{ width: '100%', height: 14, borderRadius: 7 }}
            uiBackground={{ color: Color4.create(0.15, 0.15, 0.3, 1) }}
          >
            <UiEntity
              uiTransform={{
                width: Math.max(0, Math.round(572 * getCompletedCount() / MATCHES.length)),
                height: 14,
                borderRadius: 7
              }}
              uiBackground={{ color: TEAL }}
            />
          </UiEntity>
        </UiEntity>
      </UiEntity>

      {/* ── Admin entry button (only visible to the admin wallet) ────────────── */}
      {localIsAdmin() && !adminState.visible && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 24, right: 24 },
            width: 200, height: 64
          }}
        >
          <Button value="ADMIN" variant="primary" fontSize={24}
            uiTransform={{ width: 200, height: 64, borderRadius: 14 }}
            color={GOLD}
            onMouseDown={() => openAdminForm(adminState.index)}
          />
        </UiEntity>
      )}

      {/* ── Prediction form overlay ──────────────────────────────────────────── */}
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          positionType: 'absolute',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        uiBackground={{ color: uiState.visible ? OVERLAY : Color4.create(0, 0, 0, 0) }}
      >
      {uiState.visible && match && (
      <UiEntity
        uiTransform={{
          width: 1000,
          height: 860,
          padding: 56,
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          borderRadius: 36
        }}
        uiBackground={{ color: DARK }}
      >
        {/* Header */}
        <Label
          value={`${match.team1}  vs  ${match.team2}`}
          fontSize={44}
          color={Color4.White()}
          uiTransform={{ width: '100%', height: 68, margin: '0 0 12px 0' }}
        />
        <Label
          value={locked ? 'Match finished — predictions are locked' : 'Who wins?'}
          fontSize={28}
          color={locked ? RED : Color4.create(0.7, 0.7, 0.7, 1)}
          uiTransform={{ width: '100%', height: 40, margin: '0 0 20px 0' }}
        />

        {/* Winner buttons */}
        <UiEntity
          uiTransform={{
            width: '100%', height: 100,
            flexDirection: 'row',
            justifyContent: 'space-between',
            margin: '0 0 44px 0'
          }}
        >
          <Button value={match.team1} variant="primary" fontSize={28}
            uiTransform={{ width: 296, height: 92, borderRadius: 20 }}
            color={btnColor('team1')}
            onMouseDown={() => { if (!locked) uiState.winner = 'team1' }}
          />
          <Button value="Draw" variant="primary" fontSize={28}
            uiTransform={{ width: 220, height: 92, borderRadius: 20 }}
            color={btnColor('draw')}
            onMouseDown={() => { if (!locked) uiState.winner = 'draw' }}
          />
          <Button value={match.team2} variant="primary" fontSize={28}
            uiTransform={{ width: 296, height: 92, borderRadius: 20 }}
            color={btnColor('team2')}
            onMouseDown={() => { if (!locked) uiState.winner = 'team2' }}
          />
        </UiEntity>

        {/* Score */}
        <Label
          value="Score"
          fontSize={28}
          color={Color4.create(0.7, 0.7, 0.7, 1)}
          uiTransform={{ width: '100%', height: 40, margin: '0 0 20px 0' }}
        />
        <UiEntity
          uiTransform={{
            width: '100%', height: 128,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 0 48px 0'
          }}
        >
          <Button value="-" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }}
            color={DARK_BTN}
            onMouseDown={() => { if (!locked && uiState.score1 > 0) uiState.score1-- }}
          />
          <Label value={String(uiState.score1)} fontSize={56} color={Color4.White()}
            uiTransform={{ width: 104, height: 88 }} />
          <Button value="+" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }}
            color={DARK_BTN}
            onMouseDown={() => { if (!locked) uiState.score1++ }}
          />

          <Label value=" — " fontSize={48} color={Color4.create(0.5, 0.5, 0.5, 1)}
            uiTransform={{ width: 72, height: 88 }} />

          <Button value="-" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }}
            color={DARK_BTN}
            onMouseDown={() => { if (!locked && uiState.score2 > 0) uiState.score2-- }}
          />
          <Label value={String(uiState.score2)} fontSize={56} color={Color4.White()}
            uiTransform={{ width: 104, height: 88 }} />
          <Button value="+" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }}
            color={DARK_BTN}
            onMouseDown={() => { if (!locked) uiState.score2++ }}
          />
        </UiEntity>

        {/* Draw validation warning */}
        <Label
          value={drawMismatch ? 'A draw must have the same score on both sides' : ''}
          fontSize={24}
          color={RED}
          uiTransform={{ width: '100%', height: 32, margin: '0 0 16px 0' }}
        />

        {/* Actions */}
        <UiEntity
          uiTransform={{
            width: '100%', height: 100,
            flexDirection: 'row',
            justifyContent: 'space-between'
          }}
        >
          <Button value="Cancel" variant="secondary" fontSize={32}
            uiTransform={{ width: 380, height: 92, borderRadius: 20 }}
            onMouseDown={() => { uiState.visible = false }}
          />
          <Button
            value={locked ? 'Locked' : !uiState.winner ? 'Pick a winner' : drawMismatch ? 'Even the score' : 'Confirm'}
            variant="primary" fontSize={32}
            uiTransform={{ width: 460, height: 92, borderRadius: 20 }}
            color={canConfirm ? TEAL : Color4.create(0.3, 0.3, 0.3, 1)}
            onMouseDown={confirm}
          />
        </UiEntity>
      </UiEntity>
      )}
      </UiEntity>

      {/* ── Admin result form overlay ────────────────────────────────────────── */}
      <AdminForm />

      {/* ── Scoring info overlay ─────────────────────────────────────────────── */}
      <InfoForm />

    </UiEntity>
  )
}

// ── Info: how the scoring works ────────────────────────────────────────────────
const InfoForm = () => {
  if (!infoState.visible) return <UiEntity uiTransform={{ display: 'none' }} />

  const row = (title: string, pts: string, note: string) => (
    <UiEntity uiTransform={{ width: '100%', height: 96, flexDirection: 'column', margin: '0 0 18px 0' }}>
      <UiEntity uiTransform={{ width: '100%', height: 48, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label value={title} fontSize={30} color={Color4.White()} uiTransform={{ height: 48 }} />
        <Label value={pts} fontSize={32} color={GOLD} uiTransform={{ height: 48 }} />
      </UiEntity>
      <Label value={note} fontSize={22} color={Color4.create(0.65, 0.65, 0.65, 1)} uiTransform={{ width: '100%', height: 36 }} />
    </UiEntity>
  )

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 },
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: 1000, height: 820, padding: 56, alignSelf: 'center',
          flexDirection: 'column', alignItems: 'stretch',
          justifyContent: 'space-between', borderRadius: 36
        }}
        uiBackground={{ color: DARK }}
      >
        <Label value="How scoring works" fontSize={44} color={TEAL}
          uiTransform={{ width: '100%', height: 64, margin: '0 0 8px 0' }} />
        <Label value="Predict the winner and the score of every match." fontSize={24}
          color={Color4.create(0.7, 0.7, 0.7, 1)} uiTransform={{ width: '100%', height: 36, margin: '0 0 28px 0' }} />

        {row('Correct winner', `${PTS_WINNER} pt`, 'You called who wins (or a draw), but not the exact score.')}
        {row('Exact score', `${PTS_WINNER + PTS_SCORE} pts`, `You nailed the exact result - winner included (${PTS_WINNER} + ${PTS_SCORE}).`)}
        {row('Wrong winner', '0 pts', 'No points if you miss the outcome of the match.')}

        <Label value="A draw must have the same score on both sides (e.g. 1-1)." fontSize={22}
          color={RED} uiTransform={{ width: '100%', height: 36, margin: '0 0 6px 0' }} />
        <Label value="Predictions lock once the match result is loaded." fontSize={22}
          color={Color4.create(0.65, 0.65, 0.65, 1)} uiTransform={{ width: '100%', height: 36, margin: '0 0 24px 0' }} />

        <Button value="Got it" variant="primary" fontSize={32}
          uiTransform={{ width: '100%', height: 92, borderRadius: 20 }}
          color={TEAL}
          onMouseDown={() => { infoState.visible = false }} />
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
        justifyContent: 'center'
      }}
      uiBackground={{ color: OVERLAY }}
    >
      <UiEntity
        uiTransform={{
          width: 1000, height: 900, padding: 56, alignSelf: 'center',
          flexDirection: 'column', alignItems: 'stretch',
          justifyContent: 'space-between', borderRadius: 36
        }}
        uiBackground={{ color: DARK }}
      >
        {/* Header */}
        <UiEntity uiTransform={{ width: '100%', height: 50, flexDirection: 'row', justifyContent: 'space-between', margin: '0 0 8px 0' }}>
          <Label value="ADMIN - Load result" fontSize={32} color={GOLD} uiTransform={{ height: 50 }} />
          <Label value={`${adminState.index + 1} / ${MATCHES.length}`} fontSize={28} color={Color4.create(0.7,0.7,0.7,1)} uiTransform={{ height: 50 }} />
        </UiEntity>

        <Label
          value={`${match.team1}  vs  ${match.team2}`}
          fontSize={44} color={Color4.White()}
          uiTransform={{ width: '100%', height: 64, margin: '0 0 4px 0' }}
        />
        <Label
          value={`${match.group}  -  ${match.time}${saved ? '   (result loaded)' : ''}`}
          fontSize={24} color={saved ? TEAL : Color4.create(0.6,0.6,0.6,1)}
          uiTransform={{ width: '100%', height: 36, margin: '0 0 20px 0' }}
        />

        {/* Score editor */}
        <Label value="Final score" fontSize={28} color={Color4.create(0.7,0.7,0.7,1)}
          uiTransform={{ width: '100%', height: 40, margin: '0 0 16px 0' }} />
        <UiEntity
          uiTransform={{
            width: '100%', height: 128, flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center', margin: '0 0 24px 0'
          }}
        >
          <Button value="-" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }} color={DARK_BTN}
            onMouseDown={() => { if (adminState.score1 > 0) adminState.score1-- }} />
          <Label value={String(adminState.score1)} fontSize={56} color={Color4.White()} uiTransform={{ width: 104, height: 88 }} />
          <Button value="+" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }} color={DARK_BTN}
            onMouseDown={() => { adminState.score1++ }} />

          <Label value=" — " fontSize={48} color={Color4.create(0.5,0.5,0.5,1)} uiTransform={{ width: 72, height: 88 }} />

          <Button value="-" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }} color={DARK_BTN}
            onMouseDown={() => { if (adminState.score2 > 0) adminState.score2-- }} />
          <Label value={String(adminState.score2)} fontSize={56} color={Color4.White()} uiTransform={{ width: 104, height: 88 }} />
          <Button value="+" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }} color={DARK_BTN}
            onMouseDown={() => { adminState.score2++ }} />
        </UiEntity>

        {/* Derived outcome */}
        <Label value={`Outcome:  ${outcomeText}`} fontSize={30} color={TEAL}
          uiTransform={{ width: '100%', height: 44, margin: '0 0 20px 0' }} />

        {/* Match navigation */}
        <UiEntity uiTransform={{ width: '100%', height: 84, flexDirection: 'row', justifyContent: 'space-between', margin: '0 0 16px 0' }}>
          <Button value="< Prev match" variant="secondary" fontSize={26}
            uiTransform={{ width: 300, height: 80, borderRadius: 18 }}
            onMouseDown={() => go(-1)} />
          <Button value="Save result" variant="primary" fontSize={28}
            uiTransform={{ width: 320, height: 80, borderRadius: 18 }}
            color={GOLD}
            onMouseDown={save} />
          <Button value="Next match >" variant="secondary" fontSize={26}
            uiTransform={{ width: 300, height: 80, borderRadius: 18 }}
            onMouseDown={() => go(1)} />
        </UiEntity>

        {/* Close */}
        <Button value="Close" variant="secondary" fontSize={30}
          uiTransform={{ width: '100%', height: 84, borderRadius: 18 }}
          onMouseDown={() => { adminState.visible = false }} />
      </UiEntity>
    </UiEntity>
  )
}
