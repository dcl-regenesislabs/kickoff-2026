import { signedFetch } from '~system/SignedFetch'
import { getPlayer } from '@dcl/sdk/players'
import { WEARABLE_CONFIG } from '../src/wearableConfig'

// Reusable free-wearable claim. Call it from wherever you want to dispense the
// reward (here: clicking the trophy). Guards against double-claims per session.
let claiming = false
let claimed  = false

export function claimWearable() {
  if (claiming || claimed) return
  const localAddress = getPlayer()?.userId
  if (!localAddress) {
    console.log('[Wearable] no wallet address yet — cannot claim')
    return
  }
  claiming = true
  void (async () => {
    try {
      const url = `${WEARABLE_CONFIG.rewardsApi}/${WEARABLE_CONFIG.campaignId}/rewards`
      const response = await signedFetch({
        url,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_key: WEARABLE_CONFIG.campaignKey,
            beneficiary: localAddress,
            catalyst: WEARABLE_CONFIG.catalyst
          })
        }
      })

      console.log(`[Wearable] <- HTTP ${response.status}: ${response.body?.substring(0, 100)}`)

      let data: { ok?: boolean; data?: { token?: string; image?: string }[]; error?: string } = {}
      try { data = JSON.parse(response.body ?? '{}') } catch { /* plain text response */ }

      if (data.ok && data.data?.[0]) {
        claimed = true
        console.log(`[Wearable] ✓ Claimed! token: ${data.data[0].token ?? 'claimed'}`)
      } else {
        console.error(`[Wearable] ✗ Claim failed: ${data.error ?? response.body}`)
      }
    } catch (err) {
      console.error('[Wearable] ✗ Claim error:', err)
    } finally {
      claiming = false
    }
  })()
}
