import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BarChart3, Clock3, Users, MapPinned } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";

interface IncidentData {
  name: string;
  count: number;
}

interface UrgencyData {
  name: string;
  count: number;
}

interface ShiftData {
  name: string;
  calls: number;
  workload: number;
  avgResponseMinutes: number;
}

interface BeatData {
  beat: string;
  calls: number;
  workload: number;
  dayCalls: number;
  nightCalls: number;
}

interface HourlyData {
  hour: string;
  calls: number;
  avgPriority: number;
}

interface AnalyticsRow {
  incident_type: string | null;
  urgency_level: string;
  urgency_score: number | null;
  sort_priority: number | null;
  risk_category: string | null;
  anomaly_detected: boolean | null;
  keywords: string[] | null;
  topics: string[] | null;
  summary: string | null;
  calls: {
    id: string;
    user_id: string;
    uploaded_at: string;
    processed_at: string | null;
    filename: string;
  };
}

interface UnassignedCall {
  callId: string;
  filename: string;
  incidentType: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--warning))",
  "hsl(var(--success))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
];

const URGENCY_COLOR_MAP: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--primary))",
  low: "hsl(var(--success))",
};

const urgencyMultiplier: Record<string, number> = {
  low: 1,
  medium: 1.6,
  high: 2.3,
  critical: 3.1,
};

const toTitleCase = (value: string) =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const getShift = (timestamp: string) => {
  const hour = new Date(timestamp).getHours();
  return hour >= 7 && hour < 19 ? "Day Shift" : "Night Shift";
};

const getProcessingMinutes = (uploadedAt: string, processedAt: string | null) => {
  if (!processedAt) return null;
  const diff = new Date(processedAt).getTime() - new Date(uploadedAt).getTime();
  if (diff <= 0) return null;
  return diff / 60000;
};

const extractBeatNumber = (row: AnalyticsRow) => {
  const merged = [
    row.calls.filename,
    row.summary || "",
    (row.keywords || []).join(" "),
    (row.topics || []).join(" "),
  ].join(" ");

  const patterns = [
    /\b(?:beat|district|zone|sector|precinct)\s*[-#: ]?\s*([1-8])\b/i,
    /\b([1-8])\s*(?:beat|district|zone|sector|precinct)\b/i,
    /\bb(?:eat)?[-_ ]?([1-8])\b/i,
  ];

  for (const pattern of patterns) {
    const match = merged.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  return null;
};

const getWorkloadScore = (row: AnalyticsRow) => {
  const urgency = (row.urgency_level || "medium").toLowerCase();
  const urgencyScore = row.urgency_score ?? 50;
  const sortPriority = row.sort_priority ?? 50;
  const base = (urgencyScore * 0.55 + sortPriority * 0.45) / 10;
  const risk = (row.risk_category || "").toLowerCase();
  const riskBoost = risk.includes("emergency") ? 2 : risk.includes("safety") ? 1.2 : 0.4;
  const anomalyBoost = row.anomaly_detected ? 1.3 : 0;
  return base * (urgencyMultiplier[urgency] || urgencyMultiplier.medium) + riskBoost + anomalyBoost;
};

const BEAT_ASSIGNMENT_STORAGE_KEY = "cobra-manual-beat-assignments";

export const IncidentChart = () => {
  const [incidentData, setIncidentData] = useState<IncidentData[]>([]);
  const [urgencyData, setUrgencyData] = useState<UrgencyData[]>([]);
  const [shiftData, setShiftData] = useState<ShiftData[]>([]);
  const [beatData, setBeatData] = useState<BeatData[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [highUrgencyCalls, setHighUrgencyCalls] = useState(0);
  const [avgResponseMinutes, setAvgResponseMinutes] = useState(0);
  const [unassignedBeatCalls, setUnassignedBeatCalls] = useState(0);
  const [dayStaffingShare, setDayStaffingShare] = useState(50);
  const [nightStaffingShare, setNightStaffingShare] = useState(50);
  const [imbalanceIndex, setImbalanceIndex] = useState(0);
  const [manualBeatAssignments, setManualBeatAssignments] = useState<Record<string, number>>({});
  const [unassignedCalls, setUnassignedCalls] = useState<UnassignedCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BEAT_ASSIGNMENT_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, number>;
      if (parsed && typeof parsed === "object") {
        setManualBeatAssignments(parsed);
      }
    } catch (error) {
      console.error("Failed to load manual beat assignments:", error);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const fetchIncidentData = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: analyses, error } = await supabase
          .from("analyses")
          .select(`
            incident_type,
            urgency_level,
            urgency_score,
            sort_priority,
            risk_category,
            anomaly_detected,
            keywords,
            topics,
            summary,
            calls!inner(
              id,
              user_id,
              uploaded_at,
              processed_at,
              filename
            )
          `)
          .eq('calls.user_id', user.id);

        if (error) throw error;

        const rows = (analyses || []) as unknown as AnalyticsRow[];

        if (rows.length === 0) {
          setIncidentData([]);
          setUrgencyData([]);
          setShiftData([]);
          setBeatData([]);
          setHourlyData([]);
          setTotalCalls(0);
          setHighUrgencyCalls(0);
          setAvgResponseMinutes(0);
          setUnassignedBeatCalls(0);
          setDayStaffingShare(50);
          setNightStaffingShare(50);
          setImbalanceIndex(0);
          return;
        }

        const incidentCounts: Record<string, number> = {};
        const urgencyCounts: Record<string, number> = {};
        const shiftRollup: Record<string, { calls: number; workload: number; responseTotal: number; responseCount: number }> = {
          "Day Shift": { calls: 0, workload: 0, responseTotal: 0, responseCount: 0 },
          "Night Shift": { calls: 0, workload: 0, responseTotal: 0, responseCount: 0 },
        };
        const beatRollup = Array.from({ length: 8 }, (_, index) => ({
          beat: `Beat ${index + 1}`,
          calls: 0,
          workload: 0,
          dayCalls: 0,
          nightCalls: 0,
        }));
        const hourRollup = Array.from({ length: 24 }, (_, hour) => ({
          hour,
          calls: 0,
          priorityTotal: 0,
        }));

        let responseTotal = 0;
        let responseCount = 0;
        let highUrgencyCount = 0;
        let dayWorkload = 0;
        let nightWorkload = 0;
        let unassignedCount = 0;
        const unassignedList: UnassignedCall[] = [];

        rows.forEach((row) => {
          const type = row.incident_type || "unknown";
          const formattedType = toTitleCase(type);
          incidentCounts[formattedType] = (incidentCounts[formattedType] || 0) + 1;

          const urgency = (row.urgency_level || "medium").toLowerCase();
          const urgencyLabel = urgency.charAt(0).toUpperCase() + urgency.slice(1);
          urgencyCounts[urgencyLabel] = (urgencyCounts[urgencyLabel] || 0) + 1;
          if (urgency === "high" || urgency === "critical") highUrgencyCount += 1;

          const workload = getWorkloadScore(row);
          const shift = getShift(row.calls.uploaded_at);
          shiftRollup[shift].calls += 1;
          shiftRollup[shift].workload += workload;
          if (shift === "Day Shift") dayWorkload += workload;
          if (shift === "Night Shift") nightWorkload += workload;

          const responseMinutes = getProcessingMinutes(row.calls.uploaded_at, row.calls.processed_at);
          if (responseMinutes !== null) {
            responseTotal += responseMinutes;
            responseCount += 1;
            shiftRollup[shift].responseTotal += responseMinutes;
            shiftRollup[shift].responseCount += 1;
          }

          const uploadedHour = new Date(row.calls.uploaded_at).getHours();
          const priority = ((row.urgency_score ?? 50) + (row.sort_priority ?? 50)) / 2;
          hourRollup[uploadedHour].calls += 1;
          hourRollup[uploadedHour].priorityTotal += priority;

          const beatNumber = manualBeatAssignments[row.calls.id] ?? extractBeatNumber(row);
          if (beatNumber && beatNumber >= 1 && beatNumber <= 8) {
            const beat = beatRollup[beatNumber - 1];
            beat.calls += 1;
            beat.workload += workload;
            if (shift === "Day Shift") beat.dayCalls += 1;
            if (shift === "Night Shift") beat.nightCalls += 1;
          } else {
            unassignedCount += 1;
            unassignedList.push({
              callId: row.calls.id,
              filename: row.calls.filename,
              incidentType: toTitleCase(row.incident_type || "unknown"),
            });
          }
        });

        const incidentChartData = Object.entries(incidentCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        const urgencyChartData = Object.entries(urgencyCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        const shiftChartData = Object.entries(shiftRollup).map(([name, values]) => ({
          name,
          calls: values.calls,
          workload: Number(values.workload.toFixed(1)),
          avgResponseMinutes: values.responseCount > 0
            ? Number((values.responseTotal / values.responseCount).toFixed(1))
            : 0,
        }));

        const beatChartData = beatRollup
          .map((beat) => ({
            ...beat,
            workload: Number(beat.workload.toFixed(1)),
          }))
          .sort((a, b) => b.workload - a.workload);

        const hourlyChartData = hourRollup.map((hour) => ({
          hour: `${String(hour.hour).padStart(2, "0")}:00`,
          calls: hour.calls,
          avgPriority: hour.calls > 0 ? Number((hour.priorityTotal / hour.calls).toFixed(1)) : 0,
        }));

        const totalWorkload = dayWorkload + nightWorkload;
        const dayShare = totalWorkload > 0 ? Math.round((dayWorkload / totalWorkload) * 100) : 50;
        const nightShare = 100 - dayShare;

        const beatWorkloads = beatRollup.filter((beat) => beat.calls > 0).map((beat) => beat.workload);
        const meanWorkload = beatWorkloads.length > 0
          ? beatWorkloads.reduce((sum, value) => sum + value, 0) / beatWorkloads.length
          : 0;
        const variance = beatWorkloads.length > 0
          ? beatWorkloads.reduce((sum, value) => sum + (value - meanWorkload) ** 2, 0) / beatWorkloads.length
          : 0;
        const coeffVariation = meanWorkload > 0 ? (Math.sqrt(variance) / meanWorkload) * 100 : 0;

        setIncidentData(incidentChartData);
        setUrgencyData(urgencyChartData);
        setShiftData(shiftChartData);
        setBeatData(beatChartData);
        setHourlyData(hourlyChartData);
        setTotalCalls(rows.length);
        setHighUrgencyCalls(highUrgencyCount);
        setAvgResponseMinutes(responseCount > 0 ? Number((responseTotal / responseCount).toFixed(1)) : 0);
        setUnassignedBeatCalls(unassignedCount);
        setDayStaffingShare(dayShare);
        setNightStaffingShare(nightShare);
        setImbalanceIndex(Number(coeffVariation.toFixed(1)));
        setUnassignedCalls(unassignedList);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
        },
        () => {
          fetchIncidentData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [manualBeatAssignments]);

  const assignBeatToCall = (callId: string, beat: number | null) => {
    setManualBeatAssignments((prev) => {
      const next = { ...prev };
      if (beat === null) {
        delete next[callId];
      } else {
        next[callId] = beat;
      }
      localStorage.setItem(BEAT_ASSIGNMENT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center text-muted-foreground">Loading analytics...</div>
      </Card>
    );
  }

  if (incidentData.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Operations Analytics</h2>
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
        <h2 className="text-xl font-bold text-foreground">Operations Analytics</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
        <Card className="p-4 border-border bg-background/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-muted-foreground">Total Calls Analyzed</span>
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-semibold text-foreground">{totalCalls}</p>
        </Card>
        <Card className="p-4 border-border bg-background/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-muted-foreground">High/Critical Calls</span>
            <Users className="h-4 w-4 text-warning" />
          </div>
          <p className="text-2xl font-semibold text-foreground">{highUrgencyCalls}</p>
        </Card>
        <Card className="p-4 border-border bg-background/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-muted-foreground">Avg Response Proxy</span>
            <Clock3 className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-semibold text-foreground">{avgResponseMinutes} min</p>
        </Card>
        <Card className="p-4 border-border bg-background/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-muted-foreground">Beat Workload Imbalance</span>
            <MapPinned className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-2xl font-semibold text-foreground">{imbalanceIndex}%</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-4 border-border bg-background/40">
          <h3 className="text-base font-semibold text-foreground mb-3">Incident Frequency</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={incidentData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 110, bottom: 5 }}
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
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--foreground))",
                  }}
                  formatter={(value: number) => [`${value} call${value !== 1 ? "s" : ""}`, "Count"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {incidentData.map((_, index) => (
                    <Cell key={`incident-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 border-border bg-background/40">
          <h3 className="text-base font-semibold text-foreground mb-3">Urgency Mix</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={urgencyData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  label={({ name, count }) => `${name}: ${count}`}
                >
                  {urgencyData.map((entry) => (
                    <Cell
                      key={`urgency-${entry.name}`}
                      fill={URGENCY_COLOR_MAP[entry.name.toLowerCase()] || "hsl(var(--primary))"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 border-border bg-background/40">
          <h3 className="text-base font-semibold text-foreground mb-3">Shift Staffing Pressure</h3>
          <div className="flex gap-2 mb-3">
            <Badge variant="secondary">Recommended Day Staffing: {dayStaffingShare}%</Badge>
            <Badge variant="secondary">Recommended Night Staffing: {nightStaffingShare}%</Badge>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={shiftData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--foreground))" }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="workload" fill="hsl(var(--primary))" name="Workload Score" />
                <Line
                  yAxisId="right"
                  dataKey="avgResponseMinutes"
                  stroke="hsl(var(--warning))"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="Avg Response (min)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 border-border bg-background/40">
          <h3 className="text-base font-semibold text-foreground mb-3">Hourly Load & Priority</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} interval={2} />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="calls"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Call Volume"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgPriority"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  name="Avg Priority"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4 border-border bg-background/40 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold text-foreground">Beat Workload & Shift Distribution</h3>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-auto py-1 px-2">
                <Badge variant="outline" className="cursor-pointer">
                  Calls without beat marker: {unassignedBeatCalls}
                </Badge>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Assign Calls to Beats</DialogTitle>
              </DialogHeader>
              {unassignedCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All calls already have a beat marker or manual assignment.
                </p>
              ) : (
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="py-2 pr-2 text-muted-foreground font-medium">Filename</th>
                        <th className="py-2 pr-2 text-muted-foreground font-medium">Incident</th>
                        <th className="py-2 text-muted-foreground font-medium">Assign Beat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedCalls.map((call) => (
                        <tr key={call.callId} className="border-b border-border/60">
                          <td className="py-2 pr-2 text-foreground">{call.filename}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{call.incidentType}</td>
                          <td className="py-2">
                            <select
                              className="bg-background border border-border rounded-md px-2 py-1 text-foreground"
                              defaultValue=""
                              onChange={(event) => {
                                const value = event.target.value;
                                assignBeatToCall(call.callId, value ? Number(value) : null);
                              }}
                            >
                              <option value="">Select Beat</option>
                              <option value="1">Beat 1</option>
                              <option value="2">Beat 2</option>
                              <option value="3">Beat 3</option>
                              <option value="4">Beat 4</option>
                              <option value="5">Beat 5</option>
                              <option value="6">Beat 6</option>
                              <option value="7">Beat 7</option>
                              <option value="8">Beat 8</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={beatData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="beat" tick={{ fill: "hsl(var(--foreground))" }} />
              <YAxis
                yAxisId="left"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="dayCalls" stackId="a" fill="hsl(var(--primary))" name="Day Shift Calls" />
              <Bar yAxisId="left" dataKey="nightCalls" stackId="a" fill="hsl(var(--warning))" name="Night Shift Calls" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="workload"
                stroke="hsl(var(--destructive))"
                strokeWidth={3}
                dot={{ r: 3 }}
                name="Workload Score"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </Card>
  );
};
