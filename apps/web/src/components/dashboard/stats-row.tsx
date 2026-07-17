import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DASHBOARD_STATS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function StatsRow() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {DASHBOARD_STATS.map((stat) => (
        <Card key={stat.id}>
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">{stat.value}</p>
            {stat.delta && (
              <p
                className={cn(
                  "mt-1 flex items-center gap-1 text-xs font-medium",
                  stat.trend === "up" && "text-success",
                  stat.trend === "down" && "text-destructive"
                )}
              >
                {stat.trend === "up" && <TrendingUp className="h-3 w-3" />}
                {stat.trend === "down" && <TrendingDown className="h-3 w-3" />}
                {stat.delta}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
