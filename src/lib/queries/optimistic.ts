import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { keys } from './keys'
import type { ResourceKey } from './keys'

export type Change<TRow> =
  | { type: 'create'; row: TRow }
  | { type: 'patch'; id: string; patch: Partial<TRow> }
  | { type: 'remove'; id: string }

type Filter = Record<string, unknown>

/** Default list membership: every filter entry that names a column must equal the row's value. */
function matchesFilter(row: object, filter: Filter): boolean {
  return Object.entries(filter).every(
    ([column, value]) => value === undefined || !(column in row) || (row as Filter)[column] === value,
  )
}

function applyChange<TRow extends { id: string }>(rows: TRow[], change: Change<TRow>): TRow[] {
  if (change.type === 'create') return [...rows, change.row]
  if (change.type === 'remove') return rows.filter((row) => row.id !== change.id)
  return rows.map((row) => (row.id === change.id ? { ...row, ...change.patch } : row))
}

type Options<TRow, TVars, TResult> = {
  resource: ResourceKey
  mutationFn: (vars: TVars) => Promise<TResult>
  /** What the cache should look like straight away, before the server answers. */
  change: (vars: TVars) => Change<TRow>
  /** Whether a row belongs in a list with this filter. Defaults to matching filter columns. */
  belongs?: (row: TRow, filter: Filter) => boolean
  /** Other resources this write affects; refetched once it settles. */
  invalidate?: readonly ResourceKey[]
}

/**
 * A mutation that updates the cache first and rolls back if the write fails.
 *
 * onMutate applies the change to every cached list of the resource (and to the cached detail
 * for a patch); onError restores the snapshot; onSettled refetches so the cache ends up with
 * what the server actually stored.
 */
export function useOptimisticMutation<TRow extends { id: string }, TVars, TResult = TRow>({
  resource,
  mutationFn,
  change: describeChange,
  belongs = matchesFilter,
  invalidate = [],
}: Options<TRow, TVars, TResult>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: keys.all(resource) })
      const snapshot: Array<[QueryKey, unknown]> = queryClient.getQueriesData({ queryKey: keys.all(resource) })
      const change = describeChange(vars)

      for (const [key, rows] of queryClient.getQueriesData<TRow[]>({ queryKey: keys.lists(resource) })) {
        if (!rows) continue
        const filter = (key[2] ?? {}) as Filter
        queryClient.setQueryData(
          key,
          applyChange(rows, change).filter((row) => belongs(row, filter)),
        )
      }
      if (change.type === 'patch') {
        queryClient.setQueryData<TRow>(keys.detail(resource, change.id), (row) => row && { ...row, ...change.patch })
      }

      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      for (const [key, value] of context?.snapshot ?? []) queryClient.setQueryData(key, value)
    },
    onSettled: () =>
      Promise.all(
        [resource, ...invalidate].map((key) => queryClient.invalidateQueries({ queryKey: keys.all(key) })),
      ),
  })
}

let tempCounter = 0
/** Placeholder id for an optimistic row; replaced by the real row when the write settles. */
export const tempId = () => `optimistic-${++tempCounter}`
export const nowIso = () => new Date().toISOString()
