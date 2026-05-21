"use client";

import * as React from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Candidate } from "@/types";
import { ScoreBadge } from "./score-badge";
import { StatusPill } from "./status-pill";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { relative } from "@/lib/format";
import { useRoles } from "@/lib/mock-api";
import { toast } from "sonner";

interface Props {
  data: Candidate[];
  filter?: string;
}

export function CandidateTable({ data, filter }: Props) {
  const { data: roles } = useRoles();
  const roleMap = React.useMemo(() => {
    const m = new Map<string, string>();
    (roles ?? []).forEach((r) => m.set(r.id, r.title));
    return m;
  }, [roles]);

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "overallScore", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const columns = React.useMemo<ColumnDef<Candidate>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortHeader column={column}>Candidate</SortHeader>
        ),
        cell: ({ row }) => (
          <Link
            href={`/candidates/${row.original.id}`}
            className="group flex items-center gap-3"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium tabular">
              {row.original.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="min-w-0">
              <div className="font-medium group-hover:underline">
                {row.original.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.currentTitle} · {row.original.currentCompany}
              </div>
            </div>
          </Link>
        ),
      },
      {
        accessorKey: "roleId",
        header: "Role",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {roleMap.get(row.original.roleId) ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "overallScore",
        header: ({ column }) => <SortHeader column={column}>Score</SortHeader>,
        cell: ({ row }) => <ScoreBadge score={row.original.overallScore} />,
      },
      {
        accessorKey: "experienceYears",
        header: ({ column }) => <SortHeader column={column}>Exp</SortHeader>,
        cell: ({ row }) => (
          <span className="tabular text-sm">
            {row.original.experienceYears.toFixed(1)} yrs
          </span>
        ),
      },
      {
        accessorKey: "city",
        header: "Location",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.city}
          </span>
        ),
      },
      {
        id: "languages",
        header: "Languages",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.languages.slice(0, 3).map((l) => (
              <Badge key={l} variant="outline" className="text-[10px]">
                {l}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusPill status={row.original.status} />,
        filterFn: (row, _id, value: string[]) =>
          value.length === 0 || value.includes(row.original.status),
      },
      {
        accessorKey: "lastActivityAt",
        header: ({ column }) => (
          <SortHeader column={column}>Activity</SortHeader>
        ),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular">
            {relative(row.original.lastActivityAt)}
          </span>
        ),
      },
    ],
    [roleMap],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection, globalFilter: filter ?? "" },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: (row, _columnId, value: string) => {
      const haystack =
        `${row.original.name} ${row.original.email} ${row.original.currentCompany} ${row.original.skills.join(" ")}`.toLowerCase();
      return haystack.includes(value.toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  function exportCsv() {
    const rows = table.getFilteredRowModel().rows.map((r) => r.original);
    const headers = [
      "Name",
      "Email",
      "Role",
      "Score",
      "Status",
      "City",
      "Experience",
      "Last activity",
    ];
    const body = rows.map((r) =>
      [
        r.name,
        r.email,
        roleMap.get(r.roleId) ?? "",
        r.overallScore.toFixed(1),
        r.status,
        r.city,
        r.experienceYears.toFixed(1),
        r.lastActivityAt,
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[headers.join(","), ...body].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} candidates`);
  }

  return (
    <div className="space-y-3">
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2">
          <span className="text-sm">
            <span className="font-medium tabular">{selectedCount}</span>{" "}
            selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.success(`Moved ${selectedCount} to shortlist`)}
          >
            Shortlist
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              toast.success(`${selectedCount} candidates rejected`)
            }
          >
            Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead className="bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground first:pl-4 last:pr-4"
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  No candidates match your filters.
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-2.5 first:pl-4 last:pr-4"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground tabular">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {Math.max(1, table.getPageCount())} ·{" "}
          {table.getFilteredRowModel().rows.length} candidates
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            className="gap-1.5"
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  column,
  children,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {children}
      <ArrowUpDown className="size-3 opacity-60" />
    </button>
  );
}
