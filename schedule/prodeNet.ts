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
    ok:      Schemas.Boolean,
    reason:  Schemas.String    // 'locked' | 'error' | ''
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
  // Server → Client: leaderboard standings (value = TOTAL = group + knockout)
  leaderboardSnapshot: Schemas.Map({
    json: Schemas.String       // JSON.stringify({name,address,value}[])
  }),
  // Server → Client: kickoff (group-stage) standings — for the "GROUP STAGE LEADERBOARD" slide
  kickoffLeaderboardSnapshot: Schemas.Map({
    json: Schemas.String
  }),
  // Server → Client: knockout-only standings — for the "KNOCKOUT LEADERBOARD" slide
  knockoutLeaderboardSnapshot: Schemas.Map({
    json: Schemas.String
  }),
  // Server → Client: this player's personal rank in each leaderboard (tiny — 6 ints)
  myRankSnapshot: Schemas.Map({
    kickoffRank:   Schemas.Int,
    kickoffTotal:  Schemas.Int,
    knockoutRank:  Schemas.Int,
    knockoutTotal: Schemas.Int,
    totalRank:     Schemas.Int,
    totalTotal:    Schemas.Int
  }),

  // ── Knockout stage (parallel to the group messages above) ───────────────────
  // Client → Server: upsert one knockout prediction
  submitKoPrediction: Schemas.Map({
    fixtureId: Schemas.Int,
    winner:    Schemas.String,  // 'team1' | 'draw' | 'team2'
    score1:    Schemas.Int,
    score2:    Schemas.Int
  }),
  koPredictionSaved: Schemas.Map({
    fixtureId: Schemas.Int,
    ok:        Schemas.Boolean,
    reason:    Schemas.String    // 'locked' | 'error' | 'unknown' | ''
  }),
  requestKoPredictions: Schemas.Map({}),
  koPredictionsSnapshot: Schemas.Map({
    json: Schemas.String         // JSON.stringify(KoPrediction[])
  }),
  // Server → Client: the known knockout fixtures (teams, round, kickoff) + results
  requestKoFixtures: Schemas.Map({}),
  koFixturesSnapshot: Schemas.Map({
    json: Schemas.String         // JSON.stringify(KoFixture[])
  }),
  koResultsSnapshot: Schemas.Map({
    json: Schemas.String         // JSON.stringify(KoResult[])
  }),

  // ── Ball physics ────────────────────────────────────────────────────────────
  // Server → All clients: ball position + velocity (cuando está libre)
  ballState: Schemas.Map({
    x:  Schemas.Float,
    y:  Schemas.Float,
    z:  Schemas.Float,
    vx: Schemas.Float,
    vy: Schemas.Float,
    vz: Schemas.Float
  }),

  // Server → All clients: quién tiene la pelota ('' = libre)
  ballOwned: Schemas.Map({
    ownerId: Schemas.String
  }),

  // Client → Server: patear con dirección y potencia
  kickBall: Schemas.Map({
    dirX:  Schemas.Float,
    dirZ:  Schemas.Float,
    power: Schemas.Float
  }),

  // Client → Server: pedir snapshot actual de la pelota al conectar
  requestBallState: Schemas.Map({
  }),

  // Server → Kicker: punto de aterrizaje autoritativo post-kick (Point B)
  kickLand: Schemas.Map({
    x: Schemas.Float,
    z: Schemas.Float
  })
}

export const STORAGE_KEY   = 'prode:predictions'   // per-player snapshot
export const RESULTS_KEY   = 'prode:results'        // scene-wide official results
export const PLAYER_PREFIX = 'prode:player:'        // scene mirror per player (for leaderboard)

// ── Knockout stage storage keys (separate namespace — group stage untouched) ────
export const KO_PREDICTIONS_KEY = 'prode:ko:predictions'  // per-player snapshot
export const KO_RESULTS_KEY     = 'prode:ko:results'       // scene-wide official KO results
export const KO_FIXTURES_KEY    = 'prode:ko:fixtures'      // scene-wide KO fixtures (from the API)
export const KO_PLAYER_PREFIX   = 'prode:ko:player:'       // scene mirror per player (KO leaderboard)

export const room = registerMessages(ProdeMessages)
