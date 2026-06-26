import { room } from '../schedule/prodeNet'
import {
  Prediction, OfficialResult,
  setPredictionSync, loadPredictions,
  setResultSync, loadResults, myPoints
} from '../schedule/prodeData'
import {
  KoFixture, KoPrediction, KoResult,
  setKoPredictionSync, loadKoFixtures, loadKoPredictions, loadKoResults, myKoPoints
} from '../schedule/knockoutData'
import { getPlayer } from '@dcl/sdk/players'

// Logs the local player's points: kickoff (group stage), knockout, and total.
function logMyPoints() {
  const kickoff  = myPoints()
  const knockout = myKoPoints()
  const total    = kickoff + knockout
  console.log(`[Points] kickoff=${kickoff} | knockout=${knockout} | total=${total}`)
}

export type LeaderboardRow = { name: string; address: string; value: number }

// Latest leaderboard snapshot from the server (consumed by the 3D panel).
let leaderboard: LeaderboardRow[] = []
export function getLeaderboard(): LeaderboardRow[] { return leaderboard }

type AckReason = 'locked' | 'error' | 'disconnected'
let onPredictionAck: ((matchId: number, ok: boolean, reason: AckReason | '') => void) | null = null
export function setOnPredictionAck(cb: (matchId: number, ok: boolean, reason: AckReason | '') => void) { onPredictionAck = cb }

const SEND_TIMEOUT_MS = 8000  // safety net only — disconnected case is handled instantly
const pendingAcks = new Map<number, ReturnType<typeof setTimeout>>()
let serverReady = false
export function isServerReady(): boolean { return serverReady }

// ── Client networking ─────────────────────────────────────────────────────────
// `onSnapshot` re-tints the 3D panels / refreshes UI after server state changes.
export function startProdeClient(onSnapshot: () => void) {
  // 1. Local prediction saves are forwarded to the server.
  setPredictionSync((p) => {
    if (!serverReady) {
      onPredictionAck?.(p.matchId, false, 'disconnected')
      return
    }
    room.send('submitPrediction', {
      matchId: p.matchId,
      winner:  p.winner ?? 'draw',
      score1:  p.score1,
      score2:  p.score2
    })
    const existing = pendingAcks.get(p.matchId)
    if (existing) clearTimeout(existing)
    pendingAcks.set(p.matchId, setTimeout(() => {
      pendingAcks.delete(p.matchId)
      onPredictionAck?.(p.matchId, false, 'disconnected')
    }, SEND_TIMEOUT_MS))
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

  // 1c. Local knockout prediction saves are forwarded to the server.
  setKoPredictionSync((p) => {
    room.send('submitKoPrediction', {
      fixtureId: p.fixtureId,
      winner:    p.winner ?? 'draw',
      score1:    p.score1,
      score2:    p.score2
    })
  })

  // 2. Server snapshots → rehydrate caches → refresh visuals.
  room.onMessage('predictionsSnapshot', (data) => {
    try {
      loadPredictions(JSON.parse(data.json) as Prediction[])
      onSnapshot()
      logMyPoints()
    } catch (e) { console.log('[Client] bad predictions snapshot', e) }
  })

  room.onMessage('resultsSnapshot', (data) => {
    try {
      loadResults(JSON.parse(data.json) as OfficialResult[])
      onSnapshot()
      logMyPoints()
    } catch (e) { console.log('[Client] bad results snapshot', e) }
  })

  room.onMessage('leaderboardSnapshot', (data) => {
    try {
      leaderboard = JSON.parse(data.json) as LeaderboardRow[]
    } catch (e) { console.log('[Client] bad leaderboard snapshot', e) }
  })

  room.onMessage('predictionSaved', (data) => {
    const t = pendingAcks.get(data.matchId)
    if (t) { clearTimeout(t); pendingAcks.delete(data.matchId) }
    if (!data.ok) console.log('[Client] server rejected prediction', data.matchId, data.reason)
    onPredictionAck?.(data.matchId, data.ok, (data.reason as AckReason) || '')
  })
  room.onMessage('resultSaved', (data) => {
    if (!data.ok) console.log('[Client] server rejected result', data.matchId)
  })

  // ── Knockout snapshots (parallel to the group handlers above) ────────────────
  room.onMessage('koFixturesSnapshot', (data) => {
    try { loadKoFixtures(JSON.parse(data.json) as KoFixture[]); onSnapshot() }
    catch (e) { console.log('[Client] bad KO fixtures snapshot', e) }
  })
  room.onMessage('koResultsSnapshot', (data) => {
    try { loadKoResults(JSON.parse(data.json) as KoResult[]); onSnapshot(); logMyPoints() }
    catch (e) { console.log('[Client] bad KO results snapshot', e) }
  })
  room.onMessage('koPredictionsSnapshot', (data) => {
    try { loadKoPredictions(JSON.parse(data.json) as KoPrediction[]); onSnapshot(); logMyPoints() }
    catch (e) { console.log('[Client] bad KO predictions snapshot', e) }
  })
  room.onMessage('koPredictionSaved', (data) => {
    if (!data.ok) console.log('[Client] server rejected KO prediction', data.fixtureId, data.reason)
  })

  // 3. Initial sync. Room auto-queues until ready; re-send on (re)connect.
  syncOnConnect()
  room.onReady((ready) => { serverReady = ready; if (ready) syncOnConnect() })
}

function syncOnConnect() {
  const name = getPlayer()?.name
  if (name) room.send('identify', { name })
  room.send('requestPredictions', {})
  room.send('requestResults', {})
  room.send('requestLeaderboard', {})
  room.send('requestKoFixtures', {})
  room.send('requestKoPredictions', {})
  room.send('requestBallState', {})
}

// Ask the server for a fresh leaderboard (e.g. when the panel comes into view).
export function refreshLeaderboard() { room.send('requestLeaderboard', {}) }
