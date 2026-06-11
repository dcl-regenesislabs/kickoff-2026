import { engine, Entity, Transform, MeshRenderer, Material, TextShape } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { createLeaderboardPanel, LeaderboardPanelEntry } from '../src/LeaderboardPanel'
import { getLeaderboard, refreshLeaderboard } from './prodeClient'
import { EntityNames } from '../assets/scene/entity-names'
import { createMatchSlide, updateMatchSlide, MatchSlideEntities } from './matchSlide'

const UPDATE_INTERVAL = 1.0
const REQUEST_INTERVAL = 10.0
const LEADERBOARD_PLANES = [EntityNames.leaderboard, EntityNames.leaderboard_2] as const

const TRANSITION_DURATION = 0.35
const LEADERBOARD_SHOW_DURATION = 12
const IMAGE_SHOW_DURATION = 8
const PAGE_DURATION = 6   // seconds per match page
const CHAR_DELAY = 0.04

type TVSlide = 'leaderboard' | 'match' | 'image'
type TVPhase = 'showing' | 'out' | 'in'

function nextSlide(s: TVSlide): TVSlide {
  if (s === 'leaderboard') return 'match'
  if (s === 'match') return 'image'
  return 'leaderboard'
}

function slideDuration(s: TVSlide): number {
  if (s === 'leaderboard') return LEADERBOARD_SHOW_DURATION
  return IMAGE_SHOW_DURATION
}

type TVPanel = {
  panel: ReturnType<typeof createLeaderboardPanel>
  imageEntity: Entity
  imageScale: Vector3
  matchSlide: MatchSlideEntities
  slide: TVSlide
  phase: TVPhase
  slideTimer: number
  transitionTimer: number
  pendingData: LeaderboardPanelEntry[] | null
  twActive: boolean
  twRow: number
  twChar: number
  twTimer: number
  twData: LeaderboardPanelEntry[]
}

function formatLeaderboardName(name: string, address: string): string {
  const cleanName = (name || 'player').trim() || 'player'
  const visibleName = cleanName.length > 12 ? cleanName.slice(0, 10) + '..' : cleanName
  const suffix = (address || '').slice(-4) || '----'
  return `${visibleName}#${suffix}`
}

function getSceneLeaderboardTransform(entityName: EntityNames) {
  const scenePlane = engine.getEntityOrNullByName<EntityNames>(entityName)
  if (!scenePlane) return null
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

function getSceneLeaderboardTransforms(fallback?: { position: Vector3; rotation?: Quaternion; size?: Vector3 }) {
  const transforms = LEADERBOARD_PLANES
    .map((entityName) => getSceneLeaderboardTransform(entityName))
    .filter((value): value is NonNullable<ReturnType<typeof getSceneLeaderboardTransform>> => value !== null)
  if (transforms.length > 0) return transforms
  return [{
    position: fallback?.position ?? Vector3.create(32, 6, 62),
    rotation: fallback?.rotation ?? Quaternion.fromEulerDegrees(0, 180, 0),
    size: fallback?.size ?? Vector3.create(5, 7, 1)
  }]
}

function createImageSlide(parent: Entity, size: Vector3): { entity: Entity; scale: Vector3 } {
  const scale = Vector3.create(size.x * 0.96, size.y * 0.9, 1)
  const entity = engine.addEntity()
  Transform.createOrReplace(entity, {
    parent,
    position: Vector3.create(0, 0, -0.025),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()  // hidden by default
  })
  MeshRenderer.setPlane(entity)
  Material.setPbrMaterial(entity, {
    texture: Material.Texture.Common({ src: 'images/scene-thumbnail.png' }),
    emissiveTexture: Material.Texture.Common({ src: 'images/scene-thumbnail.png' }),
    emissiveIntensity: 1.0,
    roughness: 1.0,
    metallic: 0.0
  })
  return { entity, scale }
}

function startTypewriter(tv: TVPanel) {
  const rowCount = tv.panel.rowNames.length
  for (let i = 0; i < rowCount; i++) {
    TextShape.getMutable(tv.panel.rowNames[i]).text = ''
    TextShape.getMutable(tv.panel.rowValues[i]).text = ''
  }
  tv.twRow = 0
  tv.twChar = 0
  tv.twTimer = 0
  tv.twActive = tv.twData.length > 0
}

function tickTypewriter(tv: TVPanel, dt: number) {
  if (!tv.twActive) return
  tv.twTimer += dt
  if (tv.twTimer < CHAR_DELAY) return
  tv.twTimer -= CHAR_DELAY

  const rowCount = tv.panel.rowNames.length
  while (tv.twRow < rowCount) {
    const entry = tv.twData[tv.twRow]
    if (!entry) {
      tv.twRow++
      tv.twChar = 0
      continue
    }
    const fullText = `${tv.twRow + 1}. ${entry.name}`
    tv.twChar++
    TextShape.getMutable(tv.panel.rowNames[tv.twRow]).text = fullText.slice(0, tv.twChar)
    if (tv.twChar >= fullText.length) {
      TextShape.getMutable(tv.panel.rowValues[tv.twRow]).text = entry.value
      tv.twRow++
      tv.twChar = 0
    }
    return
  }
  tv.twActive = false
}

export function initProdeLeaderboard(transform?: {
  position: Vector3
  rotation?: Quaternion
  size?: Vector3
}) {
  const tvPanels: TVPanel[] = getSceneLeaderboardTransforms(transform).map((sceneTransform) => {
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

    const { entity: imageEntity, scale: imageScale } = createImageSlide(panel.root, sceneTransform.size)
    const matchSlide = createMatchSlide(panel.root, sceneTransform.size)

    return {
      panel,
      imageEntity,
      imageScale,
      matchSlide,
      slide: 'leaderboard' as TVSlide,
      phase: 'showing' as TVPhase,
      slideTimer: 0,
      transitionTimer: 0,
      pendingData: null,
      twActive: false,
      twRow: 0,
      twChar: 0,
      twTimer: 0,
      twData: []
    }
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
    if (acc >= UPDATE_INTERVAL) {
      acc = 0
      const rows: LeaderboardPanelEntry[] = getLeaderboard().slice(0, 10).map((r) => ({
        name: formatLeaderboardName(r.name, r.address),
        value: String(r.value)
      }))
      const key = rows.map((r) => `${r.name}:${r.value}`).join('|')
      if (key !== lastKey) {
        lastKey = key
        for (const tv of tvPanels) {
          tv.pendingData = rows
        }
      }
    }

    for (const tv of tvPanels) {
      tickTypewriter(tv, dt)

      if (tv.phase === 'showing') {
        if (tv.slide === 'match') {
          // Page cycling — each page stays for PAGE_DURATION, no TV pinch between pages
          tv.matchSlide.pageTimer += dt
          if (tv.matchSlide.pageTimer >= PAGE_DURATION) {
            tv.matchSlide.pageTimer = 0
            tv.matchSlide.currentPage++
            if (tv.matchSlide.currentPage >= tv.matchSlide.totalPages) {
              tv.phase = 'out'
              tv.transitionTimer = 0
            } else {
              updateMatchSlide(tv.matchSlide)
            }
          }
        } else {
          tv.slideTimer += dt
          if (tv.slideTimer >= slideDuration(tv.slide)) {
            tv.phase = 'out'
            tv.transitionTimer = 0
          } else if (tv.slide === 'leaderboard' && !tv.twActive && tv.pendingData !== null) {
            tv.twData = tv.pendingData
            tv.pendingData = null
            startTypewriter(tv)
          }
        }
      } else if (tv.phase === 'out') {
        tv.transitionTimer += dt
        const t = Math.min(tv.transitionTimer / TRANSITION_DURATION, 1)
        Transform.getMutable(tv.panel.root).scale = Vector3.create(1 - t * t, 1, 1)

        if (t >= 1) {
          const next = nextSlide(tv.slide)

          // hide current
          if (tv.slide === 'image') Transform.getMutable(tv.imageEntity).scale = Vector3.Zero()
          if (tv.slide === 'match') Transform.getMutable(tv.matchSlide.root).scale = Vector3.Zero()

          // show next — toggle contentRoot so leaderboard TextShapes don't bleed through
          if (next === 'image') {
            Transform.getMutable(tv.panel.contentRoot).scale = Vector3.Zero()
            Transform.getMutable(tv.imageEntity).scale = tv.imageScale
          } else if (next === 'match') {
            Transform.getMutable(tv.panel.contentRoot).scale = Vector3.Zero()
            Transform.getMutable(tv.matchSlide.root).scale = Vector3.One()
            tv.matchSlide.currentPage = 0
            tv.matchSlide.pageTimer = 0
            updateMatchSlide(tv.matchSlide)
          } else {
            Transform.getMutable(tv.panel.contentRoot).scale = Vector3.One()
            if (tv.pendingData !== null) {
              tv.twData = tv.pendingData
              tv.pendingData = null
            }
            startTypewriter(tv)
          }

          tv.slide = next
          tv.phase = 'in'
          tv.transitionTimer = 0
        }
      } else if (tv.phase === 'in') {
        tv.transitionTimer += dt
        const t = Math.min(tv.transitionTimer / TRANSITION_DURATION, 1)
        // ease-out: decelerate into full width
        const eased = 1 - (1 - t) * (1 - t)
        Transform.getMutable(tv.panel.root).scale = Vector3.create(eased, 1, 1)

        if (t >= 1) {
          Transform.getMutable(tv.panel.root).scale = Vector3.One()
          tv.phase = 'showing'
          tv.slideTimer = 0
        }
      }
    }
  })
}
