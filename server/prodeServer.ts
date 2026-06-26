import { Storage } from '@dcl/sdk/server/index.js'
import {
  room, STORAGE_KEY, RESULTS_KEY, PLAYER_PREFIX,
  KO_PREDICTIONS_KEY, KO_RESULTS_KEY, KO_FIXTURES_KEY, KO_PLAYER_PREFIX
} from '../schedule/prodeNet'
import {
  Prediction, OfficialResult, MATCHES, makeDefaultPredictions,
  loadResults as loadResultsCache, totalPoints, exactScoreCount
} from '../schedule/prodeData'
import {
  KoFixture, KoPrediction, KoResult,
  loadKoResults as loadKoResultsCache, koTotalPoints, koExactCount
} from '../schedule/knockoutData'
import { isMatchLocked, LOCK_LEAD_MS } from '../schedule/matchDates'
import { isAdmin, LEADERBOARD_SIZE } from '../schedule/prodeConfig'
import { startResultsSync } from './resultsSync'
import { setupBall } from './ball'
import { PodiumAvatarsServer, WinnerEntry } from './podiumAvatarsServer'
import { engine } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

// ── Authoritative server ──────────────────────────────────────────────────────
// Storage.player    → each player's own predictions (their snapshot).
// Storage (scene)   → 'prode:results'        official results (admin-only writes)
//                   → 'prode:player:<addr>'  mirror {name, predictions} for the
//                                            leaderboard aggregation.
export function startProdeServer() {
  console.log('[Server] prode authoritative server ready')

  setupBall()

  // ── Player identity (for leaderboard display names) ─────────────────────────
  room.onMessage('identify', async (data, ctx) => {
    if (!ctx) return
    const name = (data.name ?? '').slice(0, 40)
    await mirrorPlayer(ctx.from, { name })
    await mirrorKoPlayer(ctx.from, { name })   // keep the KO mirror self-sufficient for names
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

    // Reject illegal data, edits to a finished match, or once voting has closed
    // (within 10 min of kickoff).
    const results = await loadResults()
    const match   = MATCHES.find(m => m.id === data.matchId)
    const locked  = results.some(r => r.matchId === data.matchId) ||
      (match ? isMatchLocked(match.team1, match.team2) : false)
    if (!isValidPrediction(data) || locked) {
      room.send('predictionSaved', { matchId: data.matchId, ok: false, reason: 'locked' }, { to: [addr] })
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

      room.send('predictionSaved', { matchId: data.matchId, ok: true, reason: '' }, { to: [addr] })
      room.send('predictionsSnapshot', { json: JSON.stringify(arr) }, { to: [addr] })
    } catch (e) {
      console.log('[Server] Storage.set FAILED:', e)
      room.send('predictionSaved', { matchId: data.matchId, ok: false, reason: 'error' }, { to: [addr] })
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
      const incoming: OfficialResult = {
        matchId: data.matchId,
        winner:  data.winner as OfficialResult['winner'],
        score1:  data.score1,
        score2:  data.score2
      }
      await applyResults([incoming])   // persists + pushes snapshot + recomputes leaderboard
      console.log(`[Server] saved official result for match ${data.matchId}`)
      room.send('resultSaved', { matchId: data.matchId, ok: true }, { to: [addr] })
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
    room.send('kickoffLeaderboardSnapshot', { json: JSON.stringify(await computeKickoffLeaderboard()) }, { to: [ctx.from] })
  })

  // ── Knockout stage (parallel to the group handlers above) ───────────────────────
  room.onMessage('requestKoFixtures', async (_data, ctx) => {
    if (!ctx) return
    room.send('koFixturesSnapshot', { json: JSON.stringify(await loadKoFixtures()) }, { to: [ctx.from] })
    room.send('koResultsSnapshot',  { json: JSON.stringify(await loadKoResultsSrv()) }, { to: [ctx.from] })
  })

  room.onMessage('requestKoPredictions', async (_data, ctx) => {
    if (!ctx) return
    room.send('koPredictionsSnapshot', { json: JSON.stringify(await loadKoFor(ctx.from)) }, { to: [ctx.from] })
  })

  room.onMessage('submitKoPrediction', async (data, ctx) => {
    if (!ctx) return
    const addr = ctx.from

    const fixtures = await loadKoFixtures()
    const fx = fixtures.find(f => f.id === data.fixtureId)
    if (!fx) {
      room.send('koPredictionSaved', { fixtureId: data.fixtureId, ok: false, reason: 'unknown' }, { to: [addr] })
      return
    }
    const koResults = await loadKoResultsSrv()
    const locked = koResults.some(r => r.fixtureId === data.fixtureId) ||
      (fx.kickoff > 0 && Date.now() >= fx.kickoff - LOCK_LEAD_MS)
    if (!isValidKoPrediction(data) || locked) {
      room.send('koPredictionSaved', { fixtureId: data.fixtureId, ok: false, reason: 'locked' }, { to: [addr] })
      return
    }

    try {
      const arr = await loadKoFor(addr)
      let p = arr.find(x => x.fixtureId === data.fixtureId)
      if (!p) { p = { fixtureId: data.fixtureId, winner: null, score1: 0, score2: 0, submitted: false }; arr.push(p) }
      p.winner = data.winner as KoPrediction['winner']
      p.score1 = data.score1
      p.score2 = data.score2
      p.submitted = true
      await Storage.player.set(addr, KO_PREDICTIONS_KEY, arr)
      await mirrorKoPlayer(addr, { predictions: arr })
      console.log(`[Server] saved KO prediction fixture ${data.fixtureId} for ${addr}`)
      room.send('koPredictionSaved', { fixtureId: data.fixtureId, ok: true, reason: '' }, { to: [addr] })
      room.send('koPredictionsSnapshot', { json: JSON.stringify(arr) }, { to: [addr] })
    } catch (e) {
      console.log('[Server] KO Storage.set FAILED:', e)
      room.send('koPredictionSaved', { fixtureId: data.fixtureId, ok: false, reason: 'error' }, { to: [addr] })
    }
  })

  // Create empty scene keys up-front so the per-10s leaderboard reads don't 404
  // before any result exists (cosmetic — the reads are handled, but it spams logs).
  void seedKeys()

  // ── Auto-sync results + knockout fixtures from TheSportsDB (server-side) ─────────
  startResultsSync({
    loadResults,
    applyResults,
    loadKoFixtures,
    saveKoFixtures,
    loadKoResults: loadKoResultsSrv,
    applyKoResults
  })

  // ── Winner podiums (shown at tournament end) ────────────────────────────────────
  setupPodiums()
}

// ── Winner podiums ────────────────────────────────────────────────────────────────
// At a configured moment (tournament end) we read the leaderboards and display the
// top-3 of each ranking as live avatars on the in-scene podiums.
const TOURNAMENT_END_UTC = '2026-07-20T03:00:00Z'   // after the WC 2026 final (tunable)
const PODIUM_TEST_SHOW = false                       // set true to show NOW with current standings (testing)

// 3 step positions for a podium placed at `base` (TUNABLE — tweak to sit on the model's steps).
function podiumSlots(base: Vector3): Vector3[] {
  return [
    Vector3.create(base.x,       base.y + 2.20, base.z),   // 1st
    Vector3.create(base.x - 0.7, base.y + 1.90, base.z),   // 2nd
    Vector3.create(base.x + 0.7, base.y + 1.65, base.z)    // 3rd
  ]
}

function setupPodiums() {
  const ROT = Quaternion.fromEulerDegrees(0, 180, 0)
  // Podium01 = kickoff (group) winners; Podium01_2 = knockout winners.
  const kickoffPodium  = new PodiumAvatarsServer(podiumSlots(Vector3.create(84.0,  0, 70.75)), ROT, ROT, 'kickoff',  5000)
  const knockoutPodium = new PodiumAvatarsServer(podiumSlots(Vector3.create(89.5,  0, 70.75)), ROT, ROT, 'knockout', 5010)

  const endTs = Date.parse(TOURNAMENT_END_UTC)
  let shown = false
  let working = false
  let acc = 0
  engine.addSystem((dt: number) => {
    if (shown || working) return
    acc += dt
    if (acc < 5) return
    acc = 0
    if (!(PODIUM_TEST_SHOW || Date.now() >= endTs)) return
    working = true
    void (async () => {
      try {
        const w = await computeWinners()
        kickoffPodium.showWinners(w.group)
        knockoutPodium.showWinners(w.ko)
        console.log(`[Podium] shown — kickoff #1: ${w.group[0]?.name ?? '-'} | knockout #1: ${w.ko[0]?.name ?? '-'} | total #1: ${w.total[0]?.name ?? '-'}`)
        shown = true
      } catch (e) {
        console.log('[Podium] failed:', e)
      } finally { working = false }
    })()
  }, undefined, 'podium-trigger')
}

// Top-3 winners for each ranking (group / knockout / total), read from the mirrors.
async function computeWinners(): Promise<{ group: WinnerEntry[]; ko: WinnerEntry[]; total: WinnerEntry[] }> {
  loadResultsCache(await loadResults())
  loadKoResultsCache(await loadKoResultsSrv())

  const map = new Map<string, { name: string; group?: Prediction[]; ko?: KoPrediction[] }>()
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Storage.getValues({ prefix: PLAYER_PREFIX, offset })
    for (const { key, value } of page.data) {
      const e = value as PlayerMirror | null
      const address = key.slice(PLAYER_PREFIX.length)
      const cur = map.get(address) ?? { name: '' }
      if (e?.name) cur.name = e.name
      if (e?.predictions) cur.group = e.predictions
      map.set(address, cur)
    }
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }
  offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Storage.getValues({ prefix: KO_PLAYER_PREFIX, offset })
    for (const { key, value } of page.data) {
      const e = value as KoMirror | null
      const address = key.slice(KO_PLAYER_PREFIX.length)
      const cur = map.get(address) ?? { name: '' }
      if (e?.name && !cur.name) cur.name = e.name
      if (e?.predictions) cur.ko = e.predictions
      map.set(address, cur)
    }
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }

  type Row = { address: string; name: string; group: number; ko: number; total: number }
  const rows: Row[] = []
  for (const [address, v] of map) {
    const g = v.group ? totalPoints(v.group) : 0
    const k = v.ko ? koTotalPoints(v.ko) : 0
    rows.push({ address, name: v.name || address.slice(0, 8), group: g, ko: k, total: g + k })
  }
  const top3 = (metric: 'group' | 'ko' | 'total'): WinnerEntry[] =>
    rows.slice().sort((a, b) => b[metric] - a[metric]).slice(0, 3)
      .map((r, i) => ({ address: r.address, rank: i + 1, name: r.name, points: r[metric] }))

  return { group: top3('group'), ko: top3('ko'), total: top3('total') }
}

// Seed scene-scoped list keys to [] if they don't exist yet (one-time per fresh
// storage). Leaves existing data untouched.
async function seedKeys() {
  for (const key of [RESULTS_KEY, KO_RESULTS_KEY, KO_FIXTURES_KEY]) {
    let exists = false
    try { exists = (await Storage.get(key)) != null } catch { exists = false }
    if (!exists) {
      try { await Storage.set(key, []) } catch (e) { console.log('[Server] seed FAILED', key, e) }
    }
  }
}

// Upsert official results, persist once, then push to everyone + recompute the
// leaderboard. Shared by the admin handler and the TheSportsDB auto-sync.
// Returns how many entries were actually new or changed (0 → no broadcast).
async function applyResults(incoming: OfficialResult[]): Promise<number> {
  if (incoming.length === 0) return 0
  const results = await loadResults()
  let changed = 0
  for (const inc of incoming) {
    const idx = results.findIndex(r => r.matchId === inc.matchId)
    if (idx >= 0) {
      const c = results[idx]
      if (c.winner === inc.winner && c.score1 === inc.score1 && c.score2 === inc.score2) continue
      results[idx] = inc
    } else {
      results.push(inc)
    }
    changed++
  }
  if (changed === 0) return 0
  await Storage.set(RESULTS_KEY, results)
  room.send('resultsSnapshot', { json: JSON.stringify(results) })
  await broadcastLeaderboard(results)
  return changed
}

// ── Knockout storage helpers ────────────────────────────────────────────────────
async function loadKoFixtures(): Promise<KoFixture[]> {
  try { return (await Storage.get<KoFixture[]>(KO_FIXTURES_KEY)) ?? [] }
  catch (e) { console.log('[Server] KO fixtures load FAILED:', e); return [] }
}

// Upsert fixtures by id; persist + push only when something changed. Returns count.
async function saveKoFixtures(fixtures: KoFixture[]): Promise<number> {
  const cur = await loadKoFixtures()
  const byId = new Map(cur.map(f => [f.id, f]))
  let changed = 0
  for (const f of fixtures) {
    const ex = byId.get(f.id)
    if (!ex || ex.round !== f.round || ex.team1 !== f.team1 || ex.team2 !== f.team2 || ex.kickoff !== f.kickoff) {
      byId.set(f.id, f); changed++
    }
  }
  if (changed === 0) return 0
  const merged = Array.from(byId.values())
  await Storage.set(KO_FIXTURES_KEY, merged)
  room.send('koFixturesSnapshot', { json: JSON.stringify(merged) })
  return changed
}

async function loadKoResultsSrv(): Promise<KoResult[]> {
  try { return (await Storage.get<KoResult[]>(KO_RESULTS_KEY)) ?? [] }
  catch (e) { console.log('[Server] KO results load FAILED:', e); return [] }
}

// Upsert KO results, persist once, push snapshot + recompute the (total) leaderboard.
async function applyKoResults(incoming: KoResult[]): Promise<number> {
  if (incoming.length === 0) return 0
  const results = await loadKoResultsSrv()
  let changed = 0
  for (const inc of incoming) {
    const idx = results.findIndex(r => r.fixtureId === inc.fixtureId)
    if (idx >= 0) {
      const c = results[idx]
      if (c.winner === inc.winner && c.score1 === inc.score1 && c.score2 === inc.score2) continue
      results[idx] = inc
    } else {
      results.push(inc)
    }
    changed++
  }
  if (changed === 0) return 0
  await Storage.set(KO_RESULTS_KEY, results)
  room.send('koResultsSnapshot', { json: JSON.stringify(results) })
  await broadcastLeaderboard(await loadResults())
  return changed
}

async function loadKoFor(addr: string): Promise<KoPrediction[]> {
  try { return (await Storage.player.get<KoPrediction[]>(addr, KO_PREDICTIONS_KEY)) ?? [] }
  catch (e) { console.log('[Server] KO Storage.get FAILED:', e); return [] }
}

type KoMirror = { name: string; predictions: KoPrediction[] }
async function mirrorKoPlayer(addr: string, patch: Partial<KoMirror>) {
  try {
    const key = KO_PLAYER_PREFIX + addr
    const cur = (await Storage.get<KoMirror>(key)) ?? { name: '', predictions: [] }
    if (patch.name !== undefined)        cur.name = patch.name
    if (patch.predictions !== undefined) cur.predictions = patch.predictions
    await Storage.set(key, cur)
  } catch (e) {
    console.log('[Server] mirrorKoPlayer FAILED:', e)
  }
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

type LeaderboardRow = { name: string; address: string; value: number; exact: number }

async function buildLeaderboard(): Promise<LeaderboardRow[]> {
  const results = await loadResults()
  return computeLeaderboard(results)
}

// Leaderboard value = TOTAL = group points + knockout points (unions both mirrors).
async function computeLeaderboard(results: OfficialResult[]): Promise<LeaderboardRow[]> {
  loadResultsCache(results)                            // group scoring cache
  loadKoResultsCache(await loadKoResultsSrv())         // knockout scoring cache

  // address → { name, group?, ko? } — merged from both mirror namespaces.
  const map = new Map<string, { name: string; group?: Prediction[]; ko?: KoPrediction[] }>()

  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Storage.getValues({ prefix: PLAYER_PREFIX, offset })
    for (const { key, value } of page.data) {
      const e = value as PlayerMirror | null
      const address = key.slice(PLAYER_PREFIX.length)
      const cur = map.get(address) ?? { name: '' }
      if (e?.name) cur.name = e.name
      if (e?.predictions) cur.group = e.predictions
      map.set(address, cur)
    }
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }

  offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Storage.getValues({ prefix: KO_PLAYER_PREFIX, offset })
    for (const { key, value } of page.data) {
      const e = value as KoMirror | null
      const address = key.slice(KO_PLAYER_PREFIX.length)
      const cur = map.get(address) ?? { name: '' }
      if (e?.name && !cur.name) cur.name = e.name
      if (e?.predictions) cur.ko = e.predictions
      map.set(address, cur)
    }
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }

  const rows: LeaderboardRow[] = []
  for (const [address, v] of map) {
    if (!v.group && !v.ko) continue
    const groupPts = v.group ? totalPoints(v.group) : 0
    const koPts    = v.ko ? koTotalPoints(v.ko) : 0
    const exact = (v.group ? exactScoreCount(v.group) : 0) + (v.ko ? koExactCount(v.ko) : 0)
    rows.push({
      name:  v.name || address.slice(0, 8),
      address,
      value: groupPts + koPts,                          // TOTAL
      exact                                             // tiebreaker (group + knockout)
    })
  }

  rows.sort((a, b) => b.value - a.value || b.exact - a.exact)
  return rows.slice(0, LEADERBOARD_SIZE)
}

async function broadcastLeaderboard(results: OfficialResult[]) {
  const board = await computeLeaderboard(results)
  room.send('leaderboardSnapshot', { json: JSON.stringify(board) })
  room.send('kickoffLeaderboardSnapshot', { json: JSON.stringify(await computeKickoffLeaderboard()) })
}

// Kickoff (group-stage) ranking — by group points only. Drives the "KICKOFF WINNERS"
// slide on the leaderboard TV.
async function computeKickoffLeaderboard(): Promise<LeaderboardRow[]> {
  loadResultsCache(await loadResults())
  const rows: LeaderboardRow[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Storage.getValues({ prefix: PLAYER_PREFIX, offset })
    for (const { key, value } of page.data) {
      const e = value as PlayerMirror | null
      if (!e?.predictions) continue
      const address = key.slice(PLAYER_PREFIX.length)
      rows.push({
        name:  e.name || address.slice(0, 8),
        address,
        value: totalPoints(e.predictions),
        exact: exactScoreCount(e.predictions)
      })
    }
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }
  rows.sort((a, b) => b.value - a.value || b.exact - a.exact)
  return rows.slice(0, LEADERBOARD_SIZE)
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

// Knockout: same rules; the fixture's existence is checked against the live list.
function isValidKoPrediction(d: { fixtureId: number; winner: string; score1: number; score2: number }): boolean {
  return validScore(d.score1, d.score2) && validOutcome(d.winner, d.score1, d.score2)
}

function isValidResult(d: { matchId: number; winner: string; score1: number; score2: number }): boolean {
  // Same rules; in addition the result's winner must agree with its score.
  if (!MATCHES.some(m => m.id === d.matchId)) return false
  if (!validScore(d.score1, d.score2)) return false
  if (!validOutcome(d.winner, d.score1, d.score2)) return false
  const implied = d.score1 > d.score2 ? 'team1' : d.score1 < d.score2 ? 'team2' : 'draw'
  return d.winner === implied
}
