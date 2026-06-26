import { signedFetch } from '~system/SignedFetch'
import { EnvVar } from '@dcl/sdk/server'
import { MATCHES, OfficialResult } from '../schedule/prodeData'
import { getKickoff } from '../schedule/matchDates'
import { KoFixture, KoResult } from '../schedule/knockoutData'

// ── Auto-load results + knockout fixtures from TheSportsDB ──────────────────────
// One `eventsseason` call returns the whole tournament. We split it by `intRound`:
//   - rounds 1/2/3  → GROUP stage          → official results (prode:results)
//   - everything else → KNOCKOUT (R32/R16/QF/…) → fixtures (prode:ko:fixtures)
//                                              + results (prode:ko:results)
// Knockout fixtures are added by the API as each cross is defined (real teams,
// stable idEvent, UTC kickoff), so we just mirror them. Premium key from EnvVar.
const LEAGUE_ID  = 4429
const SEASON     = '2026'
const TICK_MS    = 2 * 60 * 1000        // poll cadence while a match is unresolved
const REFRESH_MS = 5 * 60 * 1000        // refresh fixtures even when nothing's "due"
const GROUP_ROUNDS = new Set(['1', '2', '3'])
const FINISHED = new Set(['FT', 'AET', 'PEN', 'Match Finished'])   // KO can end in ET/pens

const ALIAS: Record<string, string> = {
  'Czech Republic':     'Czechia',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina'
}
const norm = (t: string) => ALIAS[t] ?? t

// Group lookup: "teamA|teamB" → { matchId, team1 } (both orderings) to orient scores.
const PAIR = new Map<string, { matchId: number; team1: string }>()
for (const m of MATCHES) {
  PAIR.set(`${m.team1}|${m.team2}`, { matchId: m.id, team1: m.team1 })
  PAIR.set(`${m.team2}|${m.team1}`, { matchId: m.id, team1: m.team1 })
}

type ApiEvent = {
  idEvent: string; intRound: string
  strHomeTeam: string; strAwayTeam: string
  intHomeScore: string | null; intAwayScore: string | null
  strStatus: string
  strTimestamp?: string | null; dateEvent?: string | null; strTime?: string | null
}

type SyncDeps = {
  loadResults:    () => Promise<OfficialResult[]>
  applyResults:   (incoming: OfficialResult[]) => Promise<number>
  loadKoFixtures: () => Promise<KoFixture[]>
  saveKoFixtures: (fixtures: KoFixture[]) => Promise<number>
  loadKoResults:  () => Promise<KoResult[]>
  applyKoResults: (incoming: KoResult[]) => Promise<number>
}

function kickoffMs(e: ApiEvent): number {
  const ts = e.strTimestamp ? `${e.strTimestamp}Z`
    : e.dateEvent ? `${e.dateEvent}T${e.strTime || '00:00:00'}Z`
    : ''
  const k = Date.parse(ts)
  return isNaN(k) ? 0 : k
}

export function startResultsSync(deps: SyncDeps) {
  let key = ''
  let syncing = false
  let lastFetch = 0
  let warnedMissing = false

  const ensureKey = async (): Promise<boolean> => {
    if (key) return true
    try { key = (await EnvVar.get('SPORTSDB_KEY')).trim() } catch { key = '' }
    if (key) { console.log(`[ResultsSync] ✅ SPORTSDB_KEY loaded (len=${key.length})`); return true }
    if (!warnedMissing) {
      console.log('[ResultsSync] ⚠️ SPORTSDB_KEY MISSING — set it in THIS World\'s env. Auto-sync is OFF until then.')
      warnedMissing = true
    }
    return false
  }
  void ensureKey()

  const tick = async () => {
    if (syncing) return
    if (!(await ensureKey())) return

    const now = Date.now()

    // Group matches that kicked off but have no result yet.
    const gResults = await deps.loadResults()
    const gHave = new Set(gResults.map(r => r.matchId))
    const gMissing = MATCHES.filter(m => {
      const k = getKickoff(m.team1, m.team2)
      return k !== null && now >= k && !gHave.has(m.id)
    })

    // Knockout fixtures that kicked off but have no result yet.
    const koFix = await deps.loadKoFixtures()
    const koRes = await deps.loadKoResults()
    const koHave = new Set(koRes.map(r => r.fixtureId))
    const koMissing = koFix.filter(f => f.kickoff > 0 && now >= f.kickoff && !koHave.has(f.id))

    const refreshDue = now - lastFetch > REFRESH_MS   // also discovers newly-defined crosses
    if (gMissing.length === 0 && koMissing.length === 0 && !refreshDue) return

    syncing = true
    try {
      const url = `https://www.thesportsdb.com/api/v1/json/${key}/eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`
      const res = await signedFetch({ url, init: { method: 'GET', headers: {} } })
      lastFetch = now

      let events: ApiEvent[] = []
      try { events = JSON.parse(res.body ?? '{}').events ?? [] } catch { /* non-JSON */ }
      const group = events.filter(e => GROUP_ROUNDS.has(e.intRound))
      const ko    = events.filter(e => e.intRound && !GROUP_ROUNDS.has(e.intRound))
      console.log(`[ResultsSync] <- HTTP ${res.status} | events=${events.length} (group=${group.length} ko=${ko.length}) | gMissing=${gMissing.length} koMissing=${koMissing.length}`)

      // ── GROUP results (FT only — group can legitimately draw) ──
      const gIncoming: OfficialResult[] = []
      for (const e of group) {
        if (e.strStatus !== 'FT' || e.intHomeScore === null || e.intAwayScore === null) continue
        const info = PAIR.get(`${norm(e.strHomeTeam)}|${norm(e.strAwayTeam)}`)
        if (!info) { console.log(`[ResultsSync] unmapped group fixture: ${e.strHomeTeam} vs ${e.strAwayTeam}`); continue }
        const hs = parseInt(e.intHomeScore as string, 10), as = parseInt(e.intAwayScore as string, 10)
        if (isNaN(hs) || isNaN(as)) continue
        const homeIsTeam1 = norm(e.strHomeTeam) === info.team1
        const s1 = homeIsTeam1 ? hs : as, s2 = homeIsTeam1 ? as : hs
        const winner: OfficialResult['winner'] = s1 > s2 ? 'team1' : s1 < s2 ? 'team2' : 'draw'
        gIncoming.push({ matchId: info.matchId, winner, score1: s1, score2: s2 })
      }
      const gApplied = await deps.applyResults(gIncoming)
      if (gApplied > 0) console.log(`[ResultsSync] group: applied ${gApplied} result(s)`)

      // ── KNOCKOUT fixtures (every KO event with real teams) ──
      const fixtures: KoFixture[] = []
      for (const e of ko) {
        const id = parseInt(e.idEvent, 10)
        if (isNaN(id) || !e.strHomeTeam || !e.strAwayTeam) continue
        fixtures.push({ id, round: e.intRound, team1: norm(e.strHomeTeam), team2: norm(e.strAwayTeam), kickoff: kickoffMs(e) })
      }
      if (fixtures.length > 0) {
        const fixChanged = await deps.saveKoFixtures(fixtures)
        if (fixChanged > 0) console.log(`[ResultsSync] ko: ${fixtures.length} fixtures (${fixChanged} new/updated)`)
      }

      // ── KNOCKOUT results (FT/AET/PEN — penalties ignored, score from regulation/ET) ──
      const koIncoming: KoResult[] = []
      for (const e of ko) {
        if (!FINISHED.has(e.strStatus) || e.intHomeScore === null || e.intAwayScore === null) continue
        const id = parseInt(e.idEvent, 10)
        const hs = parseInt(e.intHomeScore as string, 10), as = parseInt(e.intAwayScore as string, 10)
        if (isNaN(id) || isNaN(hs) || isNaN(as)) continue
        const winner: KoResult['winner'] = hs > as ? 'team1' : hs < as ? 'team2' : 'draw'
        koIncoming.push({ fixtureId: id, winner, score1: hs, score2: as })   // team1 = home
      }
      const kApplied = await deps.applyKoResults(koIncoming)
      if (kApplied > 0) console.log(`[ResultsSync] ko: applied ${kApplied} result(s)`)
    } catch (err) {
      console.log('[ResultsSync] fetch error:', err)
    } finally {
      syncing = false
    }
  }

  const loop = () => { void tick().finally(() => setTimeout(loop, TICK_MS)) }
  setTimeout(loop, 5000)
  console.log('[ResultsSync] started — group + knockout, polling every 2 min')
}
