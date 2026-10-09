import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '../components/ui'

export function Placeholder({ title, icon }: { title: string; icon?: LucideIcon }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-[1.6rem] leading-tight">{title}</h1>
      <EmptyState title="Nothing here yet" description="This page is being built." icon={icon} />
    </section>
  )
}
