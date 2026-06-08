import { PTS_WINNER, PTS_SCORE } from './prodeConfig'

export type Outcome = 'team1' | 'draw' | 'team2'

export type Match = {
  id: number
  group: string
  time: string
  team1: string
  team2: string
  flag1: string
  flag2: string
}

export type Group = {
  name: string
  teams: string[]
  flags: string[]
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

// ── Flag map — team name → ISO flag in images/flags/ ──────────────────────────
const PH = 'images/scene-thumbnail.png'
const FLAG_DIR = 'images/flags/'
const FLAG_CODE: Record<string, string> = {
  // Group A
  'Mexico':              'mx',
  'South Africa':        'za',
  'South Korea':         'kr',
  'Czechia':             'cz',
  'Canada':              'ca',
  'Bosnia & Herzegovina':'ba',
  // Group B
  'Qatar':               'qa',
  'Switzerland':         'ch',
  // Group C
  'Brazil':              'br',
  'Morocco':             'ma',
  'Haiti':               'ht',
  'Scotland':            'gb-sct',
  // Group D
  'USA':                 'us',
  'Paraguay':            'py',
  'Australia':           'au',
  'Turkey':              'tr',
  // Group E
  'Germany':             'de',
  'Curaçao':             'cw',
  'Ivory Coast':         'ci',
  'Ecuador':             'ec',
  // Group F
  'Netherlands':         'nl',
  'Japan':               'jp',
  'Sweden':              'se',
  'Tunisia':             'tn',
  // Group G
  'Belgium':             'be',
  'Egypt':               'eg',
  'Iran':                'ir',
  'New Zealand':         'nz',
  // Group H
  'Spain':               'es',
  'Cape Verde':          'cv',
  'Saudi Arabia':        'sa',
  'Uruguay':             'uy',
  // Group I
  'France':              'fr',
  'Senegal':             'sn',
  'Iraq':                'iq',
  'Norway':              'no',
  // Group J
  'Argentina':           'ar',
  'Algeria':             'dz',
  'Austria':             'at',
  'Jordan':              'jo',
  // Group K
  'Portugal':            'pt',
  'DR Congo':            'cd',
  'Uzbekistan':          'uz',
  'Colombia':            'co',
  // Group L
  'England':             'gb-eng',
  'Croatia':             'hr',
  'Ghana':               'gh',
  'Panama':              'pa',
}
function f(team: string): string {
  const code = FLAG_CODE[team]
  return code ? `${FLAG_DIR}${code}.png` : PH
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

// The local player's running total (uses the in-memory caches).
export function myPoints(): number {
  return totalPoints(predictions)
}
