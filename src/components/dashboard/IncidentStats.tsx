import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface IncidentStat {
  incident_type: string;
  count: number;
  percentage: number;
}

interface StatsResponse {
  stats: IncidentStat[];
  total: number;
  lastUpdated: string;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function IncidentStats() {
  const [stats, setStats] = useState<IncidentStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchStats = async (showRefreshToast = false) => {
    try {
      if (showRefreshToast) setRefreshing(true);
      
      const { data, error } = await supabase.functions.invoke<StatsResponse>("get-incident-stats");

      if (error) {
        console.error("Error fetching stats:", error);
        toast.error("Failed to load incident statistics");
        return;
      }

      if (data) {
        setStats(data.stats);
        setTotal(data.total);
        setLastUpdated(data.lastUpdated);
        if (showRefreshToast) toast.success("Statistics refreshed");
      }
    } catch (err) {
      console.error("Error:", err);
      toast.error("Failed to load incident statistics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Set up realtime subscription for analyses table
    const channel = supabase
      .channel("analyses-stats")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "analyses",
        },
        () => {
          console.log("Analyses changed, refreshing stats...");
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Incident Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Incident Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p>No incident data available</p>
            <p className="text-sm">Upload and analyze calls to see statistics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Incident Statistics
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {total} total incidents analyzed
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchStats(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stats.map((stat, index) => (
            <div key={stat.incident_type} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="font-medium capitalize">
                    {stat.incident_type.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{stat.count}</Badge>
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {stat.percentage}%
                  </span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${stat.percentage}%`,
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {lastUpdated && (
          <p className="text-xs text-muted-foreground mt-4 text-right">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
