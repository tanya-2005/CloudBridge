import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { api, type BackendMigrationJob } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import type { DashboardStat } from "@/types";

function computeStats(jobs: BackendMigrationJob[]): DashboardStat[] {
  const finished = jobs.filter(
    (j) => j.status === "COMPLETED" || j.status === "COMPLETED_WITH_ERRORS" || j.status === "FAILED"
  );
  const completed = jobs.filter((j) => j.status === "COMPLETED").length;
  const filesTransferred = jobs
    .filter((j) => j.status === "COMPLETED" || j.status === "COMPLETED_WITH_ERRORS")
    .reduce((sum, j) => sum + j.totalFiles, 0);
  const dataMoved = jobs.reduce((sum, j) => sum + j.transferredBytes, 0);
  const successRate = finished.length > 0 ? Math.round((completed / finished.length) * 100) : null;

  return [
    { id: "migrations", label: "Total Migrations", value: String(jobs.length) },
    { id: "files", label: "Files Transferred", value: String(filesTransferred) },
    { id: "data", label: "Data Moved", value: formatBytes(dataMoved) },
    { id: "success", label: "Success Rate", value: successRate === null ? "—" : `${successRate}%` },
  ];
}

export function StatsRow() {
  const [stats, setStats] = useState<DashboardStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listMigrations()
      .then((jobs) => {
        if (!cancelled) setStats(computeStats(jobs));
      })
      .catch((err) => {
        console.error("Failed to load migration stats:", err);
        if (!cancelled) setStats(computeStats([]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {(stats ?? Array.from({ length: 4 })).map((stat, i) => (
        <Card key={stat && "id" in stat ? stat.id : i}>
          <CardContent className="p-4 sm:p-5">
            {stat ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">{stat.value}</p>
              </>
            ) : (
              <div className="h-[52px] animate-pulse rounded bg-muted" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
