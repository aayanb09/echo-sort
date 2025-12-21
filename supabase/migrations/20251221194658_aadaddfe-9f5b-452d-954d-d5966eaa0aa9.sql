-- Allow authenticated users with proper roles to insert analyses
CREATE POLICY "Officers can insert analyses"
ON public.analyses
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'officer'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Allow authenticated users with proper roles to insert transcripts
CREATE POLICY "Officers can insert transcripts"
ON public.transcripts
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'officer'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);