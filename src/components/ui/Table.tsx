import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type Column<T> = {
  key: string
  header: string
  cell: (row: T) => ReactNode
  align?: 'left' | 'right'
  // Codes and amounts are set in the mono face.
  mono?: boolean
}

export type TableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  // Read by screen readers; not shown.
  caption: string
  // Tighter rows for admin screens.
  dense?: boolean
  // Shown instead of the table when there are no rows.
  empty?: ReactNode
  className?: string
}

// Under 640px each row becomes a stacked card with the column header as a label.
// The explicit ARIA roles keep table semantics once the layout is no longer display: table.
export function Table<T>({ columns, rows, rowKey, caption, dense = false, empty, className }: TableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>

  return (
    <div className={cn('sm:overflow-x-auto sm:rounded-card sm:border sm:border-rule sm:bg-surface', className)}>
      <table role="table" className="w-full border-collapse text-left max-sm:block">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="max-sm:sr-only">
          <tr role="row" className="border-b border-rule">
            {columns.map((column) => (
              <th
                key={column.key}
                role="columnheader"
                scope="col"
                className={cn(
                  'px-3 text-sm font-medium whitespace-nowrap text-ink-muted',
                  dense ? 'py-1.5' : 'py-2.5',
                  column.align === 'right' && 'text-right',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-sm:flex max-sm:flex-col max-sm:gap-2">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              role="row"
              className={cn(
                'border-b border-rule last:border-b-0',
                'max-sm:block max-sm:rounded-card max-sm:border max-sm:bg-surface max-sm:px-3 max-sm:py-1 max-sm:last:border-b',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  role="cell"
                  data-label={column.header}
                  className={cn(
                    'px-3 text-ink',
                    dense ? 'py-1.5 text-sm' : 'py-3',
                    column.align === 'right' && 'sm:text-right',
                    column.mono && 'font-mono',
                    'max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:border-b max-sm:border-rule max-sm:px-0 max-sm:py-2 max-sm:text-right max-sm:last:border-b-0',
                    'max-sm:before:font-sans max-sm:before:text-sm max-sm:before:text-ink-muted max-sm:before:content-[attr(data-label)]',
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
