import { room } from '../schedule/prodeNet'
import {
  Prediction, OfficialResult,
  setPredictionSync, loadPredictions,
  setResultSync, loadResults
} from '../schedule/prodeData'
import { getPlayer } from '@dcl/sdk/players'

export type LeaderboardRow = { name: string; address: string; value: number }

// Latest leaderboard snapshot from the server (consumed by the 3D panel).
let leaderboard: LeaderboardRow[] = []
export function getLeaderboard(): LeaderboardRow[] { return leaderboard }

let onPredictionRejected: (() => void) | null = null
export function setOnPredictionRejected(cb: () => void) { onPredictionRejected = cb }

// ── Client networking ─────────────────────────────────────────────────────────
// `onSnapshot` re-tints the 3D panels / refreshes UI after server state changes.
export function startProdeClient(onSnapshot: () => void) {
  // 1. Local prediction saves are forwarded to the server.
  setPredictionSync((p) => {
    room.send('submitPrediction', {
      matchId: p.matchId,
      winner:  p.winner ?? 'draw',
      score1:  p.score1,
      score2:  p.score2
    })
  })

  // 1b. Admin: local official-result saves are forwarded to the server.
  setResultSync((r) => {
    room.send('submitResult', {
      matchId: r.matchId,
      winner:  r.winner,
      score1:  r.score1,
      score2:  r.score2
    })
  })

  // 2. Server snapshots → rehydrate caches → refresh visuals.
  room.onMessage('predictionsSnapshot', (data) => {
    try {
      loadPredictions(JSON.parse(data.json) as Prediction[])
      onSnapshot()
    } catch (e) { console.log('[Client] bad predictions snapshot', e) }
  })

  room.onMessage('resultsSnapshot', (data) => {
    try {
      loadResults(JSON.parse(data.json) as OfficialResult[])
      onSnapshot()
    } catch (e) { console.log('[Client] bad results snapshot', e) }
  })

  room.onMessage('leaderboardSnapshot', (data) => {
    try {
      leaderboard = JSON.parse(data.json) as LeaderboardRow[]
    } catch (e) { console.log('[Client] bad leaderboard snapshot', e) }
  })

  room.onMessage('predictionSaved', (data) => {
    if (!data.ok) {
      console.log('[Client] server rejected prediction', data.matchId)
      onPredictionRejected?.()
    }
  })
  room.onMessage('resultSaved', (data) => {
    if (!data.ok) console.log('[Client] server rejected result', data.matchId)
  })

  // 3. Initial sync. Room auto-queues until ready; re-send on (re)connect.
  syncOnConnect()
  room.onReady((ready) => { if (ready) syncOnConnect() })
}

function syncOnConnect() {
  const name = getPlayer()?.name
  if (name) room.send('identify', { name })
  room.send('requestPredictions', {})
  room.send('requestResults', {})
  room.send('requestLeaderboard', {})
}

// Ask the server for a fresh leaderboard (e.g. when the panel comes into view).
export function refreshLeaderboard() { room.send('requestLeaderboard', {}) }
