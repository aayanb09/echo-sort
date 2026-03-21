import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  missingSupabaseConfigMessage,
} from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, Radio, Lock, AlertTriangle } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const checkAuth = async () => {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) navigate("/dashboard");
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Call Analysis Platform</h1>
              <p className="text-sm text-muted-foreground">Law Enforcement Communication Intelligence</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-4xl w-full space-y-12">
          {/* Mission Statement */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
              <Radio className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
              Intelligent Call Analysis<br />
              <span className="text-primary">For Law Enforcement</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Automatically transcribe, analyze, and sort emergency calls with AI-powered urgency detection,
              sentiment analysis, and keyword extraction.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Urgency Detection</h3>
              <p className="text-sm text-muted-foreground">
                AI automatically identifies high-priority calls requiring immediate attention.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Radio className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Smart Transcription</h3>
              <p className="text-sm text-muted-foreground">
                AI-powered transcription converts audio to searchable text with high accuracy.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Secure & Compliant</h3>
              <p className="text-sm text-muted-foreground">
                Role-based access control with full audit logging for every action.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center space-y-4">
            <Button
              onClick={() => navigate("/auth")}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6"
              disabled={!isSupabaseConfigured}
            >
              <Shield className="w-5 h-5 mr-2" />
              Access Platform
            </Button>
            <p className="text-sm text-muted-foreground">
              {isSupabaseConfigured
                ? "Authorized personnel only • All access monitored"
                : missingSupabaseConfigMessage}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Secure Law Enforcement Platform • All data encrypted in transit and at rest</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
