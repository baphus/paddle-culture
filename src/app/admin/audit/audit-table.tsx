"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { buildColumns, type AuditRow } from "./columns";

export default function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [withDiff, setWithDiff] = useState(false);
  const columns = useMemo(() => buildColumns(withDiff), [withDiff]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setWithDiff((v) => !v)}
        >
          {withDiff ? "Hide before/after" : "Show before/after"}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        placeholder="Search actor, entity, ID…"
        pageSize={25}
      />
    </div>
  );
}
