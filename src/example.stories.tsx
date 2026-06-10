// Component stories for 'sdk-commands ui-preview'. NOT part of the deployed scene.
// Every exported function is a "story": it renders alone, centered on the canvas.
// Rename this file / copy it next to your own components (anything *.stories.tsx works).
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'

export default { title: 'Examples/Badge' } // group name in the sidebar

const Badge = (props: { text: string; color: Color4 }) => (
  <UiEntity
    uiTransform={{ padding: { top: 6, bottom: 6, left: 16, right: 16 }, borderRadius: 14, alignItems: 'center' }}
    uiBackground={{ color: props.color }}
  >
    <Label value={props.text} fontSize={14} color={Color4.White()} />
  </UiEntity>
)

export const Success = () => <Badge text="success" color={Color4.create(0.18, 0.65, 0.35, 1)} />
export const Warning = () => <Badge text="warning" color={Color4.create(0.85, 0.6, 0.1, 1)} />

// Now try one with YOUR component:
// import { MyButton } from './ui/MyButton'
// export const MyButtonDefault = () => <MyButton label="Click me" />
