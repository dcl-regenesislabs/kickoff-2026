import {
  ColliderLayer,
  EasingFunction,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  LightSource,
  MeshCollider,
  Transform,
  Tween,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color3, Quaternion, Vector3 } from '@dcl/sdk/math'

export type PortalOptions = {
  position: { x: number; y: number; z: number }
  rotation?: { x: number; y: number; z: number }
  size?: number
  hoverText?: string
  onActivate?: () => void
}

const FRAME_SRC = 'assets/scene/Models/portals/portalFrame.glb'
const FRAME_ARROWS_SRC = 'assets/scene/Models/portals/portalFrameArrows.glb'
const DOOR_SRC = 'assets/scene/Models/portals/door.glb'
const LAYER_SRC = 'assets/scene/Models/portals/portalLayer2.glb'

const LAYER_COUNT = 12
const LAYER_BASE_SCALE = 1.05
const LAYER_SCALE_STEP = 0.055
const LAYER_Y_STEP = 0.07
const LAYER_Z_STEP = 0.001
const OPEN_DISTANCE = 5
const CLOSE_DISTANCE = 6
const DOOR_OPEN_ANGLE = 145
const DOOR_TWEEN_MS = 1200
const DOOR_SEPARATION = 1
const DOOR_Y = 0
const DOOR_Z = -0.05

const activePortals = new Set<Portal>()
let proximitySystemRegistered = false

function ensureProximitySystem() {
  if (proximitySystemRegistered) return
  engine.addSystem(() => {
    const playerTransform = Transform.getOrNull(engine.PlayerEntity)
    if (!playerTransform) return

    for (const portal of activePortals) {
      portal.updateProximity(playerTransform.position)
    }
  })
  proximitySystemRegistered = true
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export class Portal {
  private readonly root: Entity
  private readonly portalBody: Entity
  private readonly doorLeft: Entity
  private readonly doorRight: Entity
  private readonly clicker: Entity
  private readonly options: PortalOptions
  private isOpen = false

  constructor(options: PortalOptions) {
    this.options = options
    this.root = engine.addEntity()
    this.portalBody = engine.addEntity()
    this.doorLeft = engine.addEntity()
    this.doorRight = engine.addEntity()
    this.clicker = engine.addEntity()

    const size = options.size ?? 1
    const rotation = options.rotation ?? { x: 0, y: 0, z: 0 }

    Transform.create(this.root, {
      position: Vector3.create(options.position.x, options.position.y, options.position.z),
      rotation: Quaternion.fromEulerDegrees(rotation.x, rotation.y, rotation.z),
      scale: Vector3.One()
    })

    Transform.create(this.portalBody, {
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(size, size, size),
      parent: this.root
    })

    const frame = engine.addEntity()
    Transform.create(frame, {
      position: Vector3.create(0, 0, 0.16),
      rotation: Quaternion.Identity(),
      scale: Vector3.One(),
      parent: this.portalBody
    })
    GltfContainer.create(frame, { src: FRAME_SRC })

    const frameArrows = engine.addEntity()
    Transform.create(frameArrows, {
      position: Vector3.create(0, 0, 0.16),
      rotation: Quaternion.Identity(),
      scale: Vector3.One(),
      parent: this.portalBody
    })
    GltfContainer.create(frameArrows, { src: FRAME_ARROWS_SRC })

    for (let i = 0; i < LAYER_COUNT; i++) {
      const layer = engine.addEntity()
      const scaleValue = LAYER_BASE_SCALE - i * LAYER_SCALE_STEP
      Transform.create(layer, {
        position: Vector3.create(0, i * LAYER_Y_STEP, 0.11 + i * LAYER_Z_STEP),
        rotation: Quaternion.Identity(),
        scale: Vector3.create(scaleValue, scaleValue, scaleValue),
        parent: this.portalBody
      })
      GltfContainer.create(layer, { src: LAYER_SRC })
    }

    Transform.create(this.doorLeft, {
      position: Vector3.create(-DOOR_SEPARATION, DOOR_Y, DOOR_Z),
      rotation: Quaternion.Identity(),
      scale: Vector3.One(),
      parent: this.portalBody
    })
    GltfContainer.create(this.doorLeft, { src: DOOR_SRC })

    Transform.create(this.doorRight, {
      position: Vector3.create(DOOR_SEPARATION, DOOR_Y, DOOR_Z),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(-1, 1, 1),
      parent: this.portalBody
    })
    GltfContainer.create(this.doorRight, { src: DOOR_SRC })

    const portalLight = engine.addEntity()
    Transform.create(portalLight, {
      position: Vector3.create(0, 1.8, 0.3),
      parent: this.portalBody
    })
    LightSource.create(portalLight, {
      type: LightSource.Type.Point({}),
      color: Color3.create(1, 0.42, 0.08),
      intensity: 8000
    })

    Transform.create(this.clicker, {
      position: Vector3.create(0, 1.7, 0.2),
      scale: Vector3.create(2.5, 3.5, 0.8),
      parent: this.portalBody
    })
    MeshCollider.setBox(this.clicker, ColliderLayer.CL_POINTER)

    if (options.onActivate) {
      pointerEventsSystem.onPointerDown(
        {
          entity: this.clicker,
          opts: {
            button: InputAction.IA_POINTER,
            hoverText: options.hoverText ?? 'Enter portal',
            maxDistance: 16
          }
        },
        () => options.onActivate?.()
      )
    }

    activePortals.add(this)
    ensureProximitySystem()
  }

  updateProximity(playerPosition: { x: number; y: number; z: number }) {
    const portalTransform = Transform.get(this.root)
    const dist = distance(playerPosition, portalTransform.position)

    if (!this.isOpen && dist <= OPEN_DISTANCE) {
      this.setOpen(true)
    } else if (this.isOpen && dist >= CLOSE_DISTANCE) {
      this.setOpen(false)
    }
  }

  private setOpen(open: boolean) {
    if (this.isOpen === open) return
    this.isOpen = open

    const leftTarget = Quaternion.fromEulerDegrees(0, open ? DOOR_OPEN_ANGLE : 0, 0)
    const rightTarget = Quaternion.fromEulerDegrees(0, open ? -DOOR_OPEN_ANGLE : 0, 0)

    Tween.createOrReplace(this.doorLeft, {
      mode: Tween.Mode.Rotate({
        start: Transform.get(this.doorLeft).rotation,
        end: leftTarget
      }),
      duration: DOOR_TWEEN_MS,
      easingFunction: EasingFunction.EF_EASEOUTQUAD
    })

    Tween.createOrReplace(this.doorRight, {
      mode: Tween.Mode.Rotate({
        start: Transform.get(this.doorRight).rotation,
        end: rightTarget
      }),
      duration: DOOR_TWEEN_MS,
      easingFunction: EasingFunction.EF_EASEOUTQUAD
    })
  }
}
