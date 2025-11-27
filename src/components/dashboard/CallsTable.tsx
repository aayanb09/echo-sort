import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, Play, Trash2, Download, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface Call {
  id: string;
  filename: string;
  status: string;
  uploaded_at: string;
  processed_at: string | null;
  analyses?: {
    incident_type: string;
    urgency_level: string;
    urgency_score: number;
    risk_category: string;
    anomaly_detected?: boolean;
    sort_priority?: number;
    sentiment: string;
    keywords: string[];
    emotional_tone: string;
    confidence_score: number;
    flagged_terms: string[];
  }[];
}

export const CallsTable = () => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const fetchCalls = async () => {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select(`
          id,
          filename,
          status,
          uploaded_at,
          processed_at,
          analyses (
            incident_type,
            urgency_level,
            urgency_score,
            risk_category,
            anomaly_detected,
            sort_priority,
            sentiment,
            keywords,
            emotional_tone,
            confidence_score,
            flagged_terms
          )
        `)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setCalls(data || []);
    } catch (error: any) {
      console.error('Error fetching calls:', error);
      toast.error("Failed to load calls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();

    // Set up realtime subscription
    const channel = supabase
      .channel('calls-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls'
        },
        () => {
          fetchCalls();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const processCall = async (callId: string) => {
    setProcessing(prev => new Set(prev).add(callId));
    
    try {
      const { error } = await supabase.functions.invoke('process-call', {
        body: { callId }
      });

      if (error) throw error;
      toast.success("Processing started");
    } catch (error: any) {
      console.error('Processing error:', error);
      toast.error(error.message || "Failed to process call");
    } finally {
      setProcessing(prev => {
        const next = new Set(prev);
        next.delete(callId);
        return next;
      });
    }
  };

  const deleteCall = async (callId: string) => {
    try {
      const { error } = await supabase
        .from('calls')
        .delete()
        .eq('id', callId);

      if (error) throw error;
      toast.success("Call deleted");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete call");
    }
  };

  const getUrgencyColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-warning text-black';
      case 'medium': return 'bg-primary text-primary-foreground';
      default: return 'bg-success text-white';
    }
  };

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center text-muted-foreground">Loading calls...</div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Call Records</h2>
        </div>
        <Button
          onClick={fetchCalls}
          variant="outline"
          size="sm"
          className="border-border"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {calls.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No calls uploaded yet. Upload audio files to get started.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 font-medium text-muted-foreground">Filename</th>
                <th className="pb-3 font-medium text-muted-foreground">Status</th>
                <th className="pb-3 font-medium text-muted-foreground">Incident</th>
                <th className="pb-3 font-medium text-muted-foreground">Urgency</th>
                <th className="pb-3 font-medium text-muted-foreground">Risk</th>
                <th className="pb-3 font-medium text-muted-foreground">Flagged Terms</th>
                <th className="pb-3 font-medium text-muted-foreground">Anomaly</th>
                <th className="pb-3 font-medium text-muted-foreground">Priority</th>
                <th className="pb-3 font-medium text-muted-foreground">Confidence</th>
                <th className="pb-3 font-medium text-muted-foreground">Uploaded</th>
                <th className="pb-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-b border-border/50">
                  <td className="py-3 text-foreground">{call.filename}</td>
                  <td className="py-3">
                    <Badge 
                      variant="outline" 
                      className={`border-border ${
                        call.status === 'processing' ? 'animate-pulse' : ''
                      }`}
                    >
                      {call.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      <span className="capitalize">{call.analyses[0].incident_type}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 text-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      call.analyses[0].anomaly_detected ? (
                        <Badge variant="destructive">Anomalous</Badge>
                      ) : (
                        <Badge variant="secondary">Normal</Badge>
                      )
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 text-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      <span>{call.analyses[0].sort_priority ?? '-'}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3">
                    {call.analyses && call.analyses.length > 0 ? (
                      <Badge className={getUrgencyColor(call.analyses[0].urgency_level)}>
                        {call.analyses[0].urgency_level}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 text-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      <span className="capitalize">{call.analyses[0].risk_category}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 text-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      <span className="text-sm">
                        {call.analyses[0].flagged_terms?.slice(0, 3).join(', ') || '-'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      <span>{call.analyses[0].confidence_score}%</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {format(new Date(call.uploaded_at), 'MMM dd, HH:mm')}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      {call.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => processCall(call.id)}
                          disabled={processing.has(call.id)}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
