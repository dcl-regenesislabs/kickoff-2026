import { engine, Entity, Transform, AvatarShape, VisibilityComponent, TextShape, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/players'
import { signedFetch } from '~system/SignedFetch'

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
  accuracy?: number // % of played predictions that scored (optional)
}

const PODIUM_TEXT_OFFSET = Vector3.create(0, 2.6, 0)
const PODIUM_TEXT_SCALE = Vector3.create(-1, 1, 1)

// ── Label (text-only, above each avatar) ───────────────────────────────────────
const NAME_FONT    = 2.1
const STATS_FONT   = 1.4
const NAME_OFFSET  = Vector3.create(0, 0.20, 0)               // name sits above center
const STATS_OFFSET = Vector3.create(0, -0.22, 0)              // stats below center
// Color per rank (used for BOTH name and stats): gold / silver / bronze.
const RANK_COLOR = [
  { r: 1.0,  g: 0.80, b: 0.20, a: 1 },   // gold
  { r: 0.66, g: 0.72, b: 0.82, a: 1 },   // silver (kept clearly off-white)
  { r: 0.86, g: 0.55, b: 0.30, a: 1 }    // bronze
]

const PODIUM_SYNC_INTERVAL_SECONDS = 0.75
// Base emote slugs (must be valid DCL ids). '1st' celebrates; 2nd/3rd clap.
// Valid: wave fistpump robot raiseHand clap money kiss tik hammer tektonik dontsee handsair shrug
const DEFAULT_EXPRESSION_IDS = ['tik', 'clap', 'clap']
const PODIUM_EMOTE_REPLAY_SECONDS = 4
const DEFAULT_BODY_SHAPE = 'urn:decentraland:off-chain:base-avatars:BaseMale'
const APPEARANCE_CACHE_SYNC_SECONDS = 1
const PROFILE_ENDPOINT = 'https://peer.decentraland.org/lambdas/profiles'
const PROFILE_RETRY_SECONDS = 8

type PodiumSlot = {
  index: number
  entity: Entity        // the avatar
  nameEntity: Entity    // winner name (big, rank-colored)
  statsEntity: Entity   // "165 pts · 78% acc" (small, white)
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

function formatStats(winner: WinnerEntry): string {
  const acc = typeof winner.accuracy === 'number' ? `   ·   ${winner.accuracy}% ACC` : ''
  return `${winner.points} PTS${acc}`
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

      // Avatar stays hidden until its appearance loads (sync loop reveals it).
      VisibilityComponent.getMutable(slot.entity).visible = false
      Transform.getMutable(slot.entity).scale = Vector3.Zero()

      // The label panel shows right away with the winner's data (works even if the
      // avatar never resolves).
      if (winner) {
        const color = RANK_COLOR[slot.index] ?? RANK_COLOR[0]
        TextShape.getMutable(slot.nameEntity).text = winner.name
        TextShape.getMutable(slot.nameEntity).textColor = color
        TextShape.getMutable(slot.statsEntity).text = formatStats(winner)
        TextShape.getMutable(slot.statsEntity).textColor = color
        this.setLabelVisible(slot, true)
        if (slot.address) this.getAvatar(slot.address)
      } else {
        this.setLabelVisible(slot, false)
      }
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
      this.setLabelVisible(slot, false)
    }
  }

  // Toggle the name + stats text on/off as a group.
  private setLabelVisible(slot: PodiumSlot, visible: boolean) {
    for (const e of [slot.nameEntity, slot.statsEntity]) {
      VisibilityComponent.getMutable(e).visible = visible
    }
    Transform.getMutable(slot.nameEntity).scale  = visible ? PODIUM_TEXT_SCALE : Vector3.Zero()
    Transform.getMutable(slot.statsEntity).scale = visible ? PODIUM_TEXT_SCALE : Vector3.Zero()
  }

  private initEntities() {
    for (let i = 0; i < this.slotPositions.length; i += 1) {
      const base = this.syncBaseId + i * 4
      const labelBase = Vector3.add(this.slotPositions[i], PODIUM_TEXT_OFFSET)

      // ── Avatar ──
      const entity = engine.addEntity()
      AvatarShape.create(entity, { id: `${this.idPrefix}-avatar-${i + 1}`, wearables: [], emotes: [] })
      Transform.create(entity, { position: this.slotPositions[i], rotation: this.rotation, scale: Vector3.Zero() })
      VisibilityComponent.create(entity, { visible: false })
      syncEntity(entity, [Transform.componentId, VisibilityComponent.componentId, AvatarShape.componentId], base)

      // ── Name (big, rank-colored, black outline) ──
      const nameEntity = engine.addEntity()
      TextShape.create(nameEntity, {
        text: '', fontSize: NAME_FONT, textColor: RANK_COLOR[i] ?? RANK_COLOR[0],
        outlineWidth: 0.3, outlineColor: { r: 0, g: 0, b: 0 }
      })
      Transform.create(nameEntity, {
        position: Vector3.add(labelBase, NAME_OFFSET),
        rotation: this.textRotation, scale: Vector3.Zero()
      })
      VisibilityComponent.create(nameEntity, { visible: false })
      syncEntity(nameEntity, [Transform.componentId, VisibilityComponent.componentId, TextShape.componentId], base + 2)

      // ── Stats (white, black outline) ──
      const statsEntity = engine.addEntity()
      TextShape.create(statsEntity, {
        text: '', fontSize: STATS_FONT, textColor: RANK_COLOR[i] ?? RANK_COLOR[0],
        outlineWidth: 0.25, outlineColor: { r: 0, g: 0, b: 0 }
      })
      Transform.create(statsEntity, {
        position: Vector3.add(labelBase, STATS_OFFSET),
        rotation: this.textRotation, scale: Vector3.Zero()
      })
      VisibilityComponent.create(statsEntity, { visible: false })
      syncEntity(statsEntity, [Transform.componentId, VisibilityComponent.componentId, TextShape.componentId], base + 3)

      this.slots.push({ index: i, entity, nameEntity, statsEntity, address: null, lastSyncedAddress: null, lastSyncTime: 0, lastEmoteTime: 0, emoteTriggerCounter: 0 })
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

        // Reveal the avatar (the label panel is already shown from showWinners).
        VisibilityComponent.getMutable(slot.entity).visible = true
        Transform.getMutable(slot.entity).scale = Vector3.One()

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
      // Server runtime has no global fetch — must use signedFetch (same as resultsSync).
      // GET /lambdas/profiles/{address} returns a single profile: { avatars: [{ avatar }] }.
      const response = await signedFetch({
        url: `${PROFILE_ENDPOINT}/${address}`,
        init: { method: 'GET', headers: {} }
      })
      if (!response || response.status < 200 || response.status >= 300) return

      let payload: any = {}
      try { payload = JSON.parse(response.body ?? '{}') } catch { return }
      const profileList = this.extractProfiles(payload)
      const match = profileList.find((entry) => this.getProfileAddress(entry) === address) ?? profileList[0]
      const avatar = match?.avatar ?? match?.avatars?.[0]?.avatar
      if (!avatar) { console.log(`[Podium] no avatar in profile for ${address}`); return }

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
      console.log(`[Podium] avatar loaded for ${address} (${wearables.length} wearables)`)
    } catch (e) {
      console.log(`[Podium] profile fetch failed for ${address}:`, e)
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
