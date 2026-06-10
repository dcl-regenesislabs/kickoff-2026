import { PTS_WINNER, PTS_SCORE } from './prodeConfig'

export type Outcome = 'team1' | 'draw' | 'team2'

export type FlagRef = { src: string; uvs: number[] }

export type Match = {
  id: number
  group: string
  time: string
  team1: string
  team2: string
  flag1: FlagRef
  flag2: FlagRef
}

export type Group = {
  name: string
  teams: string[]
  flags: FlagRef[]
  matches: Match[]
}

// ── Team abbreviations ────────────────────────────────────────────────────────
const TEAM_ABBR: Record<string, string> = {
  'Mexico':'MEX','South Africa':'RSA','South Korea':'KOR','Czechia':'CZE',
  'Canada':'CAN','Bosnia & Herzegovina':'BIH','Qatar':'QAT','Switzerland':'SUI',
  'Brazil':'BRA','Morocco':'MAR','Haiti':'HAI','Scotland':'SCO',
  'USA':'USA','Paraguay':'PAR','Australia':'AUS','Turkey':'TUR',
  'Germany':'GER','Curaçao':'CUW','Ivory Coast':'CIV','Ecuador':'ECU',
  'Netherlands':'NED','Japan':'JPN','Sweden':'SWE','Tunisia':'TUN',
  'Belgium':'BEL','Egypt':'EGY','Iran':'IRN','New Zealand':'NZL',
  'Spain':'ESP','Cape Verde':'CPV','Saudi Arabia':'KSA','Uruguay':'URU',
  'France':'FRA','Senegal':'SEN','Iraq':'IRQ','Norway':'NOR',
  'Argentina':'ARG','Algeria':'ALG','Austria':'AUT','Jordan':'JOR',
  'Portugal':'POR','DR Congo':'COD','Uzbekistan':'UZB','Colombia':'COL',
  'England':'ENG','Croatia':'CRO','Ghana':'GHA','Panama':'PAN',
}
export function abbr(team: string): string {
  return TEAM_ABBR[team] ?? team.slice(0, 3).toUpperCase()
}

// ── Flag atlas UV map (2×2 grid) ──────────────────────────────────────────────
// Each atlas is 1024×1024 with 4 flags in a 2×2 grid.
// DCL plane vertex order: [BR, TR, TL, BL] + horizontal u-flip within each cell
const CELL_UVS: number[][] = [
  [0,   0.5, 0,   1.0, 0.5, 1.0, 0.5, 0.5], // pos 0: top-left image quadrant
  [0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 1.0, 0.5], // pos 1: top-right image quadrant
  [0,   0,   0,   0.5, 0.5, 0.5, 0.5, 0  ], // pos 2: bottom-left image quadrant
  [0.5, 0,   0.5, 0.5, 1.0, 0.5, 1.0, 0  ], // pos 3: bottom-right image quadrant
]

const FLAG_ATLAS: Record<string, [string, number]> = {
  // Group A  → atlas_a.png
  'Mexico':              ['a', 0], 'South Africa':        ['a', 1],
  'South Korea':         ['a', 2], 'Czechia':             ['a', 3],
  // Group B  → atlas_b.png
  'Canada':              ['b', 0], 'Bosnia & Herzegovina':['b', 1],
  'Qatar':               ['b', 2], 'Switzerland':         ['b', 3],
  // Group C  → atlas_c.png
  'Brazil':              ['c', 0], 'Morocco':             ['c', 1],
  'Haiti':               ['c', 2], 'Scotland':            ['c', 3],
  // Group D  → atlas_d.png
  'USA':                 ['d', 0], 'Paraguay':            ['d', 1],
  'Australia':           ['d', 2], 'Turkey':              ['d', 3],
  // Group E  → atlas_e.png
  'Germany':             ['e', 0], 'Curaçao':             ['e', 1],
  'Ivory Coast':         ['e', 2], 'Ecuador':             ['e', 3],
  // Group F  → atlas_f.png
  'Netherlands':         ['f', 0], 'Japan':               ['f', 1],
  'Sweden':              ['f', 2], 'Tunisia':             ['f', 3],
  // Group G  → atlas_g.png
  'Belgium':             ['g', 0], 'Egypt':               ['g', 1],
  'Iran':                ['g', 2], 'New Zealand':         ['g', 3],
  // Group H  → atlas_h.png
  'Spain':               ['h', 0], 'Cape Verde':          ['h', 1],
  'Saudi Arabia':        ['h', 2], 'Uruguay':             ['h', 3],
  // Group I  → atlas_i.png
  'France':              ['i', 0], 'Senegal':             ['i', 1],
  'Iraq':                ['i', 2], 'Norway':              ['i', 3],
  // Group J  → atlas_j.png
  'Argentina':           ['j', 0], 'Algeria':             ['j', 1],
  'Austria':             ['j', 2], 'Jordan':              ['j', 3],
  // Group K  → atlas_k.png
  'Portugal':            ['k', 0], 'DR Congo':            ['k', 1],
  'Uzbekistan':          ['k', 2], 'Colombia':            ['k', 3],
  // Group L  → atlas_l.png
  'England':             ['l', 0], 'Croatia':             ['l', 1],
  'Ghana':               ['l', 2], 'Panama':              ['l', 3],
}

const PH: FlagRef = { src: 'images/scene-thumbnail.png', uvs: [0, 0, 1, 0, 1, 1, 0, 1] }

function f(team: string): FlagRef {
  const entry = FLAG_ATLAS[team]
  if (!entry) return PH
  const [letter, pos] = entry
  return { src: `images/flags/atlas_${letter}.png`, uvs: CELL_UVS[pos] }
}

// ── Match builder ────────────────────────────────────
let _id = 0
const mk = (group: string, t1: string, t2: string): Match => ({
  id: _id++, group, time: '', team1: t1, team2: t2, flag1: f(t1), flag2: f(t2)
})

// ── Groups (official 2026 WC draw) ────────────────────────────
// Each group is a 4-team round robin -> 6 matches, generated in the order below.
const RR: [number, number][] = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]

const GROUP_TEAMS: { name: string; teams: [string, string, string, string] }[] = [
  { name: 'Group A', teams: ['Mexico', 'South Africa', 'South Korea', 'Czechia'] },
  { name: 'Group B', teams: ['Canada', 'Bosnia & Herzegovina', 'Qatar', 'Switzerland'] },
  { name: 'Group C', teams: ['Brazil', 'Morocco', 'Haiti', 'Scotland'] },
  { name: 'Group D', teams: ['USA', 'Paraguay', 'Australia', 'Turkey'] },
  { name: 'Group E', teams: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'] },
  { name: 'Group F', teams: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'] },
  { name: 'Group G', teams: ['Belgium', 'Egypt', 'Iran', 'New Zealand'] },
  { name: 'Group H', teams: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'] },
  { name: 'Group I', teams: ['France', 'Senegal', 'Iraq', 'Norway'] },
  { name: 'Group J', teams: ['Argentina', 'Algeria', 'Austria', 'Jordan'] },
  { name: 'Group K', teams: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'] },
  { name: 'Group L', teams: ['England', 'Croatia', 'Ghana', 'Panama'] },
]

export const GROUPS: Group[] = GROUP_TEAMS.map(g => ({
  name: g.name,
  teams: g.teams,
  flags: g.teams.map(f),
  matches: RR.map(([a, b]) => mk(g.name, g.teams[a], g.teams[b])),
}))

export const MATCHES: Match[] = GROUPS.flatMap(g => g.matches)

// ── Predictions ───────────────────────────────────────────────────────────────
export type Prediction = {
  matchId: number
  winner: 'team1' | 'draw' | 'team2' | null
  score1: number
  score2: number
  submitted: boolean
}

export function makeDefaultPredictions(): Prediction[] {
  return MATCHES.map(m => ({
    matchId: m.id, winner: null, score1: 0, score2: 0, submitted: false
  }))
}

export const predictions: Prediction[] = makeDefaultPredictions()

export function getCompletedCount(): number {
  return predictions.filter(p => p.submitted).length
}

export function isGroupComplete(groupIndex: number): boolean {
  const g = GROUPS[groupIndex]
  if (!g) return false
  return g.matches.every(m => predictions.find(p => p.matchId === m.id)?.submitted ?? false)
}

// ── Persistence hooks ─────────────────────────────────────────────────────────
// The client registers a callback so each local save is also sent to the server.
// Kept as an injected hook to avoid a network import inside the data module.
let _onSave: ((p: Prediction) => void) | null = null
export function setPredictionSync(cb: (p: Prediction) => void) { _onSave = cb }

export function savePrediction(
  matchId: number,
  winner: 'team1' | 'draw' | 'team2',
  score1: number,
  score2: number
) {
  const pred = predictions.find(p => p.matchId === matchId)
  if (!pred) return
  pred.winner = winner
  pred.score1 = score1
  pred.score2 = score2
  pred.submitted = true
  _onSave?.(pred)
}

// Rehydrate the in-memory cache from a server snapshot (mutates in place so all
// existing references — UI progress bar, panel refresh — see the new values).
export function loadPredictions(arr: Prediction[]) {
  for (const incoming of arr) {
    const p = predictions.find(x => x.matchId === incoming.matchId)
    if (!p) continue
    p.winner    = incoming.winner
    p.score1    = incoming.score1
    p.score2    = incoming.score2
    p.submitted = incoming.submitted
  }
}

// ── Official results (admin-loaded, scene-wide) ───────────────────────────────
export type OfficialResult = {
  matchId: number
  winner: Outcome
  score1: number
  score2: number
}

// matchId → result. Only finished matches are present.
export const officialResults = new Map<number, OfficialResult>()

export function getResult(matchId: number): OfficialResult | undefined {
  return officialResults.get(matchId)
}

export function hasResult(matchId: number): boolean {
  return officialResults.has(matchId)
}

// Rehydrate the results cache from a server snapshot (mutates in place).
export function loadResults(arr: OfficialResult[]) {
  officialResults.clear()
  for (const r of arr) officialResults.set(r.matchId, r)
}

// The admin client registers this so each official result is sent to the server.
let _onResult: ((r: OfficialResult) => void) | null = null
export function setResultSync(cb: (r: OfficialResult) => void) { _onResult = cb }

export function submitOfficialResult(
  matchId: number, winner: Outcome, score1: number, score2: number
) {
  const r: OfficialResult = { matchId, winner, score1, score2 }
  officialResults.set(matchId, r)
  _onResult?.(r)
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Correct winner only → 1 pt. Exact score (winner implied) → 1 + 3 = 4 pts.
export function scorePrediction(pred: Prediction, result: OfficialResult): number {
  if (!pred.submitted || pred.winner == null) return 0
  const exact = pred.score1 === result.score1 && pred.score2 === result.score2
  if (exact) return PTS_WINNER + PTS_SCORE
  if (pred.winner === result.winner) return PTS_WINNER
  return 0
}

// Total points for a set of predictions against the currently loaded results.
export function totalPoints(preds: Prediction[]): number {
  let total = 0
  for (const p of preds) {
    const r = officialResults.get(p.matchId)
    if (r) total += scorePrediction(p, r)
  }
  return total
}

// Count exact-score hits (tiebreaker).
export function exactScoreCount(preds: Prediction[]): number {
  let count = 0
  for (const p of preds) {
    const r = officialResults.get(p.matchId)
    if (r && p.submitted && p.score1 === r.score1 && p.score2 === r.score2) count++
  }
  return count
}

// The local player's running total (uses the in-memory caches).
export function myPoints(): number {
  return totalPoints(predictions)
}
