import type { LucideIcon, LucideProps } from 'lucide-react'

type IconProps = Omit<LucideProps, 'strokeWidth'> & { icon: LucideIcon }

// Every icon goes through here so the stroke is always 1.5, never the lucide default.
export function Icon({ icon: Glyph, size = 18, ...props }: IconProps) {
  return <Glyph size={size} strokeWidth={1.5} aria-hidden="true" {...props} />
}
