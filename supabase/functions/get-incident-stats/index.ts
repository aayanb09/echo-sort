import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IncidentStats {
  incident_type: string;
  count: number;
  percentage: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting incident stats aggregation...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all analyses with incident_type
    const { data: analyses, error } = await supabase
      .from("analyses")
      .select("incident_type")
      .not("incident_type", "is", null);

    if (error) {
      console.error("Error fetching analyses:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(`Found ${analyses?.length || 0} analyses with incident types`);

    // Aggregate counts by incident type
    const incidentCounts: Record<string, number> = {};
    let totalCount = 0;

    for (const analysis of analyses || []) {
      const type = analysis.incident_type || "Unknown";
      incidentCounts[type] = (incidentCounts[type] || 0) + 1;
      totalCount++;
    }

    // Convert to array with percentages, sorted by count descending
    const stats: IncidentStats[] = Object.entries(incidentCounts)
      .map(([incident_type, count]) => ({
        incident_type,
        count,
        percentage: totalCount > 0 ? Math.round((count / totalCount) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    console.log("Incident statistics:", JSON.stringify(stats, null, 2));

    return new Response(
      JSON.stringify({
        stats,
        total: totalCount,
        lastUpdated: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in get-incident-stats:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
