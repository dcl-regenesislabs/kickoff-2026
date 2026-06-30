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

// Kickoff (group-stage) standings — for the "GROUP STAGE WINNERS" leaderboard slide.
let kickoffLeaderboard: LeaderboardRow[] = []
export function getKickoffLeaderboard(): LeaderboardRow[] { return kickoffLeaderboard }

// Knockout-only standings — for the "KNOCKOUT WINNERS" leaderboard slide.
let knockoutLeaderboard: LeaderboardRow[] = []
export function getKnockoutLeaderboard(): LeaderboardRow[] { return knockoutLeaderboard }

// Personal rank — sent by the server on every requestLeaderboard response.
// Rank 0 = player not in the leaderboard yet. Both arrays and personal rank are small
// messages; the server never broadcasts full player arrays to avoid the DCL comms cap.
export type MyRankData = {
  kickoffRank:  number; kickoffTotal:  number
  knockoutRank: number; knockoutTotal: number
  totalRank:    number; totalTotal:    number
}
let myRankData: MyRankData = { kickoffRank: 0, kickoffTotal: 0, knockoutRank: 0, knockoutTotal: 0, totalRank: 0, totalTotal: 0 }
export function getMyRankData(): MyRankData { return myRankData }

type AckReason = 'locked' | 'error' | 'disconnected'
let onPredictionAck: ((matchId: number, ok: boolean, reason: AckReason | '') => void) | null = null
export function setOnPredictionAck(cb: (matchId: number, ok: boolean, reason: AckReason | '') => void) { onPredictionAck = cb }

let onKoPredictionAck: ((fixtureId: number, ok: boolean, reason: AckReason | '') => void) | null = null
export function setOnKoPredictionAck(cb: (fixtureId: number, ok: boolean, reason: AckReason | '') => void) { onKoPredictionAck = cb }

const SEND_TIMEOUT_MS = 8000  // safety net only — disconnected case is handled instantly
const pendingAcks = new Map<number, ReturnType<typeof setTimeout>>()
let serverReady = false
export function isServerReady(): boolean { return serverReady }

// ── Onboarding cinematic — has this wallet seen it before? ───────────────────
// Loaded once on connect. The "hold F to skip" prompt only shows once this has
// resolved to `true`, so a first-time player always gets the full uninterrupted tour.
let cinematicSeenLoaded = false
let cinematicSeen = false
export function isCinematicSeenLoaded(): boolean { return cinematicSeenLoaded }
export function hasSeenCinematicBefore(): boolean { return cinematicSeen }
export function markCinematicSeen() {
  if (cinematicSeen) return
  cinematicSeen = true   // optimistic — avoids a round-trip before the flag sticks locally
  room.send('markCinematicSeen', {})
}

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

  room.onMessage('kickoffLeaderboardSnapshot', (data) => {
    try { kickoffLeaderboard = JSON.parse(data.json) as LeaderboardRow[] }
    catch (e) { console.log('[Client] bad kickoff leaderboard snapshot', e) }
  })
  room.onMessage('knockoutLeaderboardSnapshot', (data) => {
    try { knockoutLeaderboard = JSON.parse(data.json) as LeaderboardRow[] }
    catch (e) { console.log('[Client] bad knockout leaderboard snapshot', e) }
  })

  room.onMessage('cinematicSeenSnapshot', (data) => {
    cinematicSeen = data.seen
    cinematicSeenLoaded = true
  })

  room.onMessage('myRankSnapshot', (data) => {
    myRankData = {
      kickoffRank:   data.kickoffRank,   kickoffTotal:  data.kickoffTotal,
      knockoutRank:  data.knockoutRank,  knockoutTotal: data.knockoutTotal,
      totalRank:     data.totalRank,     totalTotal:    data.totalTotal
    }
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
    onKoPredictionAck?.(data.fixtureId, data.ok, (data.reason as AckReason) || '')
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
  room.send('requestCinematicSeen', {})
}

// Ask the server for a fresh leaderboard (e.g. when the panel comes into view).
export function refreshLeaderboard() { room.send('requestLeaderboard', {}) }
