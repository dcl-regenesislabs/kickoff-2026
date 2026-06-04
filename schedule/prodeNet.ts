import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// ── Message contract — shared by client and server ────────────────────────────
// Registered once here so both branches use the exact same schema registry.
export const ProdeMessages = {
  // Client → Server: upsert one prediction
  submitPrediction: Schemas.Map({
    matchId: Schemas.Int,
    winner:  Schemas.String,   // 'team1' | 'draw' | 'team2'
    score1:  Schemas.Int,
    score2:  Schemas.Int
  }),
  // Client → Server: request my saved predictions (sent on connect)
  requestPredictions: Schemas.Map({}),
  // Server → Client: full snapshot of a player's predictions
  predictionsSnapshot: Schemas.Map({
    json: Schemas.String       // JSON.stringify(Prediction[])
  }),
  // Server → Client: ack of a single save
  predictionSaved: Schemas.Map({
    matchId: Schemas.Int,
    ok:      Schemas.Boolean
  })
}

export const STORAGE_KEY = 'prode:predictions'

export const room = registerMessages(ProdeMessages)
