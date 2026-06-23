const RAW: { group: string; date: string; home: string; away: string }[] = [
  { group: 'A', date: '2026-06-11', home: 'Mexico',                  away: 'South Africa' },
  { group: 'A', date: '2026-06-11', home: 'South Korea',             away: 'Czechia' },
  { group: 'B', date: '2026-06-12', home: 'Canada',                  away: 'Bosnia and Herzegovina' },
  { group: 'D', date: '2026-06-12', home: 'United States',           away: 'Paraguay' },
  { group: 'B', date: '2026-06-13', home: 'Qatar',                   away: 'Switzerland' },
  { group: 'C', date: '2026-06-13', home: 'Brazil',                  away: 'Morocco' },
  { group: 'C', date: '2026-06-13', home: 'Haiti',                   away: 'Scotland' },
  { group: 'D', date: '2026-06-13', home: 'Australia',               away: 'Türkiye' },
  { group: 'E', date: '2026-06-14', home: 'Germany',                 away: 'Curaçao' },
  { group: 'F', date: '2026-06-14', home: 'Netherlands',             away: 'Japan' },
  { group: 'E', date: '2026-06-14', home: 'Ivory Coast',             away: 'Ecuador' },
  { group: 'F', date: '2026-06-14', home: 'Sweden',                  away: 'Tunisia' },
  { group: 'H', date: '2026-06-15', home: 'Spain',                   away: 'Cape Verde' },
  { group: 'G', date: '2026-06-15', home: 'Belgium',                 away: 'Egypt' },
  { group: 'H', date: '2026-06-15', home: 'Saudi Arabia',            away: 'Uruguay' },
  { group: 'G', date: '2026-06-15', home: 'Iran',                    away: 'New Zealand' },
  { group: 'I', date: '2026-06-16', home: 'France',                  away: 'Senegal' },
  { group: 'I', date: '2026-06-16', home: 'Iraq',                    away: 'Norway' },
  { group: 'J', date: '2026-06-16', home: 'Argentina',               away: 'Algeria' },
  { group: 'J', date: '2026-06-16', home: 'Austria',                 away: 'Jordan' },
  { group: 'K', date: '2026-06-17', home: 'Portugal',                away: 'DR Congo' },
  { group: 'L', date: '2026-06-17', home: 'England',                 away: 'Croatia' },
  { group: 'L', date: '2026-06-17', home: 'Ghana',                   away: 'Panama' },
  { group: 'K', date: '2026-06-17', home: 'Uzbekistan',              away: 'Colombia' },
  { group: 'A', date: '2026-06-18', home: 'Czechia',                 away: 'South Africa' },
  { group: 'B', date: '2026-06-18', home: 'Switzerland',             away: 'Bosnia and Herzegovina' },
  { group: 'B', date: '2026-06-18', home: 'Canada',                  away: 'Qatar' },
  { group: 'A', date: '2026-06-18', home: 'Mexico',                  away: 'South Korea' },
  { group: 'D', date: '2026-06-19', home: 'United States',           away: 'Australia' },
  { group: 'C', date: '2026-06-19', home: 'Scotland',                away: 'Morocco' },
  { group: 'C', date: '2026-06-19', home: 'Brazil',                  away: 'Haiti' },
  { group: 'D', date: '2026-06-19', home: 'Türkiye',                 away: 'Paraguay' },
  { group: 'F', date: '2026-06-20', home: 'Netherlands',             away: 'Sweden' },
  { group: 'E', date: '2026-06-20', home: 'Germany',                 away: 'Ivory Coast' },
  { group: 'E', date: '2026-06-20', home: 'Ecuador',                 away: 'Curaçao' },
  { group: 'F', date: '2026-06-20', home: 'Tunisia',                 away: 'Japan' },
  { group: 'H', date: '2026-06-21', home: 'Spain',                   away: 'Saudi Arabia' },
  { group: 'G', date: '2026-06-21', home: 'Belgium',                 away: 'Iran' },
  { group: 'H', date: '2026-06-21', home: 'Uruguay',                 away: 'Cape Verde' },
  { group: 'G', date: '2026-06-21', home: 'New Zealand',             away: 'Egypt' },
  { group: 'J', date: '2026-06-22', home: 'Argentina',               away: 'Austria' },
  { group: 'I', date: '2026-06-22', home: 'France',                  away: 'Iraq' },
  { group: 'I', date: '2026-06-22', home: 'Norway',                  away: 'Senegal' },
  { group: 'J', date: '2026-06-22', home: 'Jordan',                  away: 'Algeria' },
  { group: 'K', date: '2026-06-23', home: 'Portugal',                away: 'Uzbekistan' },
  { group: 'L', date: '2026-06-23', home: 'England',                 away: 'Ghana' },
  { group: 'L', date: '2026-06-23', home: 'Panama',                  away: 'Croatia' },
  { group: 'K', date: '2026-06-23', home: 'Colombia',                away: 'DR Congo' },
  { group: 'B', date: '2026-06-24', home: 'Switzerland',             away: 'Canada' },
  { group: 'B', date: '2026-06-24', home: 'Bosnia and Herzegovina',  away: 'Qatar' },
  { group: 'C', date: '2026-06-24', home: 'Scotland',                away: 'Brazil' },
  { group: 'C', date: '2026-06-24', home: 'Morocco',                 away: 'Haiti' },
  { group: 'A', date: '2026-06-24', home: 'Czechia',                 away: 'Mexico' },
  { group: 'A', date: '2026-06-24', home: 'South Africa',            away: 'South Korea' },
  { group: 'E', date: '2026-06-25', home: 'Ecuador',                 away: 'Germany' },
  { group: 'E', date: '2026-06-25', home: 'Curaçao',                 away: 'Ivory Coast' },
  { group: 'F', date: '2026-06-25', home: 'Japan',                   away: 'Sweden' },
  { group: 'F', date: '2026-06-25', home: 'Tunisia',                 away: 'Netherlands' },
  { group: 'D', date: '2026-06-25', home: 'Türkiye',                 away: 'United States' },
  { group: 'D', date: '2026-06-25', home: 'Paraguay',                away: 'Australia' },
  { group: 'I', date: '2026-06-26', home: 'Norway',                  away: 'France' },
  { group: 'I', date: '2026-06-26', home: 'Senegal',                 away: 'Iraq' },
  { group: 'H', date: '2026-06-26', home: 'Cape Verde',              away: 'Saudi Arabia' },
  { group: 'H', date: '2026-06-26', home: 'Uruguay',                 away: 'Spain' },
  { group: 'G', date: '2026-06-26', home: 'Egypt',                   away: 'Iran' },
  { group: 'G', date: '2026-06-26', home: 'New Zealand',             away: 'Belgium' },
  { group: 'L', date: '2026-06-27', home: 'Panama',                  away: 'England' },
  { group: 'L', date: '2026-06-27', home: 'Croatia',                 away: 'Ghana' },
  { group: 'K', date: '2026-06-27', home: 'Colombia',                away: 'Portugal' },
  { group: 'K', date: '2026-06-27', home: 'DR Congo',                away: 'Uzbekistan' },
  { group: 'J', date: '2026-06-27', home: 'Algeria',                 away: 'Austria' },
  { group: 'J', date: '2026-06-27', home: 'Jordan',                  away: 'Argentina' },
]

// prodeData team names differ from schedule names in a few cases
const ALIAS: Record<string, string> = {
  'USA':                    'United States',
  'Turkey':                 'Türkiye',
  'Bosnia & Herzegovina':   'Bosnia and Herzegovina',
}
function norm(t: string): string { return ALIAS[t] ?? t }

// Build a lookup keyed "team1|team2" (both orderings)
const DATE_MAP = new Map<string, string>()
for (const r of RAW) {
  DATE_MAP.set(`${r.home}|${r.away}`, r.date)
  DATE_MAP.set(`${r.away}|${r.home}`, r.date)
}

export function getMatchDate(team1: string, team2: string): string {
  return DATE_MAP.get(`${norm(team1)}|${norm(team2)}`) ?? ''
}

// ── Kickoff lock ───────────────────────────────────────────────────────────────
// Voting closes LOCK_LEAD_MS before kickoff. Times are UTC ("YYYY-MM-DDTHH:MM",
// ':00Z" appended on parse), keyed by team pair (both orderings). The final-round
// simultaneous pairs share their group-mate's kickoff.
export const LOCK_LEAD_MS = 1 * 60 * 1000   // 1 minute

const KICKOFFS: { h: string; a: string; utc: string }[] = [
  { h: 'Mexico',                 a: 'South Africa',           utc: '2026-06-11T19:00' },
  { h: 'South Korea',            a: 'Czechia',                utc: '2026-06-12T02:00' },
  { h: 'Canada',                 a: 'Bosnia and Herzegovina', utc: '2026-06-12T19:00' },
  { h: 'United States',          a: 'Paraguay',               utc: '2026-06-13T01:00' },
  { h: 'Qatar',                  a: 'Switzerland',            utc: '2026-06-13T19:00' },
  { h: 'Brazil',                 a: 'Morocco',                utc: '2026-06-13T22:00' },
  { h: 'Haiti',                  a: 'Scotland',               utc: '2026-06-14T01:00' },
  { h: 'Australia',              a: 'Türkiye',                utc: '2026-06-14T04:00' },
  { h: 'Germany',                a: 'Curaçao',                utc: '2026-06-14T17:00' },
  { h: 'Netherlands',            a: 'Japan',                  utc: '2026-06-14T20:00' },
  { h: 'Ivory Coast',            a: 'Ecuador',                utc: '2026-06-14T23:00' },
  { h: 'Sweden',                 a: 'Tunisia',                utc: '2026-06-15T02:00' },
  { h: 'Spain',                  a: 'Cape Verde',             utc: '2026-06-15T16:00' },
  { h: 'Belgium',                a: 'Egypt',                  utc: '2026-06-15T19:00' },
  { h: 'Saudi Arabia',           a: 'Uruguay',                utc: '2026-06-15T22:00' },
  { h: 'Iran',                   a: 'New Zealand',            utc: '2026-06-16T01:00' },
  { h: 'France',                 a: 'Senegal',                utc: '2026-06-16T19:00' },
  { h: 'Iraq',                   a: 'Norway',                 utc: '2026-06-16T22:00' },
  { h: 'Argentina',              a: 'Algeria',                utc: '2026-06-17T01:00' },
  { h: 'Austria',                a: 'Jordan',                 utc: '2026-06-17T04:00' },
  { h: 'Portugal',               a: 'DR Congo',               utc: '2026-06-17T17:00' },
  { h: 'England',                a: 'Croatia',                utc: '2026-06-17T20:00' },
  { h: 'Ghana',                  a: 'Panama',                 utc: '2026-06-17T23:00' },
  { h: 'Uzbekistan',             a: 'Colombia',               utc: '2026-06-18T02:00' },
  { h: 'Czechia',                a: 'South Africa',           utc: '2026-06-18T16:00' },
  { h: 'Switzerland',            a: 'Bosnia and Herzegovina', utc: '2026-06-18T19:00' },
  { h: 'Canada',                 a: 'Qatar',                  utc: '2026-06-18T22:00' },
  { h: 'Mexico',                 a: 'South Korea',            utc: '2026-06-19T01:00' },
  { h: 'United States',          a: 'Australia',              utc: '2026-06-19T19:00' },
  { h: 'Scotland',               a: 'Morocco',                utc: '2026-06-19T22:00' },
  { h: 'Brazil',                 a: 'Haiti',                  utc: '2026-06-20T00:30' },
  { h: 'Türkiye',                a: 'Paraguay',               utc: '2026-06-20T03:00' },
  { h: 'Netherlands',            a: 'Sweden',                 utc: '2026-06-20T17:00' },
  { h: 'Germany',                a: 'Ivory Coast',            utc: '2026-06-20T20:00' },
  { h: 'Ecuador',                a: 'Curaçao',                utc: '2026-06-21T00:00' },
  { h: 'Tunisia',                a: 'Japan',                  utc: '2026-06-21T04:00' },
  { h: 'Spain',                  a: 'Saudi Arabia',           utc: '2026-06-21T16:00' },
  { h: 'Belgium',                a: 'Iran',                   utc: '2026-06-21T19:00' },
  { h: 'Uruguay',                a: 'Cape Verde',             utc: '2026-06-21T22:00' },
  { h: 'New Zealand',            a: 'Egypt',                  utc: '2026-06-22T01:00' },
  { h: 'Argentina',              a: 'Austria',                utc: '2026-06-22T17:00' },
  { h: 'France',                 a: 'Iraq',                   utc: '2026-06-22T21:00' },
  { h: 'Norway',                 a: 'Senegal',                utc: '2026-06-23T00:00' },
  { h: 'Jordan',                 a: 'Algeria',                utc: '2026-06-23T03:00' },
  { h: 'Portugal',               a: 'Uzbekistan',             utc: '2026-06-23T17:00' },
  { h: 'England',                a: 'Ghana',                  utc: '2026-06-23T20:00' },
  { h: 'Panama',                 a: 'Croatia',                utc: '2026-06-23T23:00' },
  { h: 'Colombia',               a: 'DR Congo',               utc: '2026-06-24T02:00' },
  { h: 'Switzerland',            a: 'Canada',                 utc: '2026-06-24T19:00' },
  { h: 'Bosnia and Herzegovina', a: 'Qatar',                  utc: '2026-06-24T19:00' },
  { h: 'Scotland',               a: 'Brazil',                 utc: '2026-06-24T22:00' },
  { h: 'Morocco',                a: 'Haiti',                  utc: '2026-06-24T22:00' },
  { h: 'Czechia',                a: 'Mexico',                 utc: '2026-06-25T01:00' },
  { h: 'South Africa',           a: 'South Korea',            utc: '2026-06-25T01:00' },
  { h: 'Ecuador',                a: 'Germany',                utc: '2026-06-25T20:00' },
  { h: 'Curaçao',                a: 'Ivory Coast',            utc: '2026-06-25T20:00' },
  { h: 'Japan',                  a: 'Sweden',                 utc: '2026-06-25T23:00' },
  { h: 'Tunisia',                a: 'Netherlands',            utc: '2026-06-25T23:00' },
  { h: 'Türkiye',                a: 'United States',          utc: '2026-06-26T02:00' },
  { h: 'Paraguay',               a: 'Australia',              utc: '2026-06-26T02:00' },
  { h: 'Norway',                 a: 'France',                 utc: '2026-06-26T19:00' },
  { h: 'Senegal',                a: 'Iraq',                   utc: '2026-06-26T19:00' },
  { h: 'Cape Verde',             a: 'Saudi Arabia',           utc: '2026-06-27T00:00' },
  { h: 'Uruguay',                a: 'Spain',                  utc: '2026-06-27T00:00' },
  { h: 'Egypt',                  a: 'Iran',                   utc: '2026-06-27T03:00' },
  { h: 'New Zealand',            a: 'Belgium',                utc: '2026-06-27T03:00' },
  { h: 'Panama',                 a: 'England',                utc: '2026-06-27T21:00' },
  { h: 'Croatia',                a: 'Ghana',                  utc: '2026-06-27T21:00' },
  { h: 'Colombia',               a: 'Portugal',               utc: '2026-06-27T23:30' },
  { h: 'DR Congo',               a: 'Uzbekistan',             utc: '2026-06-27T23:30' },
  { h: 'Algeria',                a: 'Austria',                utc: '2026-06-28T02:00' },
  { h: 'Jordan',                 a: 'Argentina',              utc: '2026-06-28T02:00' },
]

const KICKOFF_MAP = new Map<string, number>()
for (const k of KICKOFFS) {
  const ts = Date.parse(`${k.utc}:00Z`)
  if (isNaN(ts)) continue
  KICKOFF_MAP.set(`${k.h}|${k.a}`, ts)
  KICKOFF_MAP.set(`${k.a}|${k.h}`, ts)
}

// Kickoff epoch (ms) for a match, or null if unknown.
export function getKickoff(team1: string, team2: string): number | null {
  return KICKOFF_MAP.get(`${norm(team1)}|${norm(team2)}`) ?? null
}

// True once we're within LOCK_LEAD_MS of kickoff (or past it). Unknown → false.
export function isMatchLocked(team1: string, team2: string): boolean {
  const k = getKickoff(team1, team2)
  return k !== null && Date.now() >= k - LOCK_LEAD_MS
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function fmtDate(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${MONTHS[(parseInt(mm ?? '1') - 1)]}  ${parseInt(dd ?? '1')}`
}
