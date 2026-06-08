import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  createLeaderboardPanel, setTabData, LeaderboardPanelEntry
} from '../src/LeaderboardPanel'
import { getLeaderboard, refreshLeaderboard } from './prodeClient'
import { EntityNames } from '../assets/scene/entity-names'

const UPDATE_INTERVAL = 1.0
const REQUEST_INTERVAL = 10.0

function formatLeaderboardName(name: string, address: string): string {
  const cleanName = (name || 'player').trim() || 'player'
  const visibleName = cleanName.length > 12 ? cleanName.slice(0, 10) + '..' : cleanName
  const suffix = (address || '').slice(-4) || '----'
  return `${visibleName}#${suffix}`
}

function getSceneLeaderboardTransform(fallback?: {
  position: Vector3
  rotation?: Quaternion
  size?: Vector3
}) {
  const scenePlane = engine.getEntityOrNullByName<EntityNames>(EntityNames.leaderboard)
  if (!scenePlane) {
    return {
      position: fallback?.position ?? Vector3.create(32, 6, 62),
      rotation: fallback?.rotation ?? Quaternion.fromEulerDegrees(0, 180, 0),
      size: fallback?.size ?? Vector3.create(5, 7, 1)
    }
  }

  const transform = Transform.get(scenePlane)
  const frontOffset = Vector3.rotate(Vector3.create(0, 0, -0.06), transform.rotation)

  return {
    position: Vector3.create(
      transform.position.x + frontOffset.x,
      transform.position.y + frontOffset.y,
      transform.position.z + frontOffset.z
    ),
    rotation: transform.rotation,
    size: Vector3.create(transform.scale.x, transform.scale.y, 1)
  }
}

export function initProdeLeaderboard(transform?: {
  position: Vector3
  rotation?: Quaternion
  size?: Vector3
}) {
  const sceneTransform = getSceneLeaderboardTransform(transform)
  const panel = createLeaderboardPanel({
    transform: {
      position: sceneTransform.position,
      rotation: sceneTransform.rotation
    },
    size: sceneTransform.size,
    tabs: ['LEADERBOARD'],
    tabColumnHeaders: ['PTS'],
    tabData: [[]],
    skipBackground: true,
    hideTabNav: true
  })

  let lastKey = ''
  let acc = 0
  let reqAcc = 0

  engine.addSystem((dt: number) => {
    reqAcc += dt
    if (reqAcc >= REQUEST_INTERVAL) {
      reqAcc = 0
      refreshLeaderboard()
    }

    acc += dt
    if (acc < UPDATE_INTERVAL) return
    acc = 0

    const rows: LeaderboardPanelEntry[] = getLeaderboard().slice(0, 10).map((r) => ({
      name: formatLeaderboardName(r.name, r.address),
      value: String(r.value)
    }))
    const key = rows.map((r) => `${r.name}:${r.value}`).join('|')
    if (key === lastKey) return
    lastKey = key
    setTabData(panel, 0, rows)
  })
}
