import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface IncidentData {
  name: string;
  count: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--warning))",
  "hsl(var(--success))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
];

export const IncidentChart = () => {
  const [data, setData] = useState<IncidentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIncidentData = async () => {
      try {
        const { data: analyses, error } = await supabase
          .from("analyses")
          .select("incident_type");

        if (error) throw error;

        // Count incidents by type
        const incidentCounts: Record<string, number> = {};
        analyses?.forEach((analysis) => {
          const type = analysis.incident_type || "unknown";
          const formattedType = type
            .split("_")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          incidentCounts[formattedType] = (incidentCounts[formattedType] || 0) + 1;
        });

        // Convert to array and sort by count
        const chartData = Object.entries(incidentCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        setData(chartData);
      } catch (error) {
        console.error("Error fetching incident data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidentData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("analyses-chart")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "analyses",
        },
        () => {
          fetchIncidentData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center text-muted-foreground">Loading chart...</div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Incident Analytics</h2>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          No incident data available yet. Upload and process calls to see analytics.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Incident Analytics</h2>
      </div>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              type="number" 
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
              width={90}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value: number) => [`${value} call${value !== 1 ? 's' : ''}`, 'Count']}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
