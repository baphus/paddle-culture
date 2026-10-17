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
  type ColumnMeta,
  type PaginationState,
  type RowData,
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
import { ViewToggle } from "@/components/ui/view-toggle"
import { useIsMobileQuery } from "@/hooks/use-mobile"
import { cn } from "cn"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * Pin a column to the right edge so row actions stay reachable while the rest
 * of the table scrolls horizontally. Opt in per column with `meta: { sticky: "right" }`.
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    sticky?: "right"
  }
}

// `-mx-px` hides the cell's own left border under the pinned edge; the shadow
// gives cells something to scroll under once content passes the seam.
const STICKY_HEAD =
  "sticky right-0 z-20 -mx-px border-l border-border bg-background text-right shadow-[-4px_0_8px_-6px_rgb(0_0_0/0.25)]"
const STICKY_CELL =
  "sticky right-0 z-10 -mx-px border-l border-border bg-background shadow-[-4px_0_8px_-6px_rgb(0_0_0/0.25)] group-hover:bg-muted/50"

function stickyClass<TData>(
  table: TanstackTable<TData>,
  column: { id: string; columnDef: { meta?: ColumnMeta<TData, unknown> } }
): string | false {
  if (column.columnDef.meta?.sticky !== "right") return false
  const visible = table.getVisibleLeafColumns()
  // Only the right-most visible column can pin to the right edge.
  return visible[visible.length - 1]?.id === column.id ? STICKY_CELL : false
}

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
          <MenuPrimitive.Popup
            data-slot="menu-popup"
            className="z-50 max-h-(--available-height) min-w-36 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
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
  gridCard,
  view: controlledView,
  showColumnToggle = true,
  showSearch = true,
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
  /** Render a row as a card; enables the list/grid toolbar toggle. */
  gridCard?: (row: TData) => React.ReactNode
  /** Controlled view (the parent renders its own toggle, e.g. in a card header). */
  view?: "list" | "grid"
  /** Column-visibility menu in the toolbar (default true). */
  showColumnToggle?: boolean
  /** Search input in the toolbar (default true). */
  showSearch?: boolean
}) {
  const [search, setSearch] = React.useState("")
  const [sorting, setSorting] = React.useState<SortingState>([])
  // Grid cards read better than an 8-column table on a phone, so the initial
  // view follows the viewport. Only the default: the toggle still overrides.
  const isMobile = useIsMobileQuery()
  const [internalView, setInternalView] = React.useState<"list" | "grid">(
    isMobile ? "grid" : "list"
  )
  const view = controlledView ?? internalView
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  React.useEffect(() => {
    setInternalView(isMobile ? "grid" : "list")
  }, [isMobile])

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
          {showSearch && (
            <Input
              value={onSearchChange ? (searchValue ?? "") : search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={placeholder}
              className="max-w-xs"
            />
          )}
          {actions}
        </div>
        <div className="flex items-center gap-2">
          {gridCard && controlledView === undefined && (
            <ViewToggle view={view} onViewChange={setInternalView} />
          )}
          {showColumnToggle && view === "list" && (
            <ColumnVisibilityMenu table={table} />
          )}
        </div>
      </div>

      {gridCard && view === "grid" ? (
        table.getRowModel().rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                {gridCard(row.original)}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No results.
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sticky = stickyClass(table, header.column)
                    return (
                      <TableHead
                        key={header.id}
                        className={cn("px-4", sticky && STICKY_HEAD)}
                      >
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
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="group">
                    {row.getVisibleCells().map((cell) => {
                      const sticky = stickyClass(table, cell.column)
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn("px-4", sticky && STICKY_CELL)}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      )
                    })}
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
      )}

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
