import {
  engine,
  Entity,
  Transform,
  TransformTypeWithOptionals,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  TextAlignMode,
  InputAction,
  pointerEventsSystem,
  VisibilityComponent
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
  tabs: Entity[]
  tabLabels: Array<Entity | null>
  tabUnderlines: Array<Entity | null>
  tabRows: Entity[][]
  tabVisibility: Entity[][]
  currentTab: number
  leftButton: Entity | null
  rightButton: Entity | null
}

const DEFAULT_SIZE = Vector3.create(4, 6.0, 1)
const DEFAULT_TABS = ['KILLS', 'WAVES']
const DEFAULT_ROWS = 10

const DEFAULT_TAB_DATA: LeaderboardPanelEntry[][] = [[], []]

export function createLeaderboardPanel(options: LeaderboardPanelOptions = {}) {
  const size = options.size ?? DEFAULT_SIZE
  const tabs = options.tabs && options.tabs.length > 0 ? options.tabs : DEFAULT_TABS
  const tabColumnHeaders = options.tabColumnHeaders ?? tabs.map(() => 'COUNT')
  const tabData = options.tabData && options.tabData.length > 0 ? options.tabData : DEFAULT_TAB_DATA
  const skipBackground = options.skipBackground ?? false
  const hideTabNav = options.hideTabNav ?? false

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

  // Background panel (skipped when the scene already provides a background plane)
  if (!skipBackground) {
    const background = engine.addEntity()
    Transform.createOrReplace(background, {
      parent: root,
      position: Vector3.create(0, 0, 0),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(size.x, size.y, 1)
    })
    MeshRenderer.setPlane(background)
    Material.setBasicMaterial(background, {
      diffuseColor: Color4.fromHexString('#111111ff')
    })
  }

  const tabLabels: Array<Entity | null> = []
  const tabUnderlines: Array<Entity | null> = []
  const tabLabelRoot = engine.addEntity()
  Transform.createOrReplace(tabLabelRoot, {
    parent: root,
    position: Vector3.create(0, size.y / 2 - 0.9, -0.03),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })

  for (let i = 0; i < tabs.length; i++) {
    const tabLabel = engine.addEntity()
    const tabX = (i - (tabs.length - 1) / 2) * 1.6
    Transform.createOrReplace(tabLabel, {
      parent: tabLabelRoot,
      position: Vector3.create(tabX, 0, 0),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(tabLabel, {
      text: tabs[i],
      fontSize: 1.6,
      textColor: i === 0 ? Color4.White() : Color4.fromHexString('#bbbbbbff'),
      outlineColor: Color4.Black(),
      outlineWidth: 0.15,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

    const underline = engine.addEntity()
    Transform.createOrReplace(underline, {
      parent: tabLabelRoot,
      position: Vector3.create(tabX, -0.25, 0),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.9, 0.05, 1)
    })
    MeshRenderer.setPlane(underline)
    Material.setBasicMaterial(underline, {
      diffuseColor: Color4.fromHexString('#9f78e7')
    })
    VisibilityComponent.createOrReplace(underline, { visible: i === 0 })

    tabLabels.push(tabLabel)
    tabUnderlines.push(underline)
  }

  const tabRoots: Entity[] = []
  const tabRows: Entity[][] = []
  const tabVisibility: Entity[][] = []

  for (let i = 0; i < tabs.length; i++) {
    const tabRoot = engine.addEntity()
    Transform.createOrReplace(tabRoot, {
      parent: root,
      position: Vector3.create(0, -0.1, -0.03),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })

    const headerRow = engine.addEntity()
    Transform.createOrReplace(headerRow, {
      parent: tabRoot,
      position: Vector3.create(0, size.y / 2 - 1.25, -0.01),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    const headerName = engine.addEntity()
    Transform.createOrReplace(headerName, {
      parent: headerRow,
      position: Vector3.create(-1.2, 0, 0),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(headerName, {
      text: 'PLAYER',
      fontSize: 1.35,
      textColor: Color4.fromHexString('#9f78e7'),
      outlineColor: Color4.Black(),
      outlineWidth: 0.1,
      textAlign: TextAlignMode.TAM_MIDDLE_LEFT
    })
    VisibilityComponent.createOrReplace(headerName, { visible: i === 0 })

    const headerValue = engine.addEntity()
    Transform.createOrReplace(headerValue, {
      parent: headerRow,
      position: Vector3.create(1.25, 0, 0),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    TextShape.createOrReplace(headerValue, {
      text: tabColumnHeaders[i] ?? 'COUNT',
      fontSize: 1.35,
      textColor: Color4.fromHexString('#9f78e7'),
      outlineColor: Color4.Black(),
      outlineWidth: 0.1,
      textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
    })
    VisibilityComponent.createOrReplace(headerValue, { visible: i === 0 })

    const rows: Entity[] = []
    const visibilityList: Entity[] = [headerName, headerValue]
    const contentTop = size.y / 2 - 1.7
    const contentBottom = -size.y / 2 + 0.9
    const rowGap = (contentTop - contentBottom) / (DEFAULT_ROWS - 1)

    for (let r = 0; r < DEFAULT_ROWS; r++) {
      const rowRoot = engine.addEntity()
      Transform.createOrReplace(rowRoot, {
        parent: tabRoot,
        position: Vector3.create(0, contentTop - r * rowGap, -0.01),
        rotation: Quaternion.Identity(),
        scale: Vector3.One()
      })

      const rankText = engine.addEntity()
      Transform.createOrReplace(rankText, {
        parent: rowRoot,
        position: Vector3.create(-1.75, 0, 0),
        rotation: Quaternion.Identity(),
        scale: Vector3.One()
      })
      TextShape.createOrReplace(rankText, {
        text: `${r + 1}.`,
        fontSize: 1.2,
        textColor: Color4.fromHexString('#bbbbbbff'),
        outlineColor: Color4.Black(),
        outlineWidth: 0.1,
        textAlign: TextAlignMode.TAM_MIDDLE_LEFT
      })
      VisibilityComponent.createOrReplace(rankText, { visible: i === 0 })

      const nameText = engine.addEntity()
      Transform.createOrReplace(nameText, {
        parent: rowRoot,
        position: Vector3.create(-1.2, 0, 0),
        rotation: Quaternion.Identity(),
        scale: Vector3.One()
      })
      TextShape.createOrReplace(nameText, {
        text: '---',
        fontSize: 1.5,
        textColor: Color4.White(),
        outlineColor: Color4.Black(),
        outlineWidth: 0.1,
        textAlign: TextAlignMode.TAM_MIDDLE_LEFT
      })
      VisibilityComponent.createOrReplace(nameText, { visible: i === 0 })

      const valueText = engine.addEntity()
      Transform.createOrReplace(valueText, {
        parent: rowRoot,
        position: Vector3.create(1.25, 0, 0),
        rotation: Quaternion.Identity(),
        scale: Vector3.One()
      })
      TextShape.createOrReplace(valueText, {
        text: '-',
        fontSize: 1.5,
        textColor: Color4.White(),
        outlineColor: Color4.Black(),
        outlineWidth: 0.1,
        textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
      })
      VisibilityComponent.createOrReplace(valueText, { visible: i === 0 })

      rows.push(nameText)
      rows.push(valueText)
      visibilityList.push(rankText, nameText, valueText)
    }

    VisibilityComponent.createOrReplace(tabRoot, { visible: i === 0 })
    tabRoots.push(tabRoot)
    tabRows.push(rows)
    tabVisibility.push(visibilityList)
  }

  // Tab navigation buttons (skipped when hideTabNav is set, e.g. single-tab panels)
  let leftButton: Entity | null = null
  let rightButton: Entity | null = null

  if (!hideTabNav) {
    // Left button (prev tab)
    leftButton = engine.addEntity()
    Transform.createOrReplace(leftButton, {
      parent: root,
      position: Vector3.create(-size.x / 2 + 0.9, -size.y / 2 + 0.3, -0.03),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(1.4, 0.85, 1)
    })
    MeshRenderer.setPlane(leftButton)
    MeshCollider.setBox(leftButton)
    Material.setBasicMaterial(leftButton, {
      texture: Material.Texture.Common({ src: 'assets/images/backButton.png' }),
      alphaTexture: Material.Texture.Common({ src: 'assets/images/backButton.png' }),
      diffuseColor: Color4.create(1, 1, 1, 1),
      alphaTest: 0.5
    })

    // Right button (next tab)
    rightButton = engine.addEntity()
    Transform.createOrReplace(rightButton, {
      parent: root,
      position: Vector3.create(size.x / 2 - 0.9, -size.y / 2 + 0.3, -0.03),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(1.4, 0.85, 1)
    })
    MeshRenderer.setPlane(rightButton)
    MeshCollider.setBox(rightButton)
    Material.setBasicMaterial(rightButton, {
      texture: Material.Texture.Common({ src: 'assets/images/nextButton.png' }),
      alphaTexture: Material.Texture.Common({ src: 'assets/images/nextButton.png' }),
      diffuseColor: Color4.create(1, 1, 1, 1),
      alphaTest: 0.5
    })
  }

  const state: PanelState = {
    root,
    tabs: tabRoots,
    tabLabels,
    tabUnderlines,
    tabRows,
    tabVisibility,
    currentTab: 0,
    leftButton,
    rightButton
  }

  if (leftButton) {
    pointerEventsSystem.onPointerDown(
      {
        entity: leftButton,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'PREV TAB',
          showHighlight: false,
          maxDistance: 15
        }
      },
      () => setActiveTab(state, state.currentTab - 1)
    )
  }

  if (rightButton) {
    pointerEventsSystem.onPointerDown(
      {
        entity: rightButton,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'NEXT TAB',
          showHighlight: false,
          maxDistance: 15
        }
      },
      () => setActiveTab(state, state.currentTab + 1)
    )
  }

  for (let i = 0; i < tabs.length; i++) {
    setTabData(state, i, tabData[i] ?? [])
  }

  return state
}

export function setActiveTab(panel: PanelState, index: number) {
  if (panel.tabs.length === 0) return
  if (index < 0) index = panel.tabs.length - 1
  if (index >= panel.tabs.length) index = 0

  for (let i = 0; i < panel.tabs.length; i++) {
    VisibilityComponent.getMutable(panel.tabs[i]).visible = i === index
    const label = panel.tabLabels[i]
    if (label) {
      TextShape.getMutable(label).textColor = i === index ? Color4.White() : Color4.fromHexString('#bbbbbbff')
    }
    const underline = panel.tabUnderlines[i]
    if (underline) {
      VisibilityComponent.getMutable(underline).visible = i === index
    }
    const list = panel.tabVisibility[i]
    if (list) {
      for (let j = 0; j < list.length; j++) {
        VisibilityComponent.getMutable(list[j]).visible = i === index
      }
    }
  }

  panel.currentTab = index
}

export function setTabData(panel: PanelState, tabIndex: number, entries: LeaderboardPanelEntry[]) {
  const rowEntities = panel.tabRows[tabIndex]
  if (!rowEntities) return

  if (entries.length === 0) {
    for (let i = 0; i < DEFAULT_ROWS; i++) {
      const nameEntity = rowEntities[i * 2]
      const valueEntity = rowEntities[i * 2 + 1]
      TextShape.getMutable(nameEntity).text = i === 0 ? 'No data yet' : ''
      TextShape.getMutable(valueEntity).text = ''
    }
    return
  }

  for (let i = 0; i < DEFAULT_ROWS; i++) {
    const entry = entries[i]
    const nameEntity = rowEntities[i * 2]
    const valueEntity = rowEntities[i * 2 + 1]
    TextShape.getMutable(nameEntity).text = entry ? entry.name : '---'
    TextShape.getMutable(valueEntity).text = entry ? entry.value : '-'
  }
}
