#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Repro / load-test for the "scores don't load when many players join at once"
// bug (storage service bottleneck).
//
// It models the DCL Storage service with a mock that:
//   - paginates getValues() like the real one (PAGE_SIZE per call),
//   - charges a latency per call,
//   - SLOWS DOWN under concurrency (contention model) — every extra in-flight
//     call makes all in-flight calls slower, like a saturated backend,
//   - TIMES OUT a call that takes too long → the leaderboard read fails and the
//     player sees no score (exactly the reported symptom).
//
// Then it fires N players joining simultaneously (each runs requestLeaderboard)
// against the OLD handler (recompute per request = 5 full scans) and the NEW one
// (in-memory cache + a single coalesced scan), and prints the comparison.
//
// Usage:
//   node scripts/loadtest-leaderboard.mjs
//   PLAYERS=500 JOINS=10 node scripts/loadtest-leaderboard.mjs
// ─────────────────────────────────────────────────────────────────────────────

const PLAYERS   = Number(process.env.PLAYERS ?? 300)   // players already in storage
const JOINS     = Number(process.env.JOINS   ?? 10)    // players joining at the same instant
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 50)  // getValues page size
const BASE_MS   = Number(process.env.BASE_MS ?? 20)    // service time of one storage call
const POOL      = Number(process.env.POOL ?? 6)        // concurrent slots the backend serves
const QPS_LIMIT = Number(process.env.QPS_LIMIT ?? 100) // backend rate limit; excess is throttled (429)

const PLAYER_PREFIX = 'prode:player:'
const KO_PLAYER_PREFIX = 'prode:ko:player:'

// ── Mock Storage service with a contention model ────────────────────────────────
function makeStorage() {
  const kv = new Map()
  let calls = 0
  let throttled = 0
  let free = POOL              // available concurrent slots (for service latency)
  const waiters = []           // FIFO queue waiting for a slot
  let tokens = QPS_LIMIT       // rate-limit token bucket
  let lastRefill = Date.now()

  for (let i = 0; i < PLAYERS; i++) {
    const addr = '0x' + i.toString(16).padStart(40, '0')
    kv.set(PLAYER_PREFIX + addr, { name: `player${i}`, predictions: [{ matchId: 1, winner: 'team1', score1: 2, score2: 1, submitted: true }] })
    kv.set(KO_PLAYER_PREFIX + addr, { name: `player${i}`, predictions: [] })
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const acquire = () => new Promise((resolve) => {
    if (free > 0) { free--; resolve() } else waiters.push(resolve)
  })
  const release = () => { const next = waiters.shift(); if (next) next(); else free++ }

  // Each call first passes the rate limiter (a token bucket refilling at QPS_LIMIT/s).
  // When the bucket is empty the backend throttles (429) → the read fails, which is
  // exactly what a player sees as "my score didn't load". Otherwise it costs BASE_MS.
  async function charge() {
    calls++
    const now = Date.now()
    tokens = Math.min(QPS_LIMIT, tokens + ((now - lastRefill) / 1000) * QPS_LIMIT)
    lastRefill = now
    if (tokens < 1) { throttled++; throw new Error('storage throttled (429)') }
    tokens -= 1
    await acquire()
    await sleep(BASE_MS)
    release()
  }

  async function getValues({ prefix, offset }) {
    await charge()
    const all = [...kv.entries()].filter(([k]) => k.startsWith(prefix))
    const slice = all.slice(offset, offset + PAGE_SIZE)
    return { data: slice.map(([key, value]) => ({ key, value })), pagination: { total: all.length } }
  }

  return { getValues, stats: () => ({ calls, throttled }) }
}

async function scan(storage, prefix) {
  const rows = []
  let offset = 0
  while (true) {
    const page = await storage.getValues({ prefix, offset })
    for (const { key } of page.data) rows.push(key.slice(prefix.length))
    offset += page.data.length
    if (page.data.length === 0 || offset >= page.pagination.total) break
  }
  return rows
}

// ── OLD: every requestLeaderboard recomputes from scratch → 5 full scans ─────────
async function oldRequestLeaderboard(storage) {
  // computeLeaderboard (total): PLAYER + KO
  await scan(storage, PLAYER_PREFIX)
  await scan(storage, KO_PLAYER_PREFIX)
  // computeKickoffLeaderboard: PLAYER
  await scan(storage, PLAYER_PREFIX)
  // computeKnockoutLeaderboard: KO + PLAYER
  await scan(storage, KO_PLAYER_PREFIX)
  await scan(storage, PLAYER_PREFIX)
}

// ── NEW: in-memory cache + single coalesced 2-scan recompute ─────────────────────
function makeNewHandler(storage) {
  let ready = false
  let inFlight = null
  async function recompute() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      await scan(storage, PLAYER_PREFIX)
      await scan(storage, KO_PLAYER_PREFIX)
      ready = true
    })().finally(() => { inFlight = null })
    return inFlight
  }
  return async function requestLeaderboard() {
    if (!ready) await recompute()
    // else: serve cached JSON — zero storage calls
  }
}

// `makeFire(storage)` returns the per-join handler, sharing any state (the cache)
// across all JOINS joins — exactly like one server instance serving the burst.
async function run(label, makeFire) {
  const storage = makeStorage()
  const fire = makeFire(storage)
  const t0 = Date.now()
  const results = await Promise.allSettled(Array.from({ length: JOINS }, () => fire()))
  const wall = Date.now() - t0
  const s = storage.stats()
  const failed = results.filter((r) => r.status === 'rejected').length
  console.log(
    `${label.padEnd(14)} | storage calls: ${String(s.calls).padStart(5)} | throttled (429): ${String(s.throttled).padStart(4)} | failed joins: ${failed}/${JOINS} | wall: ${wall}ms`
  )
  return { ...s, failed, wall }
}

console.log(`\nScenario: ${JOINS} players joining simultaneously, ${PLAYERS} players already in storage`)
console.log(`(page size ${PAGE_SIZE} → ${Math.ceil(PLAYERS / PAGE_SIZE)} pages per full scan, ${BASE_MS}ms/call, backend limit ${QPS_LIMIT} req/s)\n`)

const oldStats = await run('OLD (no cache)', (storage) => () => oldRequestLeaderboard(storage))
const newStats = await run('NEW (cache)', (storage) => makeNewHandler(storage))

console.log('')
const drop = (a, b) => `${(100 * (1 - b / a)).toFixed(1)}%`
console.log(`→ storage calls:  ${oldStats.calls} → ${newStats.calls}  (−${drop(oldStats.calls, newStats.calls)})`)
console.log(`→ throttled (429): ${oldStats.throttled} → ${newStats.throttled}`)
console.log(`→ failed joins:   ${oldStats.failed}/${JOINS} → ${newStats.failed}/${JOINS}`)
console.log(`→ wall time:      ${oldStats.wall}ms → ${newStats.wall}ms\n`)
