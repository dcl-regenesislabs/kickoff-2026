import { PTS_WINNER, PTS_SCORE } from './prodeConfig'
import { Outcome } from './prodeData'
import { LOCK_LEAD_MS } from './matchDates'

// ── Knockout stage ──────────────────────────────────────────────────────────────
// Unlike the group stage (72 hardcoded matches), the knockout fixtures are
// DATA-DRIVEN from TheSportsDB: each cross is added by the API as it gets defined,
// with real teams, a stable `idEvent`, the round, and a UTC kickoff. We mirror them
// here keyed by that id. Scoring/lock are identical to the group stage; storage is
// a separate namespace (`prode:ko:*`) so the group stage is untouched.

export type KoFixture = {
  id: number        // API idEvent (stable, unique per cross)
  round: string     // API intRound: '32' (R32), '16' (R16), '8' (QF), ...
  team1: string     // home team (our normalized name)
  team2: string     // away team
  kickoff: number   // epoch ms (UTC)
}

export type KoPrediction = {
  fixtureId: number
  winner: Outcome | null
  score1: number
  score2: number
  submitted: boolean
}

export type KoResult = {
  fixtureId: number
  winner: Outcome
  score1: number
  score2: number
}

// In-memory caches (mutated in place so existing references stay valid).
export const koFixtures: KoFixture[] = []
export const koPredictions: KoPrediction[] = []
export const koResults = new Map<number, KoResult>()

// Replace the known fixtures and make sure each has a prediction slot.
export function loadKoFixtures(arr: KoFixture[]) {
  koFixtures.length = 0
  for (const f of arr) koFixtures.push(f)
  for (const f of arr) {
    if (!koPredictions.find(p => p.fixtureId === f.id)) {
      koPredictions.push({ fixtureId: f.id, winner: null, score1: 0, score2: 0, submitted: false })
    }
  }
}

// Rehydrate predictions from a server snapshot (in place).
export function loadKoPredictions(arr: KoPrediction[]) {
  for (const inc of arr) {
    const p = koPredictions.find(x => x.fixtureId === inc.fixtureId)
    if (p) { p.winner = inc.winner; p.score1 = inc.score1; p.score2 = inc.score2; p.submitted = inc.submitted }
    else koPredictions.push({ fixtureId: inc.fixtureId, winner: inc.winner, score1: inc.score1, score2: inc.score2, submitted: inc.submitted })
  }
}

export function loadKoResults(arr: KoResult[]) {
  koResults.clear()
  for (const r of arr) koResults.set(r.fixtureId, r)
}

export function getKoFixture(fixtureId: number): KoFixture | undefined {
  return koFixtures.find(f => f.id === fixtureId)
}

// Same scoring as the group stage: 3 for the right winner, +2 for the exact score.
export function scoreKoPrediction(pred: KoPrediction, result: KoResult): number {
  if (!pred.submitted || pred.winner == null) return 0
  const exact = pred.score1 === result.score1 && pred.score2 === result.score2
  if (exact) return PTS_WINNER + PTS_SCORE
  if (pred.winner === result.winner) return PTS_WINNER
  return 0
}

export function koTotalPoints(preds: KoPrediction[]): number {
  let total = 0
  for (const p of preds) {
    const r = koResults.get(p.fixtureId)
    if (r) total += scoreKoPrediction(p, r)
  }
  return total
}

// The local player's knockout points (uses the in-memory caches).
export function myKoPoints(): number {
  return koTotalPoints(koPredictions)
}

// Voting closes the same lead time before kickoff as the group stage.
export function isKoFixtureLocked(fixtureId: number): boolean {
  const f = getKoFixture(fixtureId)
  if (!f) return false
  return Date.now() >= f.kickoff - LOCK_LEAD_MS
}

// ── Persistence hook (client forwards each save to the server) ──────────────────
let _onKoSave: ((p: KoPrediction) => void) | null = null
export function setKoPredictionSync(cb: (p: KoPrediction) => void) { _onKoSave = cb }

export function saveKoPrediction(fixtureId: number, winner: Outcome, score1: number, score2: number) {
  let p = koPredictions.find(x => x.fixtureId === fixtureId)
  if (!p) { p = { fixtureId, winner: null, score1: 0, score2: 0, submitted: false }; koPredictions.push(p) }
  p.winner = winner; p.score1 = score1; p.score2 = score2; p.submitted = true
  _onKoSave?.(p)
}
