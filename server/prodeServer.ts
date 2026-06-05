import { Storage } from '@dcl/sdk/server'
import { room, STORAGE_KEY, RESULTS_KEY, PLAYER_PREFIX } from '../schedule/prodeNet'
import {
  Prediction, OfficialResult, MATCHES, makeDefaultPredictions,
  loadResults as loadResultsCache, totalPoints
} from '../schedule/prodeData'
import { isAdmin, LEADERBOARD_SIZE } from '../schedule/prodeConfig'

// ── Authoritative server ──────────────────────────────────────────────────────
// Storage.player    → each player's own predictions (their snapshot).
// Storage (scene)   → 'prode:results'        official results (admin-only writes)
//                   → 'prode:player:<addr>'  mirror {name, predictions} for the
//                                            leaderboard aggregation.
export function startProdeServer() {
  console.log('[Server] prode authoritative server ready')

  // ── Player identity (for leaderboard display names) ─────────────────────────
  room.onMessage('identify', async (data, ctx) => {
    if (!ctx) return
    await mirrorPlayer(ctx.from, { name: (data.name ?? '').slice(0, 40) })
  })

  // ── Predictions ─────────────────────────────────────────────────────────────
  room.onMessage('requestPredictions', async (_data, ctx) => {
    if (!ctx) return
    const arr = await loadFor(ctx.from)
    room.send('predictionsSnapshot', { json: JSON.stringify(arr) }, { to: [ctx.from] })
  })

  room.onMessage('submitPrediction', async (data, ctx) => {
    if (!ctx) return
    const addr = ctx.from

    // Reject illegal data, or edits to a match that already has an official result.
    const results = await loadResults()
    const locked  = results.some(r => r.matchId === data.matchId)
    if (!isValidPrediction(data) || locked) {
      room.send('predictionSaved', { matchId: data.matchId, ok: false }, { to: [addr] })
      return
    }

    try {
      const arr = await loadFor(addr)
      const p = arr.find(x => x.matchId === data.matchId)
      if (p) {
        p.winner    = data.winner as Prediction['winner']
        p.score1    = data.score1
        p.score2    = data.score2
        p.submitted = true
      }
      await Storage.player.set(addr, STORAGE_KEY, arr)
      await mirrorPlayer(addr, { predictions: arr })
      console.log(`[Server] saved prediction match ${data.matchId} for ${addr}`)

      room.send('predictionSaved', { matchId: data.matchId, ok: true }, { to: [addr] })
      room.send('predictionsSnapshot', { json: JSON.stringify(arr) }, { to: [addr] })
    } catch (e) {
      console.log('[Server] Storage.set FAILED:', e)
      room.send('predictionSaved', { matchId: data.matchId, ok: false }, { to: [addr] })
    }
  })

  // ── Official results ──────────────────────────────────────────────────────────
  room.onMessage('requestResults', async (_data, ctx) => {
    if (!ctx) return
    const results = await loadResults()
    room.send('resultsSnapshot', { json: JSON.stringify(results) }, { to: [ctx.from] })
  })

  room.onMessage('submitResult', async (data, ctx) => {
    if (!ctx) return
    const addr = ctx.from

    // Only admins may load results; data must be legal.
    if (!isAdmin(addr) || !isValidResult(data)) {
      console.log(`[Server] rejected result from ${addr} (admin=${isAdmin(addr)})`)
      room.send('resultSaved', { matchId: data.matchId, ok: false }, { to: [addr] })
      return
    }

    try {
      const results = await loadResults()
      const incoming: OfficialResult = {
        matchId: data.matchId,
        winner:  data.winner as OfficialResult['winner'],
        score1:  data.score1,
        score2:  data.score2
      }
      const idx = results.findIndex(r => r.matchId === incoming.matchId)
      if (idx >= 0) results[idx] = incoming
      else results.push(incoming)

      await Storage.set(RESULTS_KEY, results)
      console.log(`[Server] saved official result for match ${data.matchId}`)

      room.send('resultSaved', { matchId: data.matchId, ok: true }, { to: [addr] })
      // Results changed → push to everyone + recompute the leaderboard.
      room.send('resultsSnapshot', { json: JSON.stringify(results) })
      await broadcastLeaderboard(results)
    } catch (e) {
      console.log('[Server] result save FAILED:', e)
      room.send('resultSaved', { matchId: data.matchId, ok: false }, { to: [addr] })
    }
  })

  // ── Leaderboard ───────────────────────────────────────────────────────────────
  room.onMessage('requestLeaderboard', async (_data, ctx) => {
    if (!ctx) return
    const board = await buildLeaderboard()
    room.send('leaderboardSnapshot', { json: JSON.stringify(board) }, { to: [ctx.from] })
  })
}

// ── Storage helpers ─────────────────────────────────────────────────────────────
async function loadFor(addr: string): Promise<Prediction[]> {
  try {
    const saved = await Storage.player.get<Prediction[]>(addr, STORAGE_KEY)
    return saved ?? makeDefaultPredictions()
  } catch (e) {
    console.log('[Server] Storage.get FAILED:', e)
    return makeDefaultPredictions()
  }
}

async function loadResults(): Promise<OfficialResult[]> {
  try {
    return (await Storage.get<OfficialResult[]>(RESULTS_KEY)) ?? []
  } catch (e) {
    console.log('[Server] results load FAILED:', e)
    return []
  }
}

type PlayerMirror = { name: string; predictions: Prediction[] }

// Merge-update the scene mirror used for leaderboard aggregation.
async function mirrorPlayer(addr: string, patch: Partial<PlayerMirror>) {
  try {
    const key = PLAYER_PREFIX + addr
    const cur = (await Storage.get<PlayerMirror>(key)) ?? { name: '', predictions: [] }
    if (patch.name !== undefined)        cur.name = patch.name
    if (patch.predictions !== undefined) cur.predictions = patch.predictions
    await Storage.set(key, cur)
  } catch (e) {
    console.log('[Server] mirrorPlayer FAILED:', e)
  }
}

type LeaderboardRow = { name: string; address: string; value: number }

async function buildLeaderboard(): Promise<LeaderboardRow[]> {
  const results = await loadResults()
  return computeLeaderboard(results)
}

async function computeLeaderboard(results: OfficialResult[]): Promise<LeaderboardRow[]> {
  // Populate the shared results cache so totalPoints() scores against them.
  loadResultsCache(results)

  const rows: LeaderboardRow[] = []
  let offset = 0
  // Page through every mirrored player entry.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Storage.getValues({ prefix: PLAYER_PREFIX, offset })
    for (const { key, value } of page.data) {
      const entry = value as PlayerMirror | null
      if (!entry?.predictions) continue
      const address = key.slice(PLAYER_PREFIX.length)
      rows.push({
        name:    entry.name || address.slice(0, 8),
        address,
        value:   totalPoints(entry.predictions)
      })
    }
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }

  rows.sort((a, b) => b.value - a.value)
  return rows.slice(0, LEADERBOARD_SIZE)
}

async function broadcastLeaderboard(results: OfficialResult[]) {
  const board = await computeLeaderboard(results)
  room.send('leaderboardSnapshot', { json: JSON.stringify(board) })
}

// ── Validation ──────────────────────────────────────────────────────────────────
function validScore(s1: number, s2: number): boolean {
  return Number.isInteger(s1) && Number.isInteger(s2) &&
    s1 >= 0 && s1 <= 99 && s2 >= 0 && s2 <= 99
}

function validOutcome(winner: string, s1: number, s2: number): boolean {
  if (winner !== 'team1' && winner !== 'draw' && winner !== 'team2') return false
  // A draw prediction/result must carry equal scores (e.g. 1-1).
  return winner !== 'draw' || s1 === s2
}

function isValidPrediction(d: { matchId: number; winner: string; score1: number; score2: number }): boolean {
  return MATCHES.some(m => m.id === d.matchId) &&
    validScore(d.score1, d.score2) &&
    validOutcome(d.winner, d.score1, d.score2)
}

function isValidResult(d: { matchId: number; winner: string; score1: number; score2: number }): boolean {
  // Same rules; in addition the result's winner must agree with its score.
  if (!MATCHES.some(m => m.id === d.matchId)) return false
  if (!validScore(d.score1, d.score2)) return false
  if (!validOutcome(d.winner, d.score1, d.score2)) return false
  const implied = d.score1 > d.score2 ? 'team1' : d.score1 < d.score2 ? 'team2' : 'draw'
  return d.winner === implied
}
