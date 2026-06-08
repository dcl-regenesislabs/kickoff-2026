import { engine, AudioSource, Transform, Entity } from '@dcl/sdk/ecs'

// Simple one-shot UI sound effects. We use createOrReplace on each play so the
// clip reliably restarts (a plain playing=true toggle doesn't re-trigger).
const CLICK_SRC    = 'sounds/click.mp3'
const COMPLETE_SRC = 'sounds/complete.mp3'

let clickEntity: Entity | undefined
let completeEntity: Entity | undefined

export function setupSfx() {
  clickEntity = engine.addEntity()
  Transform.create(clickEntity, {})
  completeEntity = engine.addEntity()
  Transform.create(completeEntity, {})
}

export function playClick() {
  if (clickEntity === undefined) return
  AudioSource.createOrReplace(clickEntity, {
    audioClipUrl: CLICK_SRC, playing: true, loop: false, global: true, volume: 1
  })
}

export function playComplete() {
  if (completeEntity === undefined) return
  AudioSource.createOrReplace(completeEntity, {
    audioClipUrl: COMPLETE_SRC, playing: true, loop: false, global: true, volume: 1
  })
}
