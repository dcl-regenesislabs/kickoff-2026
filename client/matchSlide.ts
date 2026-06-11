import { engine, Entity, Transform, MeshRenderer, Material, TextShape, TextAlignMode } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { MATCHES, abbr, officialResults } from '../schedule/prodeData'
import { getMatchDate, getKickoff } from '../schedule/matchDates'

export const MATCHES_PER_PAGE = 2

function fmtKickoff(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')} UTC`
}

export function getTodayMatches() {
  const today = new Date().toISOString().split('T')[0]
  return MATCHES.filter(m => getMatchDate(m.team1, m.team2) === today)
}

type MatchRow = {
  rowRoot: Entity
  flag1: Entity
  team1: Entity
  center: Entity
  team2: Entity
  flag2: Entity
  flagScale: Vector3
}

export type MatchSlideEntities = {
  root: Entity
  rows: MatchRow[]
  contentTop: number
  contentH: number
  pageIndicator: Entity
  currentPage: number
  totalPages: number
  pageTimer: number
}

function addPlane(parent: Entity, pos: Vector3, scale: Vector3, color: Color4): Entity {
  const e = engine.addEntity()
  Transform.createOrReplace(e, { parent, position: pos, rotation: Quaternion.Identity(), scale })
  MeshRenderer.setPlane(e)
  Material.setBasicMaterial(e, { diffuseColor: color })
  return e
}

export function createMatchSlide(parent: Entity, size: Vector3): MatchSlideEntities {
  const panelW = size.x * 0.96
  const panelH = size.y * 0.9

  const root = engine.addEntity()
  Transform.createOrReplace(root, {
    parent,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })

  addPlane(root, Vector3.create(0, 0, -0.026), Vector3.create(panelW, panelH, 1),
    Color4.fromHexString('#120022ee'))

  const titleEnt = engine.addEntity()
  Transform.createOrReplace(titleEnt, {
    parent: root,
    position: Vector3.create(0, panelH / 2 - 0.58, -0.04),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  TextShape.createOrReplace(titleEnt, {
    text: "TODAY'S MATCHES",
    fontSize: Math.max(1.7, size.y * 0.26) * 5,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  const contentTop = panelH / 2 - 1.5
  const contentBottom = -panelH / 2 + 0.6
  const contentH = contentTop - contentBottom

  const flagW = panelW * 0.22
  const flagH = flagW * 0.65
  const flagScale = Vector3.create(flagW, flagH, 1)
  const rowFont = Math.max(1.2, size.y * 0.2) * 5

  const rows: MatchRow[] = []

  for (let i = 0; i < MATCHES_PER_PAGE; i++) {
    const rowRoot = engine.addEntity()
    Transform.createOrReplace(rowRoot, {
      parent: root,
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      scale: Vector3.Zero()
    })

    const flag1 = engine.addEntity()
    Transform.createOrReplace(flag1, {
      parent: rowRoot,
      position: Vector3.create(-panelW * 0.38, 0, -0.04),
      rotation: Quaternion.Identity(),
      scale: flagScale
    })
    MeshRenderer.setPlane(flag1)

    const team1 = engine.addEntity()
    Transform.createOrReplace(team1, {
      parent: rowRoot,
      position: Vector3.create(-panelW * 0.15, 0, -0.04),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(team1, {
      text: '',
      fontSize: rowFont,
      textColor: Color4.White(),
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

    const center = engine.addEntity()
    Transform.createOrReplace(center, {
      parent: rowRoot,
      position: Vector3.create(0, 0, -0.04),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(center, {
      text: '',
      fontSize: rowFont,
      textColor: Color4.fromHexString('#ffcf73ff'),
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

    const team2 = engine.addEntity()
    Transform.createOrReplace(team2, {
      parent: rowRoot,
      position: Vector3.create(panelW * 0.15, 0, -0.04),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(team2, {
      text: '',
      fontSize: rowFont,
      textColor: Color4.White(),
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

    const flag2 = engine.addEntity()
    Transform.createOrReplace(flag2, {
      parent: rowRoot,
      position: Vector3.create(panelW * 0.38, 0, -0.04),
      rotation: Quaternion.Identity(),
      scale: flagScale
    })
    MeshRenderer.setPlane(flag2)

    rows.push({ rowRoot, flag1, team1, center, team2, flag2, flagScale })
  }

  const pageIndicator = engine.addEntity()
  Transform.createOrReplace(pageIndicator, {
    parent: root,
    position: Vector3.create(0, contentBottom + 0.3, -0.04),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  TextShape.createOrReplace(pageIndicator, {
    text: '',
    fontSize: Math.max(0.8, size.y * 0.11) * 5,
    textColor: Color4.fromHexString('#a237ffff'),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  return { root, rows, contentTop, contentH, pageIndicator, currentPage: 0, totalPages: 1, pageTimer: 0 }
}

export function updateMatchSlide(entities: MatchSlideEntities) {
  const { rows, contentTop, contentH, pageIndicator } = entities
  const allMatches = getTodayMatches()

  entities.totalPages = Math.max(1, Math.ceil(allMatches.length / MATCHES_PER_PAGE))

  const start = entities.currentPage * MATCHES_PER_PAGE
  const matches = allMatches.slice(start, start + MATCHES_PER_PAGE)

  TextShape.getMutable(pageIndicator).text =
    entities.totalPages > 1 ? `${entities.currentPage + 1}/${entities.totalPages}` : ''

  if (allMatches.length === 0) {
    const row = rows[0]
    Transform.getMutable(row.rowRoot).position = Vector3.create(0, contentTop - contentH / 2, 0)
    Transform.getMutable(row.rowRoot).scale = Vector3.One()
    Transform.getMutable(row.flag1).scale = Vector3.Zero()
    Transform.getMutable(row.flag2).scale = Vector3.Zero()
    TextShape.getMutable(row.team1).text = ''
    TextShape.getMutable(row.center).text = 'NO MATCHES TODAY'
    TextShape.getMutable(row.team2).text = ''
    Transform.getMutable(rows[1].rowRoot).scale = Vector3.Zero()
    return
  }

  const spacing = contentH / (MATCHES_PER_PAGE + 1)

  for (let i = 0; i < MATCHES_PER_PAGE; i++) {
    const row = rows[i]
    const match = matches[i]

    if (!match) {
      Transform.getMutable(row.rowRoot).scale = Vector3.Zero()
      continue
    }

    Transform.getMutable(row.rowRoot).position = Vector3.create(0, contentTop - spacing * (i + 1), 0)
    Transform.getMutable(row.rowRoot).scale = Vector3.One()

    Transform.getMutable(row.flag1).scale = row.flagScale
    MeshRenderer.setPlane(row.flag1, match.flag1.uvs)
    Material.setPbrMaterial(row.flag1, {
      texture: Material.Texture.Common({ src: match.flag1.src }),
      emissiveTexture: Material.Texture.Common({ src: match.flag1.src }),
      emissiveIntensity: 1.0,
      roughness: 1.0, metallic: 0.0
    })

    Transform.getMutable(row.flag2).scale = row.flagScale
    MeshRenderer.setPlane(row.flag2, match.flag2.uvs)
    Material.setPbrMaterial(row.flag2, {
      texture: Material.Texture.Common({ src: match.flag2.src }),
      emissiveTexture: Material.Texture.Common({ src: match.flag2.src }),
      emissiveIntensity: 1.0,
      roughness: 1.0, metallic: 0.0
    })

    TextShape.getMutable(row.team1).text = abbr(match.team1)
    TextShape.getMutable(row.team2).text = abbr(match.team2)

    const result = officialResults.get(match.id)
    if (result) {
      TextShape.getMutable(row.center).text = `${result.score1} - ${result.score2}`
    } else {
      const kickoff = getKickoff(match.team1, match.team2)
      TextShape.getMutable(row.center).text = kickoff !== null ? fmtKickoff(kickoff) : 'TBD'
    }
  }
}
