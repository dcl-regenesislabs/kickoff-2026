// Panels for `sdk-commands ui-preview` (npm run ui-preview). NOT deployed.
// Each entry is a sidebar button that jumps the UI to that screen.
import {
  setupProdeUi,
  openScorePanel,
  openProdeInfo,
  openGroupForm,
  __previewSetWelcome
} from './schedule/prodeUi'

setupProdeUi()

export default {
  Welcome: () => __previewSetWelcome(true),
  'Group A form': () => {
    __previewSetWelcome(false)
    openGroupForm(0, () => {})
  },
  'My Score': () => {
    __previewSetWelcome(false)
    openScorePanel()
  },
  'Scoring info': () => {
    __previewSetWelcome(false)
    openProdeInfo()
  },
  'Base HUD': () => __previewSetWelcome(false)
}
