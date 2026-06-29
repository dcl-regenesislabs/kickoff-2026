/* eslint-disable */
/**
 * Migrate Decentraland server-side Storage from one World to another.
 *
 * The storage service scopes data by the World name carried in the SIGNED
 * REQUEST METADATA (realmName), not by the URL — so this script can READ from
 * the source world and WRITE to the target world in a single run. Requests are
 * signed headless with DCL_PRIVATE_KEY (must be the wallet that owns / can deploy
 * to BOTH worlds), reusing the exact signing helpers shipped with sdk-commands.
 *
 * It copies:
 *   - scene-scoped keys (the leaderboard)
 *   - player-scoped keys (profile/weapons/items) for EVERY address returned by
 *     the storage service's player listing endpoint (paginated)
 *
 * Safe by default: it ONLY exports + writes a local backup file unless you pass
 * EXECUTE=1, which performs the writes into the target world.
 *
 * Usage:
 *   # 1) Dry run — list players + export everything from the source to a backup file
 *   DCL_PRIVATE_KEY=0x... node scripts/migrate-storage.js
 *
 *   # 2) Real migration — also write into the target world
 *   DCL_PRIVATE_KEY=0x... EXECUTE=1 node scripts/migrate-storage.js
 *
 * Env vars:
 *   DCL_PRIVATE_KEY  (required) wallet that owns both worlds
 *   SOURCE_WORLD     default: toastedllama.dcl.eth
 *   TARGET_WORLD     default: deadsurge.dcl.eth
 *   STORAGE_BASE     default: https://storage.decentraland.org  (use .zone for staging)
 *   EXECUTE          set to 1 to actually write into the target world
 *   BACKUP_FILE      default: storage-export.json
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
const SOURCE_WORLD = process.env.SOURCE_WORLD || 'toastedllama.dcl.eth'
const TARGET_WORLD = process.env.TARGET_WORLD || 'deadsurge.dcl.eth'
const STORAGE_BASE = (process.env.STORAGE_BASE || 'https://storage.decentraland.org').replace(/\/$/, '')
const EXECUTE = process.env.EXECUTE === '1'
// IMPORT_ONLY=1 skips reading the source world and imports straight from BACKUP_FILE
// into the target world. Use this AFTER you've deployed the scene to the target world
// (the storage service rejects writes to a world with no deployed scene).
const IMPORT_ONLY = process.env.IMPORT_ONLY === '1'
const BACKUP_FILE = process.env.BACKUP_FILE || 'storage-export.json'
const PAGE_LIMIT = 100
const CONCURRENCY = 6

const SCENE_KEYS = ['leaderboard_kills_v2', 'leaderboard_waves_v2']
const PLAYER_KEYS = ['profile_v1', 'weapons_v1', 'items_v1']

// Base parcel from scene.json (used in the signed metadata, mirrors sdk-commands).
const sceneJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'scene.json'), 'utf8'))
const BASE_PARCEL = (sceneJson.scene && sceneJson.scene.base) || '0,0'
const PARCELS = (sceneJson.scene && sceneJson.scene.parcels) || ['0,0']

if (!PRIVATE_KEY) {
  console.error('ERROR: DCL_PRIVATE_KEY is required (the wallet that owns both worlds).')
  process.exit(1)
}
const wallet = createWallet(PRIVATE_KEY)

// ── Signed request ───────────────────────────────────────────────────────────
function buildHeaders(httpMethod, url, world, { storageType, key, value, address }) {
  const action = httpMethod === 'GET' ? 'get' : httpMethod === 'PUT' ? 'set' : 'delete'
  const info = shared.createStorageInfo(storageType, action, url, world, BASE_PARCEL, PARCELS, key, value, address)
  const authChain = Authenticator.createSimpleAuthChain(
    info.rootCID,
    wallet.address,
    ethSign(hexToBytes(wallet.privateKey), info.rootCID)
  )
  const headers = createAuthChainHeaders(authChain, info.timestamp, info.metadata)
  if (httpMethod !== 'GET') headers['Content-Type'] = 'application/json'
  return headers
}

async function signedFetch(httpMethod, url, world, meta, body) {
  const headers = buildHeaders(httpMethod, url, world, meta)
  const res = await fetch(url, {
    method: httpMethod,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  return res
}

// ── Storage operations ───────────────────────────────────────────────────────
async function listAllPlayers() {
  const addresses = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const url = `${STORAGE_BASE}/players?limit=${PAGE_LIMIT}&offset=${offset}`
    const res = await signedFetch('GET', url, SOURCE_WORLD, { storageType: 'player' })
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

async function getValue(world, scope, key, address) {
  const url =
    scope === 'scene'
      ? `${STORAGE_BASE}/values/${encodeURIComponent(key)}`
      : `${STORAGE_BASE}/players/${encodeURIComponent(address)}/values/${encodeURIComponent(key)}`
  const res = await signedFetch('GET', url, world, { storageType: scope, key, address })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`GET ${scope}/${key}${address ? ' @' + address : ''} failed (${res.status}): ${await res.text()}`)
  const json = await res.json().catch(() => ({}))
  return json.value
}

async function setValue(world, scope, key, value, address) {
  const url =
    scope === 'scene'
      ? `${STORAGE_BASE}/values/${encodeURIComponent(key)}`
      : `${STORAGE_BASE}/players/${encodeURIComponent(address)}/values/${encodeURIComponent(key)}`
  const res = await signedFetch('PUT', url, world, { storageType: scope, key, value, address }, { value })
  if (!res.ok) throw new Error(`PUT ${scope}/${key}${address ? ' @' + address : ''} failed (${res.status}): ${await res.text()}`)
  return true
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

// ── Import a backup payload into the target world ────────────────────────────
async function importIntoTarget(sceneData, playerData) {
  console.log(`\nImporting scene keys into ${TARGET_WORLD}...`)
  for (const key of SCENE_KEYS) {
    if (sceneData[key] === undefined) continue
    await setValue(TARGET_WORLD, 'scene', key, sceneData[key])
    console.log(`  ${key}: written`)
  }

  console.log(`Importing player progress into ${TARGET_WORLD}...`)
  const playerAddresses = Object.keys(playerData)
  const writeResults = await pool(playerAddresses, async (address) => {
    for (const key of Object.keys(playerData[address])) {
      await setValue(TARGET_WORLD, 'player', key, playerData[address][key], address)
    }
    return true
  })
  const failures = writeResults.filter((r) => r && r.error)
  console.log(`\nImport complete. ${playerAddresses.length - failures.length}/${playerAddresses.length} players migrated.`)
  if (failures.length > 0) console.log(`Failures: ${failures.length} (see logs above)`)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Source world: ${SOURCE_WORLD}`)
  console.log(`Target world: ${TARGET_WORLD}`)
  console.log(`Storage base: ${STORAGE_BASE}`)
  console.log(`Signer:       ${wallet.address}`)
  const mode = IMPORT_ONLY
    ? `IMPORT_ONLY (write ${BACKUP_FILE} -> target)`
    : EXECUTE
      ? 'EXECUTE (read source + write to target)'
      : 'DRY RUN (export only)'
  console.log(`Mode:         ${mode}`)
  console.log('')

  // Import-only: load the existing backup and write it into the target world.
  if (IMPORT_ONLY) {
    const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'))
    console.log(`Loaded ${BACKUP_FILE} (from ${backup.sourceWorld}, exported ${backup.exportedAt})`)
    console.log(`  ${Object.keys(backup.playerData).length} players, ${Object.keys(backup.sceneData).length} scene keys`)
    await importIntoTarget(backup.sceneData, backup.playerData)
    return
  }

  // 1) Export scene-scoped keys (leaderboard)
  console.log('Exporting scene keys...')
  const sceneData = {}
  for (const key of SCENE_KEYS) {
    const value = await getValue(SOURCE_WORLD, 'scene', key)
    sceneData[key] = value
    console.log(`  ${key}: ${value === undefined ? '(empty)' : 'ok'}`)
  }

  // 2) List + export player-scoped keys
  console.log('Listing players...')
  const addresses = await listAllPlayers()
  console.log(`Total players: ${addresses.length}`)

  console.log('Exporting player progress...')
  const playerData = {}
  await pool(addresses, async (address) => {
    const entry = {}
    for (const key of PLAYER_KEYS) {
      const value = await getValue(SOURCE_WORLD, 'player', key, address)
      if (value !== undefined) entry[key] = value
    }
    if (Object.keys(entry).length > 0) playerData[address] = entry
    return entry
  })

  const backup = { exportedAt: new Date().toISOString(), sourceWorld: SOURCE_WORLD, sceneData, playerData }
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2))
  console.log(`\nBackup written to ${BACKUP_FILE} (${Object.keys(playerData).length} players with data)`)

  if (!EXECUTE) {
    console.log('\nDRY RUN complete. Review the backup, then re-run with EXECUTE=1 to write into the target world.')
    return
  }

  // 3) Import into target
  await importIntoTarget(sceneData, playerData)
}

main().catch((err) => {
  console.error('\nMigration failed:', err)
  process.exit(1)
})
