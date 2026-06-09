import {
  engine,
  Entity,
  Transform,
  TransformTypeWithOptionals,
  MeshRenderer,
  Material,
  TextShape,
  TextAlignMode
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

export type LeaderboardPanelEntry = {
  name: string
  value: string
}

export type LeaderboardPanelOptions = {
  parent?: Entity
  transform?: TransformTypeWithOptionals
  size?: Vector3
  tabs?: string[]
  tabColumnHeaders?: string[]
  tabData?: LeaderboardPanelEntry[][]
  skipBackground?: boolean
  hideTabNav?: boolean
}

type PanelState = {
  root: Entity
  rowNames: Entity[]
  rowValues: Entity[]
  currentTab: number
}

const DEFAULT_SIZE = Vector3.create(6, 4, 1)
const DEFAULT_ROWS = 6

function addPanelPlane(parent: Entity, position: Vector3, scale: Vector3, color: Color4) {
  const entity = engine.addEntity()
  Transform.createOrReplace(entity, {
    parent,
    position,
    rotation: Quaternion.Identity(),
    scale
  })
  MeshRenderer.setPlane(entity)
  Material.setBasicMaterial(entity, {
    diffuseColor: color
  })
  return entity
}

export function createLeaderboardPanel(options: LeaderboardPanelOptions = {}) {
  const size = options.size ?? DEFAULT_SIZE
  const title = options.tabs?.[0] ?? 'LEADERBOARD'
  const valueHeader = options.tabColumnHeaders?.[0] ?? 'PTS'

  const root = engine.addEntity()
  if (options.parent) {
    Transform.createOrReplace(root, {
      parent: options.parent,
      position: options.transform?.position ?? Vector3.Zero(),
      rotation: options.transform?.rotation ?? Quaternion.Identity(),
      scale: options.transform?.scale ?? Vector3.One()
    })
  } else {
    Transform.createOrReplace(root, options.transform ?? {})
  }

  const panelW = size.x * 0.96
  const panelH = size.y * 0.9
  const frameOuter = Color4.fromHexString('#a237ffff')
  const frameInner = Color4.fromHexString('#ffb22fff')
  const panelBg = Color4.fromHexString('#120022ee')
  const headerBg = Color4.fromHexString('#371064ff')
  const separator = Color4.fromHexString('#6f28c8ff')

  addPanelPlane(root, Vector3.create(0, 0, 0.01), Vector3.create(panelW, panelH, 1), panelBg)
  addPanelPlane(root, Vector3.create(0, panelH / 2 - 0.58, 0.012), Vector3.create(panelW * 0.9, 0.88, 1), headerBg)

  const borderThickness = 0.08
  const innerBorderInset = 0.16
  addPanelPlane(root, Vector3.create(0, panelH / 2, 0.015), Vector3.create(panelW, borderThickness, 1), frameOuter)
  addPanelPlane(root, Vector3.create(0, -panelH / 2, 0.015), Vector3.create(panelW, borderThickness, 1), frameOuter)
  addPanelPlane(root, Vector3.create(-panelW / 2, 0, 0.015), Vector3.create(borderThickness, panelH, 1), frameOuter)
  addPanelPlane(root, Vector3.create(panelW / 2, 0, 0.015), Vector3.create(borderThickness, panelH, 1), frameOuter)
  addPanelPlane(root, Vector3.create(0, panelH / 2 - innerBorderInset, 0.03), Vector3.create(panelW - innerBorderInset * 2, borderThickness, 1), frameInner)
  addPanelPlane(root, Vector3.create(0, -panelH / 2 + innerBorderInset, 0.03), Vector3.create(panelW - innerBorderInset * 2, borderThickness, 1), frameInner)
  addPanelPlane(root, Vector3.create(-panelW / 2 + innerBorderInset, 0, 0.03), Vector3.create(borderThickness, panelH - innerBorderInset * 2, 1), frameInner)
  addPanelPlane(root, Vector3.create(panelW / 2 - innerBorderInset, 0, 0.03), Vector3.create(borderThickness, panelH - innerBorderInset * 2, 1), frameInner)

  const titleFont = Math.max(1.7, size.y * 0.26) * 5
  const headerFont = Math.max(1.0, size.y * 0.15) * 5
  const rowFont = Math.max(1.0, size.y * 0.165) * 5
  const leftX = -panelW / 2 + 0.9
  const rightX = panelW / 2 - 0.8

  const titleEntity = engine.addEntity()
  Transform.createOrReplace(titleEntity, {
    parent: root,
    position: Vector3.create(0, panelH / 2 - 0.58, -0.02),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  TextShape.createOrReplace(titleEntity, {
    text: title,
    fontSize: titleFont,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  const headerName = engine.addEntity()
  Transform.createOrReplace(headerName, {
    parent: root,
    position: Vector3.create(leftX, panelH / 2 - 1.52, -0.02),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  TextShape.createOrReplace(headerName, {
    text: 'PLAYER',
    fontSize: headerFont,
    textColor: Color4.fromHexString('#ffcf73ff'),
    textAlign: TextAlignMode.TAM_MIDDLE_LEFT
  })

  const headerValue = engine.addEntity()
  Transform.createOrReplace(headerValue, {
    parent: root,
    position: Vector3.create(rightX, panelH / 2 - 1.52, -0.02),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  TextShape.createOrReplace(headerValue, {
    text: valueHeader,
    fontSize: headerFont,
    textColor: Color4.fromHexString('#ffcf73ff'),
    textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
  })

  const rowNames: Entity[] = []
  const rowValues: Entity[] = []
  const contentTop = panelH / 2 - 2.55
  const contentBottom = -panelH / 2 + 0.8
  const rowGap = (contentTop - contentBottom) / (DEFAULT_ROWS - 1)

  for (let i = 0; i < DEFAULT_ROWS; i++) {
    const y = contentTop - i * rowGap

    if (i < DEFAULT_ROWS - 1) {
      addPanelPlane(
        root,
        Vector3.create(0, y - rowGap / 2, 0.013),
        Vector3.create(panelW * 0.78, 0.018, 1),
        separator
      )
    }

    const nameEntity = engine.addEntity()
    Transform.createOrReplace(nameEntity, {
      parent: root,
      position: Vector3.create(leftX, y, -0.02),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(nameEntity, {
      text: `${i + 1}. ---`,
      fontSize: rowFont,
      textColor: Color4.White(),
      textAlign: TextAlignMode.TAM_MIDDLE_LEFT
    })

    const valueEntity = engine.addEntity()
    Transform.createOrReplace(valueEntity, {
      parent: root,
      position: Vector3.create(rightX, y, -0.02),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(valueEntity, {
      text: '-',
      fontSize: rowFont,
      textColor: Color4.fromHexString('#ffcf73ff'),
      textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
    })

    rowNames.push(nameEntity)
    rowValues.push(valueEntity)
  }

  const state: PanelState = {
    root,
    rowNames,
    rowValues,
    currentTab: 0
  }

  const initialData = options.tabData?.[0] ?? []
  setTabData(state, 0, initialData)

  return state
}

export function setActiveTab(panel: PanelState, index: number) {
  panel.currentTab = index
}

export function setTabData(panel: PanelState, _tabIndex: number, entries: LeaderboardPanelEntry[]) {
  const rows = entries.slice(0, DEFAULT_ROWS)

  for (let i = 0; i < DEFAULT_ROWS; i++) {
    const entry = rows[i]
    const name = TextShape.getMutable(panel.rowNames[i])
    const value = TextShape.getMutable(panel.rowValues[i])

    if (!entry) {
      name.text = i === 0 && rows.length === 0 ? 'No data yet' : ''
      value.text = ''
      continue
    }

    name.text = `${i + 1}. ${entry.name}`
    value.text = entry.value
  }
}
