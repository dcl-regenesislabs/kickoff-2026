// ── Prode configuration — admin gating + scoring rules ────────────────────────
// Pure module (no DCL/ECS imports) so both the client and the authoritative
// server can import it safely.

// Wallet addresses allowed to load official match results.
// 👉 Paste your DCL wallet address here (any case — it's compared lowercased).
export const ADMIN_WALLETS: string[] = [
  '0xc502975b49398f9754AFC4E9693Cf0e1594f3275',
  '0x070f99855D4A4544340Ab461eAE53922AeC14A5d'
]

export function isAdmin(address: string | undefined | null): boolean {
  if (!address) return false
  const a = address.toLowerCase()
  return ADMIN_WALLETS.some(w => w.toLowerCase() === a)
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Correct winner only ............. 3 pts
// Exact score (winner implied) .... 3 + 2 = 5 pts
export const PTS_WINNER = 3
export const PTS_SCORE  = 2

// How many rows the leaderboard returns/shows (the 3D panel renders 10 rows).
export const LEADERBOARD_SIZE = 10
