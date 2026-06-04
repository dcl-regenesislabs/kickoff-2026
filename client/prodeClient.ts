import { room } from '../schedule/prodeNet'
import {
  Prediction, setPredictionSync, loadPredictions
} from '../schedule/prodeData'

// ── Client networking — sends local saves, rehydrates from server snapshots ───
// `onSnapshot` is called after the cache is refreshed so the 3D panels re-tint.
export function startProdeClient(onSnapshot: () => void) {
  // 1. Each local savePrediction() also tells the server.
  setPredictionSync((p) => {
    room.send('submitPrediction', {
      matchId: p.matchId,
      winner:  p.winner ?? 'draw',
      score1:  p.score1,
      score2:  p.score2
    })
  })

  // 2. Server snapshot → rehydrate the in-memory cache → refresh panels/UI.
  room.onMessage('predictionsSnapshot', (data) => {
    try {
      const arr = JSON.parse(data.json) as Prediction[]
      loadPredictions(arr)
      onSnapshot()
    } catch (e) {
      console.log('[Client] bad snapshot', e)
    }
  })

  room.onMessage('predictionSaved', (data) => {
    if (!data.ok) console.log('[Client] server rejected matchId', data.matchId)
  })

  // 3. Ask for my saved data. Room auto-queues until ready; re-ask on (re)connect.
  room.send('requestPredictions', {})
  room.onReady((ready) => { if (ready) room.send('requestPredictions', {}) })
}
