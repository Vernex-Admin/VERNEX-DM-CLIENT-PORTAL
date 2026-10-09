import { ModalSurface } from './modal'
import type { ModalProps } from './modal'

export type DrawerProps = ModalProps

// Right-side panel for forms; full width under 640px.
export function Drawer(props: DrawerProps) {
  return <ModalSurface placement="right" {...props} />
}
