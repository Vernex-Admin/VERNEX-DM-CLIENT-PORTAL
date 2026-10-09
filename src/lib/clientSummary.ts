import type { HealthStatus, Project } from '../types/db'

// The most worrying status first: a client with one blocked project is a blocked client.
const WORST_FIRST: HealthStatus[] = ['blocked', 'in_review', 'on_track', 'completed']

/** One health for a client from its projects; null when it has none. */
export function clientHealth(projects: Pick<Project, 'health'>[]): HealthStatus | null {
  for (const status of WORST_FIRST) {
    if (projects.some((project) => project.health === status)) return status
  }
  return null
}

/** A readable, URL-safe slug from a business name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
