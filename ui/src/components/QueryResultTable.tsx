'use client'

import * as React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'

type QueryResultTableProps = {
  columns: string[] | Record<string, string>
  data: Array<Record<string, unknown>>
}

// Custom hook to handle column mapping and data transformation
function useColumnMapping(
  columns: string[] | Record<string, string>,
  rawData: Array<Record<string, unknown>>
) {
  return React.useMemo(() => {
    // Handle new format: object mapping from data keys to display names
    if (typeof columns === 'object' && !Array.isArray(columns)) {
      const columnMapping = columns as Record<string, string>
      const dataKeys = Object.keys(columnMapping)
      const displayNames = dataKeys.map(key => columnMapping[key])

      // Transform data to use display names as keys
      const transformedData = rawData.map(row => {
        const newRow: Record<string, unknown> = {}
        dataKeys.forEach(dataKey => {
          const displayName = columnMapping[dataKey]
          newRow[displayName] = row[dataKey]
        })
        return newRow
      })

      return { columnNames: displayNames, transformedData }
    }

    // Handle legacy format: array of column names (no transformation)
    if (Array.isArray(columns)) {
      return { columnNames: columns, transformedData: rawData }
    }

    // Fallback
    return { columnNames: [], transformedData: [] }
  }, [columns, rawData])
}

export default function QueryResultTable({
  columns,
  data,
}: QueryResultTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  // Use the custom hook to handle column mapping and data transformation
  const { columnNames, transformedData } = useColumnMapping(columns, data)
  const [columnOrder, setColumnOrder] = React.useState<string[]>(columnNames)

  React.useEffect(() => {
    setColumnOrder(columnNames)
  }, [columnNames, data])

  const columnDefs = React.useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columnOrder.map(col => ({
        accessorKey: col,
        header: col,
        enableSorting: true,
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
    [columnOrder]
  )

  const table = useReactTable({
    data: transformedData,
    columns: columnDefs,
    state: {
      sorting,
      columnOrder,
    },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="w-full overflow-x-auto rounded border border-slate-700">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/60 text-slate-200">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header, index) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left font-semibold cursor-pointer hover:bg-slate-800/60 select-none relative group"
                  onClick={header.column.getToggleSortingHandler()}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', index.toString())
                  }}
                  onDragOver={e => {
                    e.preventDefault()
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    const draggedIndex = parseInt(
                      e.dataTransfer.getData('text/plain')
                    )
                    const targetIndex = index
                    if (draggedIndex !== targetIndex) {
                      const newOrder = [...columnOrder]
                      const [draggedItem] = newOrder.splice(draggedIndex, 1)
                      newOrder.splice(targetIndex, 0, draggedItem)
                      setColumnOrder(newOrder)
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    <div className="ml-2 flex flex-col">
                      {header.column.getIsSorted() === 'asc' && (
                        <span className="text-cyan-400">↑</span>
                      )}
                      {header.column.getIsSorted() === 'desc' && (
                        <span className="text-cyan-400">↓</span>
                      )}
                    </div>
                  </div>
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
                colSpan={columnNames.length || 1}
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
