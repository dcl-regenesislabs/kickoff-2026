import { Storage } from '@dcl/sdk/server'
import { room, STORAGE_KEY } from '../schedule/prodeNet'
import { Prediction, MATCHES, makeDefaultPredictions } from '../schedule/prodeData'

// ── Authoritative server — validates and persists predictions per wallet ──────
// Storage.player keeps data in the remote storage service (survives reconnects
// and server restarts), so no in-RAM state or disconnect teardown is needed.
export function startProdeServer() {
  console.log('[Server] prode authoritative server ready')

  // Client asks for its saved data on connect.
  room.onMessage('requestPredictions', async (_data, ctx) => {
    if (!ctx) return
    const arr = await loadFor(ctx.from)
    room.send('predictionsSnapshot', { json: JSON.stringify(arr) }, { to: [ctx.from] })
  })

  // Client submits one prediction.
  room.onMessage('submitPrediction', async (data, ctx) => {
    if (!ctx) return
    const addr = ctx.from

    if (!isValid(data)) {
      room.send('predictionSaved', { matchId: data.matchId, ok: false }, { to: [addr] })
      return
    }

    try {
      const arr = await loadFor(addr)
      const p = arr.find(x => x.matchId === data.matchId)
      if (p) {
        p.winner    = data.winner as Prediction['winner']
        p.score1    = data.score1
        p.score2    = data.score2
        p.submitted = true
      }
      await Storage.player.set(addr, STORAGE_KEY, arr)
      console.log(`[Server] saved prediction match ${data.matchId} for ${addr}`)

      room.send('predictionSaved', { matchId: data.matchId, ok: true }, { to: [addr] })
      // Re-broadcast the authoritative snapshot so the client stays in sync.
      room.send('predictionsSnapshot', { json: JSON.stringify(arr) }, { to: [addr] })
    } catch (e) {
      console.log('[Server] Storage.set FAILED:', e)
      room.send('predictionSaved', { matchId: data.matchId, ok: false }, { to: [addr] })
    }
  })
}

async function loadFor(addr: string): Promise<Prediction[]> {
  try {
    const saved = await Storage.player.get<Prediction[]>(addr, STORAGE_KEY)
    return saved ?? makeDefaultPredictions()
  } catch (e) {
    console.log('[Server] Storage.get FAILED:', e)
    return makeDefaultPredictions()
  }
}

// Anti-cheat: only legal data may be persisted.
function isValid(data: { matchId: number; winner: string; score1: number; score2: number }): boolean {
  const validMatch  = MATCHES.some(m => m.id === data.matchId)
  const validWinner = data.winner === 'team1' || data.winner === 'draw' || data.winner === 'team2'
  const validScore  =
    Number.isInteger(data.score1) && Number.isInteger(data.score2) &&
    data.score1 >= 0 && data.score1 <= 99 &&
    data.score2 >= 0 && data.score2 <= 99
  return validMatch && validWinner && validScore
}
