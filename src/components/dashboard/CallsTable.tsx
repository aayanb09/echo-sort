import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, Trash2, Download, RefreshCw, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Analysis {
  incident_type: string;
  urgency_level: string;
  urgency_score: number;
  risk_category: string;
  anomaly_detected?: boolean;
  sort_priority?: number;
  sentiment: string;
  sentiment_score?: number;
  keywords: string[];
  topics?: string[];
  emotional_tone: string;
  confidence_score: number;
  flagged_terms: string[];
  summary?: string;
}

interface Transcript {
  transcript_text: string;
}

interface Call {
  id: string;
  filename: string;
  status: string;
  uploaded_at: string;
  processed_at: string | null;
  analyses?: Analysis[];
  transcripts?: Transcript[];
}

export const CallsTable = () => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

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
            sentiment_score,
            keywords,
            topics,
            emotional_tone,
            confidence_score,
            flagged_terms,
            summary
          ),
          transcripts (
            transcript_text
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

    // Set up realtime subscriptions for both calls and analyses
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
          console.log('Calls table changed, refreshing...');
          fetchCalls();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'analyses'
        },
        () => {
          console.log('Analyses table changed, refreshing...');
          fetchCalls();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  const downloadResults = (call: Call) => {
    const analysis = call.analyses?.[0];
    const transcript = call.transcripts?.[0];
    
    const results = {
      filename: call.filename,
      uploaded_at: call.uploaded_at,
      processed_at: call.processed_at,
      status: call.status,
      transcript: transcript?.transcript_text || null,
      analysis: analysis ? {
        incident_type: analysis.incident_type,
        urgency_level: analysis.urgency_level,
        urgency_score: analysis.urgency_score,
        risk_category: analysis.risk_category,
        anomaly_detected: analysis.anomaly_detected,
        sort_priority: analysis.sort_priority,
        sentiment: analysis.sentiment,
        sentiment_score: analysis.sentiment_score,
        keywords: analysis.keywords,
        topics: analysis.topics,
        emotional_tone: analysis.emotional_tone,
        confidence_score: analysis.confidence_score,
        flagged_terms: analysis.flagged_terms,
        summary: analysis.summary
      } : null
    };

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${call.filename.replace(/\.[^/.]+$/, '')}-analysis.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Results downloaded");
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

  const getDisplayStatus = (call: Call) => {
    if (call.analyses && call.analyses.length > 0) {
      return 'completed';
    }
    return call.status;
  };

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Call Records</h2>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-border">
                <HelpCircle className="w-4 h-4 mr-2" />
                Legend
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Metric Definitions</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-semibold text-foreground">Urgency Level</h4>
                  <p className="text-muted-foreground">Critical = Immediate response needed, High = Urgent attention, Medium = Standard priority, Low = Routine matter</p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Priority Score (0-100)</h4>
                  <p className="text-muted-foreground">Higher scores indicate calls that should be processed first. 80+ = Critical, 60-79 = High, 40-59 = Medium, 0-39 = Low</p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Risk Category</h4>
                  <p className="text-muted-foreground">Safety Threat = Potential danger, Emergency Response = Requires dispatch, Routine Inquiry = Standard question, Administrative = Non-urgent matter</p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Confidence Score</h4>
                  <p className="text-muted-foreground">AI's certainty in the analysis. 90%+ = High confidence, 70-89% = Moderate, Below 70% = Review recommended</p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Flagged Terms</h4>
                  <p className="text-muted-foreground">Keywords detected that may indicate urgency, violence, weapons, or medical emergencies</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
                    {(() => {
                      const displayStatus = getDisplayStatus(call);
                      return (
                        <Badge 
                          variant="outline" 
                          className={`border-border ${
                            displayStatus === 'processing' ? 'animate-pulse' : ''
                          } ${displayStatus === 'completed' ? 'border-success text-success' : ''}`}
                        >
                          {displayStatus}
                        </Badge>
                      );
                    })()}
                  </td>
                  <td className="py-3 text-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      <span className="capitalize">{call.analyses[0].incident_type}</span>
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
                  <td className="py-3 text-foreground">
                    {call.analyses && call.analyses.length > 0 ? (
                      <span>{call.analyses[0].sort_priority ?? '-'}</span>
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
                      {call.analyses && call.analyses.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => downloadResults(call)}
                          className="text-primary hover:text-primary hover:bg-primary/10"
                          title="Download results"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCall(call.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Delete call"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
