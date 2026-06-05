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
  }),

  // Client → Server: announce my display name (for the leaderboard)
  identify: Schemas.Map({
    name: Schemas.String
  }),

  // Admin → Server: upsert one official match result
  submitResult: Schemas.Map({
    matchId: Schemas.Int,
    winner:  Schemas.String,   // 'team1' | 'draw' | 'team2'
    score1:  Schemas.Int,
    score2:  Schemas.Int
  }),
  // Server → Admin: ack of a result save
  resultSaved: Schemas.Map({
    matchId: Schemas.Int,
    ok:      Schemas.Boolean
  }),
  // Client → Server: request all official results (sent on connect)
  requestResults: Schemas.Map({}),
  // Server → Client: full snapshot of official results
  resultsSnapshot: Schemas.Map({
    json: Schemas.String       // JSON.stringify(OfficialResult[])
  }),

  // Client → Server: request the leaderboard
  requestLeaderboard: Schemas.Map({}),
  // Server → Client: leaderboard standings
  leaderboardSnapshot: Schemas.Map({
    json: Schemas.String       // JSON.stringify({name,address,value}[])
  })
}

export const STORAGE_KEY   = 'prode:predictions'   // per-player snapshot
export const RESULTS_KEY   = 'prode:results'        // scene-wide official results
export const PLAYER_PREFIX = 'prode:player:'        // scene mirror per player (for leaderboard)

export const room = registerMessages(ProdeMessages)
