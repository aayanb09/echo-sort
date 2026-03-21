import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  missingSupabaseConfigMessage,
} from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Lock } from "lucide-react";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const checkSession = async () => {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) navigate("/dashboard");
    };
    checkSession();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`
          }
        });

        if (error) throw error;

        if (data.session) {
          toast.success("Account created successfully! Logging you in...");
          navigate("/dashboard");
        } else {
          toast.success("Account created. Please check your email to confirm, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast.success("Logged in successfully");
        navigate("/dashboard");
      }
    } catch (error) {
      if (getErrorMessage(error, "") === "Invalid login credentials") {
        toast.error("Invalid login credentials. If you're sure they're correct, verify you're on the correct Supabase project.");
      } else {
        toast.error(getErrorMessage(error, "Authentication failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-primary/10 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Call Analysis Platform
          </h1>
          <p className="text-muted-foreground">
            Secure law enforcement communication system
          </p>
        </div>

        <Card className="p-6 bg-card border-border">
          <form onSubmit={handleAuth} className="space-y-4">
            {!isSupabaseConfigured && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {missingSupabaseConfigMessage}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="officer@department.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background border-border text-foreground"
                disabled={!isSupabaseConfigured}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background border-border text-foreground"
                disabled={!isSupabaseConfigured}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={loading || !isSupabaseConfigured}
            >
              <Lock className="w-4 h-4 mr-2" />
              {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
            </Button>

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary hover:underline"
                disabled={!isSupabaseConfigured}
              >
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Need an account? Sign up"}
              </button>
            </div>
          </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Authorized personnel only. All access is monitored and logged.
        </p>
      </div>
    </div>
  );
};

export default Auth;
