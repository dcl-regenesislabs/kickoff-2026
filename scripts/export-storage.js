/* eslint-disable */
/**
 * EXPORT (backup) the Decentraland server-side Storage of THIS scene (kickoff.dcl.eth).
 *
 * Read-only safety net to run BEFORE a deploy: it never writes anything to any
 * world — it only READS every prode key and dumps them to a local JSON file.
 * (Adapted from scripts/migrate-storage.js, which can also write/migrate. This
 * one intentionally has NO write path.)
 *
 * Requests are signed headless with DCL_PRIVATE_KEY (the wallet that owns/can
 * deploy the world), reusing the exact signing helpers shipped with sdk-commands.
 *
 * What it exports — the full prode:* namespace (group + knockout):
 *   Scene-scoped (one value each):
 *     - prode:results         official group-stage results
 *     - prode:ko:results      official knockout results
 *     - prode:ko:fixtures     knockout fixtures (teams/round/kickoff from the API)
 *   Per-player, for EVERY address the storage service lists:
 *     - prode:predictions        (player-scoped) the player's group predictions
 *     - prode:ko:predictions     (player-scoped) the player's knockout predictions
 *     - prode:player:<addr>      (scene-scoped)  leaderboard mirror (name + group preds)
 *     - prode:ko:player:<addr>   (scene-scoped)  leaderboard mirror (name + ko preds)
 *
 * Usage:
 *   DCL_PRIVATE_KEY=0x... node scripts/export-storage.js
 *
 * Env vars:
 *   DCL_PRIVATE_KEY  (required) wallet that owns the world
 *   WORLD            default: kickoff.dcl.eth
 *   STORAGE_BASE     default: https://storage.decentraland.org  (use .zone for staging)
 *   BACKUP_FILE      default: prode-storage-export-<timestamp>.json
 */

const fs = require('fs')
const path = require('path')

// ── Reuse the exact signing helpers from sdk-commands ────────────────────────
const shared = require('@dcl/sdk-commands/dist/commands/storage/shared')
const { createAuthChainHeaders } = require('@dcl/sdk-commands/dist/logic/auth-chain-headers')
const { createWallet } = require('@dcl/sdk-commands/dist/logic/account')

const sdkBase = path.dirname(require.resolve('@dcl/sdk-commands/package.json'))
const resolveDep = (name) => require(require.resolve(name, { paths: [sdkBase] }))
const { Authenticator } = resolveDep('@dcl/crypto')
const { ethSign } = resolveDep('@dcl/crypto/dist/crypto')
const { hexToBytes } = resolveDep('eth-connect')

// ── Config ───────────────────────────────────────────────────────────────────
const PRIVATE_KEY = process.env.DCL_PRIVATE_KEY
const WORLD = process.env.WORLD || 'kickoff.dcl.eth'
const STORAGE_BASE = (process.env.STORAGE_BASE || 'https://storage.decentraland.org').replace(/\/$/, '')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const BACKUP_FILE = process.env.BACKUP_FILE || `prode-storage-export-${STAMP}.json`
const PAGE_LIMIT = 100
const CONCURRENCY = 6

// Storage keys — must match schedule/prodeNet.ts
const SCENE_KEYS = ['prode:results', 'prode:ko:results', 'prode:ko:fixtures']
const PLAYER_KEYS = ['prode:predictions', 'prode:ko:predictions']     // player-scoped
const PLAYER_PREFIX = 'prode:player:'                                  // scene-scoped mirror
const KO_PLAYER_PREFIX = 'prode:ko:player:'                            // scene-scoped mirror

// Base parcel from scene.json (used in the signed metadata, mirrors sdk-commands).
const sceneJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'scene.json'), 'utf8'))
const BASE_PARCEL = (sceneJson.scene && sceneJson.scene.base) || '0,0'
const PARCELS = (sceneJson.scene && sceneJson.scene.parcels) || ['0,0']

if (!PRIVATE_KEY) {
  console.error('ERROR: DCL_PRIVATE_KEY is required (the wallet that owns the world).')
  process.exit(1)
}
const wallet = createWallet(PRIVATE_KEY)

// ── Signed request (GET only — this script never writes) ─────────────────────
function buildHeaders(url, { storageType, key, address }) {
  const info = shared.createStorageInfo(storageType, 'get', url, WORLD, BASE_PARCEL, PARCELS, key, undefined, address)
  const authChain = Authenticator.createSimpleAuthChain(
    info.rootCID,
    wallet.address,
    ethSign(hexToBytes(wallet.privateKey), info.rootCID)
  )
  return createAuthChainHeaders(authChain, info.timestamp, info.metadata)
}

async function signedGet(url, meta) {
  const res = await fetch(url, { method: 'GET', headers: buildHeaders(url, meta) })
  return res
}

// ── Storage reads ────────────────────────────────────────────────────────────
async function listAllPlayers() {
  const addresses = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const url = `${STORAGE_BASE}/players?limit=${PAGE_LIMIT}&offset=${offset}`
    const res = await signedGet(url, { storageType: 'player' })
    if (!res.ok) throw new Error(`listAllPlayers failed (${res.status}): ${await res.text()}`)
    const json = await res.json()
    const page = json.data || []
    addresses.push(...page)
    total = json.pagination && typeof json.pagination.total === 'number' ? json.pagination.total : page.length
    offset += PAGE_LIMIT
    console.log(`  listed ${addresses.length}/${total} players`)
    if (page.length === 0) break
  }
  return addresses
}

async function getValue(scope, key, address) {
  const url =
    scope === 'scene'
      ? `${STORAGE_BASE}/values/${encodeURIComponent(key)}`
      : `${STORAGE_BASE}/players/${encodeURIComponent(address)}/values/${encodeURIComponent(key)}`
  const res = await signedGet(url, { storageType: scope, key, address })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`GET ${scope}/${key}${address ? ' @' + address : ''} failed (${res.status}): ${await res.text()}`)
  const json = await res.json().catch(() => ({}))
  return json.value
}

// Run async tasks with a bounded concurrency pool.
async function pool(items, worker) {
  let index = 0
  let done = 0
  const results = new Array(items.length)
  async function runner() {
    while (index < items.length) {
      const i = index++
      try {
        results[i] = await worker(items[i], i)
      } catch (err) {
        results[i] = { error: String(err && err.message ? err.message : err) }
      }
      done++
      if (done % 25 === 0 || done === items.length) console.log(`  progress ${done}/${items.length}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, runner))
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`World:        ${WORLD}`)
  console.log(`Storage base: ${STORAGE_BASE}`)
  console.log(`Signer:       ${wallet.address}`)
  console.log(`Mode:         EXPORT ONLY (read-only, no writes)`)
  console.log('')

  // 1) Scene-scoped keys (official results + fixtures)
  console.log('Exporting scene keys...')
  const sceneData = {}
  for (const key of SCENE_KEYS) {
    const value = await getValue('scene', key)
    sceneData[key] = value
    const n = Array.isArray(value) ? `${value.length} entries` : value === undefined ? '(empty)' : 'ok'
    console.log(`  ${key}: ${n}`)
  }

  // 2) List every player address the storage service knows about
  console.log('Listing players...')
  const addresses = await listAllPlayers()
  console.log(`Total players: ${addresses.length}`)

  // 3) Per address: player-scoped predictions + scene-scoped leaderboard mirrors
  console.log('Exporting per-player data...')
  const playerData = {}
  await pool(addresses, async (address) => {
    const entry = {}
    for (const key of PLAYER_KEYS) {
      const value = await getValue('player', key, address)
      if (value !== undefined) entry[key] = value
    }
    const mirror = await getValue('scene', PLAYER_PREFIX + address)
    if (mirror !== undefined) entry[PLAYER_PREFIX] = mirror
    const koMirror = await getValue('scene', KO_PLAYER_PREFIX + address)
    if (koMirror !== undefined) entry[KO_PLAYER_PREFIX] = koMirror
    if (Object.keys(entry).length > 0) playerData[address] = entry
    return entry
  })

  const backup = { exportedAt: new Date().toISOString(), world: WORLD, sceneData, playerData }
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2))
  console.log(`\nExport complete → ${BACKUP_FILE}`)
  console.log(`  scene keys:        ${Object.keys(sceneData).length}`)
  console.log(`  players with data: ${Object.keys(playerData).length}`)
}

main().catch((err) => {
  console.error('\nExport failed:', err)
  process.exit(1)
})
