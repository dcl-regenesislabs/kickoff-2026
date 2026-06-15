
import { signedFetch } from '~system/SignedFetch'
import { EnvVar } from '@dcl/sdk/server'
import { MATCHES, OfficialResult } from '../schedule/prodeData'
import { getKickoff } from '../schedule/matchDates'

// ── Auto-load official results from TheSportsDB ─────────────────────────────────
// Premium key is read from the SPORTSDB_KEY env var (never hardcoded — server code
// is bundled into bin/index.js, which clients can read). One `eventsseason` call
// returns all 72 group matches with scores + status. We only poll while a match
// that has already kicked off still has no official result, so it's quiet when
// nothing's in play and shuts itself off once everything is resolved.
const LEAGUE_ID = 4429
const SEASON    = '2026'
const TICK_MS   = 2 * 60 * 1000   // poll cadence while a started match is unresolved

// TheSportsDB team name → our prodeData name (only 2 differ).
const ALIAS: Record<string, string> = {
  'Czech Republic':     'Czechia',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina'
}
const norm = (t: string) => ALIAS[t] ?? t

// "teamA|teamB" (both orderings) → { matchId, team1 } so we can orient scores to
// OUR team1/team2 regardless of how the API lists home/away.
const PAIR = new Map<string, { matchId: number; team1: string }>()
for (const m of MATCHES) {
  PAIR.set(`${m.team1}|${m.team2}`, { matchId: m.id, team1: m.team1 })
  PAIR.set(`${m.team2}|${m.team1}`, { matchId: m.id, team1: m.team1 })
}

type ApiEvent = {
  strHomeTeam: string; strAwayTeam: string
  intHomeScore: string | null; intAwayScore: string | null
  strStatus: string
}

type SyncDeps = {
  loadResults:  () => Promise<OfficialResult[]>
  applyResults: (incoming: OfficialResult[]) => Promise<number>
}

export function startResultsSync(deps: SyncDeps) {
  let key = ''
  let syncing = false

  const tick = async () => {
    if (syncing) return

    // Read the premium key once (lazily).
    if (!key) {
      try { key = (await EnvVar.get('SPORTSDB_KEY')).trim() } catch { key = '' }
      if (!key) { console.log('[ResultsSync] SPORTSDB_KEY not set — sync disabled'); return }
    }

    // Only call the API when a kicked-off match still lacks a result.
    const now     = Date.now()
    const results = await deps.loadResults()
    const have    = new Set(results.map(r => r.matchId))
    const missing = MATCHES.filter(m => {
      const k = getKickoff(m.team1, m.team2)
      return k !== null && now >= k && !have.has(m.id)
    })
    if (missing.length === 0) return   // nothing in play → no call

    syncing = true
    try {
      const url = `https://www.thesportsdb.com/api/v1/json/${key}/eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`
      const res = await signedFetch({ url, init: { method: 'GET', headers: {} } })

      let events: ApiEvent[] = []
      try { events = JSON.parse(res.body ?? '{}').events ?? [] } catch { /* non-JSON */ }
      const ft = events.filter(e => e.strStatus === 'FT' && e.intHomeScore !== null && e.intAwayScore !== null)
      console.log(`[ResultsSync] <- HTTP ${res.status} | events=${events.length} FT=${ft.length} | missing=${missing.length}`)

      const incoming: OfficialResult[] = []
      for (const e of ft) {
        const info = PAIR.get(`${norm(e.strHomeTeam)}|${norm(e.strAwayTeam)}`)
        if (!info) { console.log(`[ResultsSync] unmapped fixture: ${e.strHomeTeam} vs ${e.strAwayTeam}`); continue }
        const hs = parseInt(e.intHomeScore as string, 10)
        const as = parseInt(e.intAwayScore as string, 10)
        if (isNaN(hs) || isNaN(as)) continue
        const homeIsTeam1 = norm(e.strHomeTeam) === info.team1
        const score1 = homeIsTeam1 ? hs : as
        const score2 = homeIsTeam1 ? as : hs
        const winner: OfficialResult['winner'] = score1 > score2 ? 'team1' : score1 < score2 ? 'team2' : 'draw'
        incoming.push({ matchId: info.matchId, winner, score1, score2 })
      }

      const applied = await deps.applyResults(incoming)
      if (applied > 0) console.log(`[ResultsSync] applied ${applied} new/updated result(s)`)
    } catch (err) {
      console.log('[ResultsSync] fetch error:', err)
    } finally {
      syncing = false
    }
  }

  // Self-rescheduling loop (waits for each tick to finish → no overlap).
  const loop = () => { void tick().finally(() => setTimeout(loop, TICK_MS)) }
  setTimeout(loop, 5000)   // small delay after server boot
  console.log('[ResultsSync] started — polling every 2 min while a kicked-off match has no result')
}
