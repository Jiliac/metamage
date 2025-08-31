'use client'

import * as React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

type QueryResultTableProps = {
  columns: string[]
  data: Array<Record<string, unknown>>
}

export default function QueryResultTable({
  columns,
  data,
}: QueryResultTableProps) {
  const columnDefs = React.useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columns.map(col => ({
        accessorKey: col,
        header: col,
        cell: info => {
          const v = info.getValue()
          if (v === null || v === undefined) return '—'
          if (typeof v === 'object') {
            try {
              return JSON.stringify(v)
            } catch {
              return String(v)
            }
          }
          return String(v)
        },
      })),
    [columns]
  )

  const table = useReactTable({
    data,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="w-full overflow-x-auto rounded border border-slate-700">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/60 text-slate-200">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left font-semibold"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-100">
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-slate-800/40">
              {row.getVisibleCells().map(cell => (
                <td
                  key={cell.id}
                  className="px-3 py-2 align-top text-slate-300"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td
                className="px-3 py-4 text-slate-400"
                colSpan={columns.length || 1}
              >
                No rows to display.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
