-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'officer', 'supervisor');

-- Create user_roles table for role-based access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'officer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create calls table
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  file_size_bytes BIGINT
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- RLS policies for calls
CREATE POLICY "Officers can view all calls"
  ON public.calls FOR SELECT
  USING (
    public.has_role(auth.uid(), 'officer') OR 
    public.has_role(auth.uid(), 'supervisor') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Officers can upload calls"
  ON public.calls FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND 
    (public.has_role(auth.uid(), 'officer') OR 
     public.has_role(auth.uid(), 'supervisor') OR 
     public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Admins can update calls"
  ON public.calls FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete calls"
  ON public.calls FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Create transcripts table
CREATE TABLE public.transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE NOT NULL,
  transcript_text TEXT NOT NULL,
  language TEXT,
  confidence_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers can view all transcripts"
  ON public.transcripts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'officer') OR 
    public.has_role(auth.uid(), 'supervisor') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Create analyses table
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE NOT NULL,
  urgency_level TEXT NOT NULL,
  urgency_score NUMERIC(5,2),
  sentiment TEXT,
  sentiment_score NUMERIC(5,2),
  keywords TEXT[],
  topics TEXT[],
  emotional_tone TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers can view all analyses"
  ON public.analyses FOR SELECT
  USING (
    public.has_role(auth.uid(), 'officer') OR 
    public.has_role(auth.uid(), 'supervisor') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors and admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'supervisor') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Create indexes for performance
CREATE INDEX idx_calls_user_id ON public.calls(user_id);
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_uploaded_at ON public.calls(uploaded_at DESC);
CREATE INDEX idx_transcripts_call_id ON public.transcripts(call_id);
CREATE INDEX idx_analyses_call_id ON public.analyses(call_id);
CREATE INDEX idx_analyses_urgency ON public.analyses(urgency_level);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false);

-- Storage policies for call recordings
CREATE POLICY "Officers can upload recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'call-recordings' AND
    (public.has_role(auth.uid(), 'officer') OR 
     public.has_role(auth.uid(), 'supervisor') OR 
     public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Officers can view recordings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'call-recordings' AND
    (public.has_role(auth.uid(), 'officer') OR 
     public.has_role(auth.uid(), 'supervisor') OR 
     public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Admins can delete recordings"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'call-recordings' AND
    public.has_role(auth.uid(), 'admin')
  );