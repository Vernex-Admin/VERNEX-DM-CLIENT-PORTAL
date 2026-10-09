import { ModalSurface } from './modal'
import type { ModalProps } from './modal'

export type DialogProps = ModalProps

// Centred on desktop, bottom sheet under 640px.
export function Dialog(props: DialogProps) {
  return <ModalSurface placement="center" {...props} />
}
