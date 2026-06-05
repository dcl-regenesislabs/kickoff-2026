import { engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  createLeaderboardPanel, setTabData, LeaderboardPanelEntry
} from '../src/LeaderboardPanel'
import { getLeaderboard, refreshLeaderboard } from './prodeClient'

const UPDATE_INTERVAL = 1.0   // seconds between panel refreshes
const REQUEST_INTERVAL = 10.0 // seconds between leaderboard re-requests

function truncateName(name: string, maxLen = 14): string {
  if (!name) return '---'
  return name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name
}

// Builds the in-world leaderboard panel and keeps it in sync with the server data.
export function initProdeLeaderboard(transform?: {
  position: Vector3; rotation?: Quaternion; size?: Vector3
}) {
  const panel = createLeaderboardPanel({
    transform: {
      position: transform?.position ?? Vector3.create(32, 6, 62),
      rotation: transform?.rotation ?? Quaternion.fromEulerDegrees(0, 180, 0)
    },
    size: transform?.size ?? Vector3.create(5, 7, 1),
    tabs: ['LEADERBOARD'],
    tabColumnHeaders: ['PTS'],
    tabData: [[]],
    hideTabNav: true
  })

  let lastKey = ''
  let acc = 0
  let reqAcc = 0

  engine.addSystem((dt: number) => {
    reqAcc += dt
    if (reqAcc >= REQUEST_INTERVAL) { reqAcc = 0; refreshLeaderboard() }

    acc += dt
    if (acc < UPDATE_INTERVAL) return
    acc = 0

    const rows: LeaderboardPanelEntry[] = getLeaderboard().map(r => ({
      name:  truncateName(r.name),
      value: String(r.value)
    }))
    const key = rows.map(r => `${r.name}:${r.value}`).join('|')
    if (key === lastKey) return
    lastKey = key
    setTabData(panel, 0, rows)
  })
}
