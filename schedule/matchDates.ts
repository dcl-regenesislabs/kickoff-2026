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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function fmtDate(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${MONTHS[(parseInt(mm ?? '1') - 1)]}  ${parseInt(dd ?? '1')}`
}
