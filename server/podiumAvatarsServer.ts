import { engine, Entity, Transform, AvatarShape, VisibilityComponent, TextShape, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/players'

// ── Podium of winners (server-authoritative, synced to every client) ────────────
// Adapted from another game: shows the top-3 players as live avatars (real
// wearables/body/colors), each on a podium step, with a name+points label and a
// celebration emote. Reusable per podium — instantiate one per ranking (kickoff /
// knockout / final), passing that podium's 3 step positions.

export type WinnerEntry = {
  address: string
  rank: number      // 1 = winner
  name: string
  points: number
}

const PODIUM_TEXT_OFFSET = Vector3.create(0, 2.2, 0)
const PODIUM_TEXT_SCALE = Vector3.create(-1, 1, 1)
const PODIUM_SYNC_INTERVAL_SECONDS = 0.75
const DEFAULT_EXPRESSION_IDS = ['dance', 'clap', 'clap']
const PODIUM_EMOTE_REPLAY_SECONDS = 4
const DEFAULT_BODY_SHAPE = 'urn:decentraland:off-chain:base-avatars:BaseMale'
const APPEARANCE_CACHE_SYNC_SECONDS = 1
const PROFILE_ENDPOINT = 'https://asset-bundle-registry.decentraland.org/profiles'
const PROFILE_RETRY_SECONDS = 8

type PodiumSlot = {
  index: number
  entity: Entity
  textEntity: Entity
  address: string | null
  lastSyncedAddress: string | null
  lastSyncTime: number
  lastEmoteTime: number
  emoteTriggerCounter: number
}

type AvatarColor = { r: number; g: number; b: number; a?: number }
type AvatarAppearance = {
  wearables: string[]
  bodyShape: string
  eyeColor: AvatarColor
  skinColor: AvatarColor
  hairColor: AvatarColor
}

function formatPodiumResult(winner: WinnerEntry): string {
  return `${winner.name}\n${winner.points} pts`
}

export class PodiumAvatarsServer {
  private slots: PodiumSlot[] = []
  private active: boolean = false
  private elapsedSeconds: number = 0
  private cacheElapsedSeconds: number = 0
  private appearanceCache = new Map<string, AvatarAppearance>()
  private profileRequestsInFlight = new Set<string>()
  private profileLastAttempt = new Map<string, number>()

  // `slotPositions` = the 3 world positions for 1st/2nd/3rd step. `rotation` = facing.
  // `idPrefix` + `syncBaseId` keep AvatarShape ids and sync ids unique across podiums.
  constructor(
    private slotPositions: Vector3[],
    private rotation: Quaternion,
    private textRotation: Quaternion,
    private idPrefix: string,
    private syncBaseId: number
  ) {
    this.initEntities()
  }

  showWinners(winners: WinnerEntry[]) {
    this.active = true
    const sortedWinners = winners.slice().sort((a, b) => a.rank - b.rank)

    for (const slot of this.slots) {
      const winner = sortedWinners[slot.index]
      slot.address = winner?.address ? winner.address.toLowerCase() : null
      slot.lastSyncedAddress = null
      slot.lastSyncTime = 0
      slot.lastEmoteTime = -PODIUM_EMOTE_REPLAY_SECONDS
      slot.emoteTriggerCounter = 0

      VisibilityComponent.getMutable(slot.entity).visible = false
      Transform.getMutable(slot.entity).scale = Vector3.Zero()
      VisibilityComponent.getMutable(slot.textEntity).visible = false
      Transform.getMutable(slot.textEntity).scale = Vector3.Zero()
      TextShape.getMutable(slot.textEntity).text = winner ? formatPodiumResult(winner) : ''

      if (slot.address) this.getAvatar(slot.address)
    }
  }

  clear() {
    this.active = false
    for (const slot of this.slots) {
      slot.address = null
      slot.lastSyncedAddress = null
      slot.lastSyncTime = 0
      slot.lastEmoteTime = 0
      slot.emoteTriggerCounter = 0
      VisibilityComponent.getMutable(slot.entity).visible = false
      Transform.getMutable(slot.entity).scale = Vector3.Zero()
      VisibilityComponent.getMutable(slot.textEntity).visible = false
      Transform.getMutable(slot.textEntity).scale = Vector3.Zero()
      TextShape.getMutable(slot.textEntity).text = ''
    }
  }

  private initEntities() {
    for (let i = 0; i < this.slotPositions.length; i += 1) {
      const entity = engine.addEntity()
      const textEntity = engine.addEntity()
      AvatarShape.create(entity, { id: `${this.idPrefix}-avatar-${i + 1}`, wearables: [], emotes: [] })
      Transform.create(entity, { position: this.slotPositions[i], rotation: this.rotation, scale: Vector3.Zero() })
      VisibilityComponent.create(entity, { visible: false })
      syncEntity(entity, [Transform.componentId, VisibilityComponent.componentId, AvatarShape.componentId], this.syncBaseId + i * 2)

      TextShape.create(textEntity, {
        text: '', fontSize: 2,
        textColor: { r: 1, g: 0.9, b: 0.1, a: 1 },
        outlineWidth: 0.12, outlineColor: { r: 0, g: 0, b: 0 }
      })
      Transform.create(textEntity, {
        position: Vector3.add(this.slotPositions[i], PODIUM_TEXT_OFFSET),
        rotation: this.textRotation, scale: Vector3.Zero()
      })
      VisibilityComponent.create(textEntity, { visible: false })
      syncEntity(textEntity, [Transform.componentId, VisibilityComponent.componentId, TextShape.componentId], this.syncBaseId + i * 2 + 1)

      this.slots.push({ index: i, entity, textEntity, address: null, lastSyncedAddress: null, lastSyncTime: 0, lastEmoteTime: 0, emoteTriggerCounter: 0 })
    }

    engine.addSystem((dt: number) => {
      if (!this.active) return
      this.elapsedSeconds += dt

      for (const slot of this.slots) {
        if (!slot.address) continue

        const needsSync =
          slot.lastSyncedAddress !== slot.address ||
          this.elapsedSeconds - slot.lastSyncTime >= PODIUM_SYNC_INTERVAL_SECONDS
        if (!needsSync) continue

        const appearance = this.getAvatar(slot.address)
        if (!appearance) continue

        const avatarShape = AvatarShape.getMutable(slot.entity)
        avatarShape.wearables = appearance.wearables.slice()
        avatarShape.bodyShape = appearance.bodyShape
        if (appearance.eyeColor) avatarShape.eyeColor = appearance.eyeColor
        if (appearance.skinColor) avatarShape.skinColor = appearance.skinColor
        if (appearance.hairColor) avatarShape.hairColor = appearance.hairColor

        VisibilityComponent.getMutable(slot.entity).visible = true
        Transform.getMutable(slot.entity).scale = Vector3.One()
        VisibilityComponent.getMutable(slot.textEntity).visible = true
        Transform.getMutable(slot.textEntity).scale = PODIUM_TEXT_SCALE

        if (this.elapsedSeconds - slot.lastEmoteTime >= PODIUM_EMOTE_REPLAY_SECONDS) {
          slot.emoteTriggerCounter += 1
          avatarShape.expressionTriggerId = DEFAULT_EXPRESSION_IDS[slot.index] || 'clap'
          avatarShape.expressionTriggerTimestamp = slot.emoteTriggerCounter
          slot.lastEmoteTime = this.elapsedSeconds
        }

        slot.lastSyncedAddress = slot.address
        slot.lastSyncTime = this.elapsedSeconds
      }
    }, undefined, `server-podium-sync-${this.idPrefix}`)

    engine.addSystem((dt: number) => {
      this.cacheElapsedSeconds += dt
      if (this.cacheElapsedSeconds < APPEARANCE_CACHE_SYNC_SECONDS) return
      this.cacheElapsedSeconds = 0
      for (const [_entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
        const appearance = this.getLiveAppearance(identity.address.toLowerCase())
        if (appearance) this.appearanceCache.set(identity.address.toLowerCase(), appearance)
      }
    }, undefined, `server-podium-cache-${this.idPrefix}`)
  }

  private getLiveAppearance(address: string): AvatarAppearance | null {
    const player = getPlayer({ userId: address })
    const wearables = player?.wearables ?? []
    const avatar = player?.avatar
    if (!avatar && wearables.length === 0) return null

    const appearance: AvatarAppearance = {
      wearables,
      bodyShape: avatar?.bodyShapeUrn || DEFAULT_BODY_SHAPE,
      eyeColor: avatar?.eyesColor ?? { r: 0, g: 0, b: 0 },
      skinColor: avatar?.skinColor ?? { r: 0, g: 0, b: 0 },
      hairColor: avatar?.hairColor ?? { r: 0, g: 0, b: 0 }
    }
    this.appearanceCache.set(address, appearance)
    return appearance
  }

  private getAvatar(address: string): AvatarAppearance | null {
    const liveAppearance = this.getLiveAppearance(address)
    if (liveAppearance) return liveAppearance
    const cachedAppearance = this.appearanceCache.get(address)
    if (cachedAppearance) return cachedAppearance
    void this.maybeFetchAppearanceFromProfiles(address)
    return null
  }

  private async maybeFetchAppearanceFromProfiles(address: string): Promise<void> {
    if (this.appearanceCache.has(address)) return
    const lastAttempt = this.profileLastAttempt.get(address) ?? -Infinity
    if (this.elapsedSeconds - lastAttempt < PROFILE_RETRY_SECONDS) return
    this.profileLastAttempt.set(address, this.elapsedSeconds)
    await this.fetchAppearanceFromProfiles(address)
  }

  private async fetchAppearanceFromProfiles(address: string): Promise<void> {
    if (this.appearanceCache.has(address)) return
    if (this.profileRequestsInFlight.has(address)) return

    this.profileRequestsInFlight.add(address)
    try {
      const fetchFn = (globalThis as unknown as {
        fetch?: (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<any>
      }).fetch
      if (!fetchFn) return

      const response = await fetchFn(PROFILE_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [address] })
      })
      if (!response?.ok) return

      const payload = await response.json()
      const profileList = this.extractProfiles(payload)
      const match = profileList.find((entry) => this.getProfileAddress(entry) === address)
      const avatar = match?.avatar ?? match?.avatars?.[0]?.avatar
      if (!avatar) return

      const wearables = Array.isArray(avatar.wearables)
        ? avatar.wearables.filter((urn: unknown) => typeof urn === 'string')
        : []
      const parsedAppearance: AvatarAppearance = {
        wearables,
        bodyShape:
          (typeof avatar.bodyShape === 'string' && avatar.bodyShape) ||
          (typeof avatar.bodyShapeUrn === 'string' && avatar.bodyShapeUrn) || DEFAULT_BODY_SHAPE,
        eyeColor: this.parseColor(avatar.eyes?.color ?? avatar.eyeColor) ?? { r: 0, g: 0, b: 0 },
        skinColor: this.parseColor(avatar.skin?.color ?? avatar.skinColor) ?? { r: 0, g: 0, b: 0 },
        hairColor: this.parseColor(avatar.hair?.color ?? avatar.hairColor) ?? { r: 0, g: 0, b: 0 }
      }
      this.appearanceCache.set(address, parsedAppearance)
    } catch (_err) {
      // Keep the podium resilient; live data / cache remain the primary path.
    } finally {
      this.profileRequestsInFlight.delete(address)
    }
  }

  private extractProfiles(payload: any): any[] {
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.avatars)) return payload.avatars
    if (Array.isArray(payload?.profiles)) return payload.profiles
    return []
  }

  private getProfileAddress(entry: any): string {
    const value = (typeof entry?.userId === 'string' ? entry.userId : '') ||
      (typeof entry?.ethAddress === 'string' ? entry.ethAddress : '') ||
      (typeof entry?.id === 'string' ? entry.id : '')
    return value.toLowerCase()
  }

  private parseColor(value: unknown): AvatarColor | null {
    if (!value) return null
    if (typeof value === 'string') {
      const hex = value.startsWith('#') ? value.slice(1) : value
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255
      }
    }
    if (typeof value === 'object') {
      const c = value as { r?: unknown; g?: unknown; b?: unknown; a?: unknown }
      if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
        return { r: c.r, g: c.g, b: c.b, a: typeof c.a === 'number' ? c.a : undefined }
      }
    }
    return null
  }
}
