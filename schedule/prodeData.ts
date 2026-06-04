export type Match = {
  id: number
  group: string
  time: string
  team1: string
  team2: string
  flag1: string
  flag2: string
}

export type DateGroup = {
  date: string
  matches: Match[]
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

// ── Match builder ─────────────────────────────────────────────────────────────
let _id = 0
const m = (group: string, time: string, t1: string, t2: string): Match => ({
  id: _id++, group, time, team1: t1, team2: t2, flag1: f(t1), flag2: f(t2)
})

// ── All dates ─────────────────────────────────────────────────────────────────
export const DATES: DateGroup[] = [
  {
    date: 'June 11',
    matches: [
      m('Group A', '9:00 PM',  'Mexico',     'South Africa'),
    ]
  },
  {
    date: 'June 12',
    matches: [
      m('Group A', '4:00 AM',  'South Korea',         'Czechia'),
      m('Group A', '9:00 PM',  'Canada',              'Bosnia & Herzegovina'),
    ]
  },
  {
    date: 'June 13',
    matches: [
      m('Group D', '3:00 AM',  'USA',         'Paraguay'),
      m('Group B', '9:00 PM',  'Qatar',       'Switzerland'),
    ]
  },
  {
    date: 'June 14',
    matches: [
      m('Group C', '12:00 AM', 'Brazil',      'Morocco'),
      m('Group C', '3:00 AM',  'Haiti',       'Scotland'),
      m('Group D', '6:00 AM',  'Australia',   'Turkey'),
      m('Group E', '7:00 PM',  'Germany',     'Curaçao'),
      m('Group F', '10:00 PM', 'Netherlands', 'Japan'),
    ]
  },
  {
    date: 'June 15',
    matches: [
      m('Group E', '1:00 AM',  'Ivory Coast',  'Ecuador'),
      m('Group F', '4:00 AM',  'Sweden',       'Tunisia'),
      m('Group H', '6:00 PM',  'Spain',        'Cape Verde'),
      m('Group G', '9:00 PM',  'Belgium',      'Egypt'),
    ]
  },
  {
    date: 'June 16',
    matches: [
      m('Group H', '12:00 AM', 'Saudi Arabia', 'Uruguay'),
      m('Group G', '3:00 AM',  'Iran',         'New Zealand'),
      m('Group I', '9:00 PM',  'France',       'Senegal'),
    ]
  },
  {
    date: 'June 17',
    matches: [
      m('Group I', '12:00 AM', 'Iraq',      'Norway'),
      m('Group J', '3:00 AM',  'Argentina', 'Algeria'),
      m('Group J', '6:00 AM',  'Austria',   'Jordan'),
      m('Group K', '7:00 PM',  'Portugal',  'DR Congo'),
      m('Group L', '10:00 PM', 'England',   'Croatia'),
    ]
  },
  {
    date: 'June 18',
    matches: [
      m('Group L', '1:00 AM',  'Ghana',      'Panama'),
      m('Group K', '4:00 AM',  'Uzbekistan', 'Colombia'),
      m('Group A', '6:00 PM',  'Czechia',    'South Africa'),
      m('Group B', '9:00 PM',  'Switzerland','Bosnia & Herzegovina'),
    ]
  },
  {
    date: 'June 19',
    matches: [
      m('Group B', '12:00 AM', 'Canada',     'Qatar'),
      m('Group A', '3:00 AM',  'Mexico',     'South Korea'),
      m('Group D', '9:00 PM',  'USA',        'Australia'),
    ]
  },
  {
    date: 'June 20',
    matches: [
      m('Group C', '12:00 AM', 'Scotland',    'Morocco'),
      m('Group C', '2:30 AM',  'Brazil',      'Haiti'),
      m('Group D', '5:00 AM',  'Turkey',      'Paraguay'),
      m('Group F', '7:00 PM',  'Netherlands', 'Sweden'),
      m('Group E', '10:00 PM', 'Germany',     'Ivory Coast'),
    ]
  },
  {
    date: 'June 21',
    matches: [
      m('Group E', '2:00 AM',  'Ecuador',      'Curaçao'),
      m('Group F', '6:00 AM',  'Tunisia',      'Japan'),
      m('Group H', '6:00 PM',  'Spain',        'Saudi Arabia'),
      m('Group G', '9:00 PM',  'Belgium',      'Iran'),
    ]
  },
  {
    date: 'June 22',
    matches: [
      m('Group H', '12:00 AM', 'Uruguay',     'Cape Verde'),
      m('Group G', '3:00 AM',  'New Zealand', 'Egypt'),
      m('Group J', '7:00 PM',  'Argentina',   'Austria'),
      m('Group I', '11:00 PM', 'France',      'Iraq'),
    ]
  },
  {
    date: 'June 23',
    matches: [
      m('Group I', '2:00 AM',  'Norway',   'Senegal'),
      m('Group J', '5:00 AM',  'Jordan',   'Algeria'),
      m('Group K', '7:00 PM',  'Portugal', 'Uzbekistan'),
      m('Group L', '10:00 PM', 'England',  'Ghana'),
    ]
  },
  {
    date: 'June 24',
    matches: [
      m('Group L', '1:00 AM',  'Panama',              'Croatia'),
      m('Group K', '4:00 AM',  'Colombia',            'DR Congo'),
      m('Group B', '9:00 PM',  'Switzerland',         'Canada'),
      m('Group B', '9:00 PM',  'Bosnia & Herzegovina','Qatar'),
    ]
  },
  {
    date: 'June 25',
    matches: [
      m('Group C', '12:00 AM', 'Morocco',      'Haiti'),
      m('Group C', '12:00 AM', 'Scotland',     'Brazil'),
      m('Group A', '3:00 AM',  'South Africa', 'South Korea'),
      m('Group A', '3:00 AM',  'Czechia',      'Mexico'),
      m('Group E', '10:00 PM', 'Curaçao',      'Ivory Coast'),
      m('Group E', '10:00 PM', 'Ecuador',      'Germany'),
    ]
  },
  {
    date: 'June 26',
    matches: [
      m('Group F', '1:00 AM',  'Tunisia',     'Netherlands'),
      m('Group F', '1:00 AM',  'Japan',       'Sweden'),
      m('Group D', '4:00 AM',  'Turkey',      'USA'),
      m('Group D', '4:00 AM',  'Paraguay',    'Australia'),
      m('Group I', '9:00 PM',  'Norway',      'France'),
      m('Group I', '9:00 PM',  'Senegal',     'Iraq'),
    ]
  },
  {
    date: 'June 27',
    matches: [
      m('Group H', '2:00 AM',  'Cape Verde',  'Saudi Arabia'),
      m('Group H', '2:00 AM',  'Uruguay',     'Spain'),
      m('Group G', '5:00 AM',  'New Zealand', 'Belgium'),
      m('Group G', '5:00 AM',  'Egypt',       'Iran'),
      m('Group L', '11:00 PM', 'Panama',      'England'),
      m('Group L', '11:00 PM', 'Croatia',     'Ghana'),
    ]
  },
  {
    date: 'June 28',
    matches: [
      m('Group K', '1:30 AM',  'Colombia', 'Portugal'),
      m('Group K', '1:30 AM',  'DR Congo', 'Uzbekistan'),
      m('Group J', '4:00 AM',  'Algeria',  'Austria'),
      m('Group J', '4:00 AM',  'Jordan',   'Argentina'),
    ]
  },
]

export const MATCHES: Match[] = DATES.flatMap(d => d.matches)

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

export function isDateComplete(dateGroupIndex: number): boolean {
  const dg = DATES[dateGroupIndex]
  if (!dg) return false
  return dg.matches.every(m => predictions.find(p => p.matchId === m.id)?.submitted ?? false)
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
