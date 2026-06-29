import { Storage } from '@dcl/sdk/server/index.js'
import {
  room, STORAGE_KEY, RESULTS_KEY, PLAYER_PREFIX,
  KO_PREDICTIONS_KEY, KO_RESULTS_KEY, KO_FIXTURES_KEY, KO_PLAYER_PREFIX
} from '../schedule/prodeNet'
import {
  Prediction, OfficialResult, MATCHES, makeDefaultPredictions,
  loadResults as loadResultsCache, totalPoints, exactScoreCount, getResult, scorePrediction
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
      markLeaderboardStale()
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
  // Served from an in-memory cache. The expensive full-storage scan only runs when
  // the cache is stale (after a submit/result change), and concurrent joiners share
  // a single in-flight recompute — so a 10-player join burst costs ≤1 scan, not ~50.
  room.onMessage('requestLeaderboard', async (_data, ctx) => {
    if (!ctx) return
    if (!lbReady) await recomputeLeaderboards()
    room.send('leaderboardSnapshot',         { json: lbTotalJson },    { to: [ctx.from] })
    room.send('kickoffLeaderboardSnapshot',  { json: lbKickoffJson },  { to: [ctx.from] })
    room.send('knockoutLeaderboardSnapshot', { json: lbKnockoutJson }, { to: [ctx.from] })

    // Personal rank: tiny message (6 ints). Uses the full in-memory sorted arrays —
    // never limited — so the rank/total values are always accurate.
    const addr    = ctx.from.toLowerCase()
    const kRank   = kickoffRowsFull.findIndex(r => r.address === addr) + 1
    const koRank  = knockoutRowsFull.findIndex(r => r.address === addr) + 1
    const totRank = totalRowsFull.findIndex(r => r.address === addr) + 1
    room.send('myRankSnapshot', {
      kickoffRank:   kRank,   kickoffTotal:  kickoffRowsFull.length,
      knockoutRank:  koRank,  knockoutTotal: knockoutRowsFull.length,
      totalRank:     totRank, totalTotal:    totalRowsFull.length
    }, { to: [ctx.from] })
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
      markLeaderboardStale()
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

  // Warm the leaderboard cache so the first joiner doesn't pay the scan cost.
  void recomputeLeaderboards()

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

// Group stage is finished — its top-3 are final, so we display them on the kickoff
// podium right away (instead of waiting for tournament end). Identities are fixed
// here; the podium still fetches each winner's live avatar by address.
// points/accuracy here are fallbacks (shown in worlds without these players' mirror,
// e.g. the test world). In prod they're overridden with the live values.
const GROUP_STAGE_WINNERS: WinnerEntry[] = [
  { address: '0x185af8cf06431dacbc877ac754d21e86b4f68136', rank: 1, name: 'Shiny',    points: 165, accuracy: 68 },
  { address: '0x575b1100e732e5abe528bac55156936f6b827776', rank: 2, name: 'Maska',    points: 160, accuracy: 65 },
  { address: '0x778a094cbff9fd2e5a27f6ad50993f1add00da39', rank: 3, name: 'Mauhetti', points: 155, accuracy: 65 }
]

// Resolve each hardcoded group winner's live points + accuracy from their mirror.
// Falls back to the hardcoded points (and 0% accuracy) if the mirror is missing.
async function groupWinnersWithStats(): Promise<WinnerEntry[]> {
  loadResultsCache(await loadResults())
  const out: WinnerEntry[] = []
  for (const w of GROUP_STAGE_WINNERS) {
    let points = w.points
    let accuracy = w.accuracy ?? 0
    try {
      const mir = await Storage.get<PlayerMirror>(PLAYER_PREFIX + w.address.toLowerCase())
      const preds = mir?.predictions ?? []
      if (preds.length > 0) {
        points = totalPoints(preds)
        let played = 0, hits = 0
        for (const p of preds) {
          if (!p.submitted) continue
          const r = getResult(p.matchId)
          if (!r) continue
          played++
          if (scorePrediction(p, r) > 0) hits++
        }
        accuracy = played > 0 ? Math.round((hits / played) * 100) : 0
      }
    } catch { /* keep hardcoded points, accuracy 0 */ }
    out.push({ ...w, points, accuracy })
  }
  return out
}

// 3 step positions for a podium placed at `base` (TUNABLE — tweak to sit on the model's steps).
function podiumSlots(base: Vector3): Vector3[] {
  return [
    Vector3.create(base.x + 0.5,      base.y + 2.60, base.z - 0.15),   // 1st
    Vector3.create(base.x - 0.7, base.y + 1.90, base.z),   // 2nd
    Vector3.create(base.x + 1.6, base.y + 1.55, base.z)    // 3rd
  ]
}

function setupPodiums() {
  const ROT = Quaternion.fromEulerDegrees(0, 180, 0)
  // Podium01 = kickoff (group) winners; Podium01_2 = knockout winners.
  // syncBaseId spacing = 4 ids per slot (avatar + board + name + stats) × 3 slots = 12.
  const kickoffPodium  = new PodiumAvatarsServer(podiumSlots(Vector3.create(82.2,  -0.1, 70.75)), ROT, ROT, 'kickoff',  5000)
  const knockoutPodium = new PodiumAvatarsServer(podiumSlots(Vector3.create(89.5,  0, 70.75)), ROT, ROT, 'knockout', 5020)

  // Group stage is over → show its (final, fixed) winners immediately, with live
  // points + accuracy resolved from each winner's mirror.
  void (async () => {
    const winners = await groupWinnersWithStats()
    kickoffPodium.showWinners(winners)
    console.log(`[Podium] group winners shown — #1 ${winners[0]?.name} (${winners[0]?.points}pts ${winners[0]?.accuracy}%)`)
  })()

  // Knockout podium still waits for tournament end, computed live from the mirror.
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
        knockoutPodium.showWinners(w.ko)
        console.log(`[Podium] knockout shown — #1: ${w.ko[0]?.name ?? '-'} | total #1: ${w.total[0]?.name ?? '-'}`)
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
  await recomputeLeaderboards()
  broadcastCachedLeaderboards()
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
  await recomputeLeaderboards()
  broadcastCachedLeaderboards()
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
    let changed = false
    if (patch.name !== undefined && patch.name !== cur.name)        { cur.name = patch.name; changed = true }
    if (patch.predictions !== undefined)                            { cur.predictions = patch.predictions; changed = true }
    if (!changed) return
    await Storage.set(key, cur)
    markLeaderboardStale()
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

// Merge-update the scene mirror used for leaderboard aggregation. Skips the write
// (and the leaderboard invalidation) when nothing actually changed — keeps the
// per-join identify cheap and avoids needless storage writes during a join burst.
async function mirrorPlayer(addr: string, patch: Partial<PlayerMirror>) {
  try {
    const key = PLAYER_PREFIX + addr
    const cur = (await Storage.get<PlayerMirror>(key)) ?? { name: '', predictions: [] }
    let changed = false
    if (patch.name !== undefined && patch.name !== cur.name)        { cur.name = patch.name; changed = true }
    if (patch.predictions !== undefined)                            { cur.predictions = patch.predictions; changed = true }
    if (!changed) return
    await Storage.set(key, cur)
    markLeaderboardStale()
  } catch (e) {
    console.log('[Server] mirrorPlayer FAILED:', e)
  }
}

type LeaderboardRow = { name: string; address: string; value: number; exact: number }

// ── Leaderboard cache ─────────────────────────────────────────────────────────────
// The three rankings are derived from a single full scan of both mirrors and cached
// as pre-serialized JSON. Joins serve the cache; the scan only re-runs when state is
// stale, and concurrent recomputes coalesce onto one in-flight promise.
let lbTotalJson    = '[]'   // TOTAL = group + knockout, top LEADERBOARD_SIZE
let lbKickoffJson  = '[]'   // group-stage points only, top TV_LB_ROWS (for TV display)
let lbKnockoutJson = '[]'   // knockout points only, top TV_LB_ROWS (for TV display)
let lbReady = false

// Full sorted arrays kept in memory for per-player rank lookup (never broadcast).
let kickoffRowsFull:  LeaderboardRow[] = []
let knockoutRowsFull: LeaderboardRow[] = []
let totalRowsFull:    LeaderboardRow[] = []

// TV panel shows top-3 (kickoff) and top-6 (knockout); broadcast a bit more so the
// client slice works even if data shifts. Each row ≈ 120 bytes → 8 rows ≈ 1 KB.
const TV_LB_ROWS = 8
let lbInFlight: Promise<void> | null = null
let lbDirty = false

// Mark the cache stale without recomputing — the next requestLeaderboard rebuilds it
// once. If a scan is in flight, flag it so that scan re-runs with the new data.
function markLeaderboardStale() {
  lbReady = false
  if (lbInFlight) lbDirty = true
}

function broadcastCachedLeaderboards() {
  room.send('leaderboardSnapshot',         { json: lbTotalJson })
  room.send('kickoffLeaderboardSnapshot',  { json: lbKickoffJson })
  room.send('knockoutLeaderboardSnapshot', { json: lbKnockoutJson })
}

// Rebuild all three rankings. Coalesces concurrent callers onto one in-flight scan
// (a join burst → ≤1 scan), and re-runs once if invalidated mid-scan.
function recomputeLeaderboards(): Promise<void> {
  if (lbInFlight) { lbDirty = true; return lbInFlight }
  lbInFlight = (async () => {
    do {
      lbDirty = false
      await doRecomputeLeaderboards()
    } while (lbDirty)
    lbReady = true
  })().finally(() => { lbInFlight = null })
  return lbInFlight
}

// The single 2-scan pass that derives total / kickoff / knockout in one go
// (was 5 separate full scans across buildLeaderboard + the two compute* helpers).
async function doRecomputeLeaderboards(): Promise<void> {
  loadResultsCache(await loadResults())
  loadKoResultsCache(await loadKoResultsSrv())

  // address → merged mirror state. `inGroup` tracks presence in the group mirror,
  // which is the base list for the knockout ranking.
  type Entry = { name: string; group?: Prediction[]; ko?: KoPrediction[]; inGroup: boolean }
  const map = new Map<string, Entry>()

  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await Storage.getValues({ prefix: PLAYER_PREFIX, offset })
    for (const { key, value } of page.data) {
      const e = value as PlayerMirror | null
      const address = key.slice(PLAYER_PREFIX.length)
      const cur = map.get(address) ?? { name: '', inGroup: false }
      cur.inGroup = true
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
      const cur = map.get(address) ?? { name: '', inGroup: false }
      if (e?.name && !cur.name) cur.name = e.name
      if (e?.predictions) cur.ko = e.predictions
      map.set(address, cur)
    }
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }

  const totalRows:    LeaderboardRow[] = []
  const kickoffRows:  LeaderboardRow[] = []
  const knockoutRows: LeaderboardRow[] = []
  for (const [address, v] of map) {
    const name       = v.name || address.slice(0, 8)
    const groupPts   = v.group ? totalPoints(v.group)      : 0
    const koPts      = v.ko    ? koTotalPoints(v.ko)       : 0
    const groupExact = v.group ? exactScoreCount(v.group)  : 0
    const koExact    = v.ko    ? koExactCount(v.ko)        : 0

    // TOTAL — players with predictions in either stage.
    if (v.group || v.ko) {
      totalRows.push({ name, address, value: groupPts + koPts, exact: groupExact + koExact })
    }
    // KICKOFF — players with group predictions, group points only.
    if (v.group) {
      kickoffRows.push({ name, address, value: groupPts, exact: groupExact })
    }
    // KNOCKOUT — base is the group mirror (everyone who joined), knockout points only.
    if (v.inGroup) {
      knockoutRows.push({ name, address, value: koPts, exact: koExact })
    }
  }

  const byScore = (a: LeaderboardRow, b: LeaderboardRow) => b.value - a.value || b.exact - a.exact
  totalRows.sort(byScore)
  kickoffRows.sort(byScore)
  knockoutRows.sort(byScore)

  kickoffRowsFull  = kickoffRows
  knockoutRowsFull = knockoutRows
  totalRowsFull    = totalRows

  lbTotalJson    = JSON.stringify(totalRows.slice(0, LEADERBOARD_SIZE))
  lbKickoffJson  = JSON.stringify(kickoffRows.slice(0, TV_LB_ROWS))
  lbKnockoutJson = JSON.stringify(knockoutRows.slice(0, TV_LB_ROWS))
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
