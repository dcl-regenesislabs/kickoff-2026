import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity, Button } from '@dcl/sdk/react-ecs'
import { MATCHES, predictions, savePrediction, getCompletedCount } from './prodeData'
import { ConfettiOverlay, setupConfettiSystem } from './confetti'

// ── UI state ──────────────────────────────────────────────────────────────────
const uiState = {
  visible:         false,
  matchId:         0,
  winner:          null as 'team1' | 'draw' | 'team2' | null,
  score1:          0,
  score2:          0,
  onConfirm:       null as (() => void) | null
}

export function openPredictionForm(matchId: number, onConfirm: () => void) {
  const pred = predictions.find(p => p.matchId === matchId)
  uiState.matchId    = matchId
  uiState.winner     = pred?.winner  ?? null
  uiState.score1     = pred?.score1  ?? 0
  uiState.score2     = pred?.score2  ?? 0
  uiState.onConfirm  = onConfirm
  uiState.visible    = true
}

export function setupProdeUi() {
  setupConfettiSystem()
  ReactEcsRenderer.setUiRenderer(ProdeUi)
}

// ── Colors ────────────────────────────────────────────────────────────────────
const TEAL      = Color4.fromHexString('#18A187ff')
const DARK      = Color4.create(0.08, 0.08, 0.2, 0.97)
const DARK_BTN  = Color4.create(0.15, 0.15, 0.32, 1)
const OVERLAY   = Color4.create(0, 0, 0, 0.7)

// ── Component ─────────────────────────────────────────────────────────────────
const ProdeUi = () => {
  const match = MATCHES.find(m => m.id === uiState.matchId)

  const btnColor = (w: typeof uiState.winner) =>
    uiState.winner === w ? TEAL : DARK_BTN

  const confirm = () => {
    if (!uiState.winner) return
    savePrediction(uiState.matchId, uiState.winner, uiState.score1, uiState.score2)
    uiState.visible = false
    uiState.onConfirm?.()
  }

  return (
    // Single root wrapper
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}>

      {/* ── Confetti celebration overlay (on top) ───────────────────────────── */}
      <ConfettiOverlay />

      {/* ── Progress bar — always visible at the bottom ─────────────────────── */}
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
          <Label
            value={`${getCompletedCount()} / ${MATCHES.length} predictions submitted`}
            fontSize={18}
            color={Color4.fromHexString('#18A187ff')}
            uiTransform={{ width: '100%', height: 24, margin: '0 0 6px 0' }}
          />
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
              uiBackground={{ color: Color4.fromHexString('#18A187ff') }}
            />
          </UiEntity>
        </UiEntity>
      </UiEntity>

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
      {/* Card — solo se renderiza cuando visible */}
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
          value="Who wins?"
          fontSize={28}
          color={Color4.create(0.7, 0.7, 0.7, 1)}
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
            onMouseDown={() => { uiState.winner = 'team1' }}
          />
          <Button value="Draw" variant="primary" fontSize={28}
            uiTransform={{ width: 220, height: 92, borderRadius: 20 }}
            color={btnColor('draw')}
            onMouseDown={() => { uiState.winner = 'draw' }}
          />
          <Button value={match.team2} variant="primary" fontSize={28}
            uiTransform={{ width: 296, height: 92, borderRadius: 20 }}
            color={btnColor('team2')}
            onMouseDown={() => { uiState.winner = 'team2' }}
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
            onMouseDown={() => { if (uiState.score1 > 0) uiState.score1-- }}
          />
          <Label value={String(uiState.score1)} fontSize={56} color={Color4.White()}
            uiTransform={{ width: 104, height: 88 }} />
          <Button value="+" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }}
            color={DARK_BTN}
            onMouseDown={() => { uiState.score1++ }}
          />

          <Label value=" — " fontSize={48} color={Color4.create(0.5, 0.5, 0.5, 1)}
            uiTransform={{ width: 72, height: 88 }} />

          <Button value="-" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }}
            color={DARK_BTN}
            onMouseDown={() => { if (uiState.score2 > 0) uiState.score2-- }}
          />
          <Label value={String(uiState.score2)} fontSize={56} color={Color4.White()}
            uiTransform={{ width: 104, height: 88 }} />
          <Button value="+" variant="primary" fontSize={40}
            uiTransform={{ width: 80, height: 80, borderRadius: 16 }}
            color={DARK_BTN}
            onMouseDown={() => { uiState.score2++ }}
          />
        </UiEntity>

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
            value={uiState.winner ? 'Confirm' : 'Pick a winner'}
            variant="primary" fontSize={32}
            uiTransform={{ width: 460, height: 92, borderRadius: 20 }}
            color={uiState.winner ? TEAL : Color4.create(0.3, 0.3, 0.3, 1)}
            onMouseDown={confirm}
          />
        </UiEntity>
      </UiEntity>
      )}
      </UiEntity>

    </UiEntity>
  )
}
