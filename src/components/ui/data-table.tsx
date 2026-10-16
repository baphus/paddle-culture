"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type Table as TanstackTable,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SlidersHorizontalIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function ColumnVisibilityMenu<TData>({ table }: { table: TanstackTable<TData> }) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger render={<Button variant="outline" size="sm" />}>
        <SlidersHorizontalIcon />
        Columns
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          className="isolate z-50 outline-none"
          sideOffset={4}
        >
          <MenuPrimitive.Popup className="z-50 max-h-(--available-height) min-w-36 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
              Toggle columns
            </div>
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <MenuPrimitive.CheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) =>
                    column.toggleVisibility(!!checked)
                  }
                  className="relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm capitalize outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
                >
                  <span className="pointer-events-none absolute right-2 flex items-center justify-center">
                    <MenuPrimitive.CheckboxItemIndicator>
                      <CheckIcon className="size-4" />
                    </MenuPrimitive.CheckboxItemIndicator>
                  </span>
                  {column.id}
                </MenuPrimitive.CheckboxItem>
              ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  placeholder = "Filter…",
  pageSize = 10,
  manualPagination = false,
  pageCount,
  pageIndex = 0,
  onPageChange,
  searchValue,
  onSearchChange,
  actions,
}: {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  placeholder?: string
  pageSize?: number
  /** Server-side pagination: pass pageCount/pageIndex/onPageChange with it. */
  manualPagination?: boolean
  pageCount?: number
  pageIndex?: number
  onPageChange?: (pageIndex: number) => void
  /** Controlled search (fired on every change); the parent owns server filtering. */
  searchValue?: string
  onSearchChange?: (value: string) => void
  /** Extra toolbar controls, rendered in the search row right after the input. */
  actions?: React.ReactNode
}) {
  const [search, setSearch] = React.useState("")
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  const onPaginationChange = React.useCallback(
    (updater: Updater<PaginationState>) => {
      const current = { pageIndex, pageSize }
      const next =
        typeof updater === "function" ? updater(current) : updater
      onPageChange?.(next.pageIndex)
    },
    [onPageChange, pageIndex, pageSize]
  )

  const table = useReactTable({
    data,
    columns,
    initialState: { pagination: { pageSize } },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      ...(manualPagination ? { pagination: { pageIndex, pageSize } } : {}),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: manualPagination ? onPaginationChange : undefined,
    manualPagination: manualPagination || undefined,
    pageCount: manualPagination ? pageCount : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
  })

  function onSearch(value: string) {
    if (onSearchChange) {
      onSearchChange(value)
      return
    }
    setSearch(value)
    if (searchKey) table.getColumn(searchKey)?.setFilterValue(value)
    else table.setGlobalFilter(value)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={onSearchChange ? (searchValue ?? "") : search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="max-w-xs"
          />
          {actions}
        </div>
        <ColumnVisibilityMenu table={table} />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        disabled={!header.column.getCanSort()}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() &&
                          ({
                            asc: <ArrowUpIcon />,
                            desc: <ArrowDownIcon />,
                          }[header.column.getIsSorted() as string] ?? (
                            <ArrowUpDownIcon />
                          ))}
                      </Button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {Math.max(table.getPageCount(), 1)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeftIcon />
          <span className="sr-only">Previous page</span>
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRightIcon />
          <span className="sr-only">Next page</span>
        </Button>
      </div>
    </div>
  )
}
