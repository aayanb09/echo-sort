-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Officers can upload call recordings" ON storage.objects;
DROP POLICY IF EXISTS "Officers can view their own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete recordings" ON storage.objects;

-- Add storage policies for call-recordings bucket
CREATE POLICY "Officers can upload call recordings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'call-recordings' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  (has_role(auth.uid(), 'officer'::app_role) OR 
   has_role(auth.uid(), 'supervisor'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Officers can view their own recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'call-recordings' AND
  (has_role(auth.uid(), 'officer'::app_role) OR 
   has_role(auth.uid(), 'supervisor'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Admins can delete recordings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'call-recordings' AND
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create trigger function to auto-assign officer role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'officer'::app_role);
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update analyses table with new classification fields
ALTER TABLE public.analyses
ADD COLUMN IF NOT EXISTS incident_type TEXT,
ADD COLUMN IF NOT EXISTS risk_category TEXT,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
ADD COLUMN IF NOT EXISTS flagged_terms TEXT[];

-- Update analyses table comment
COMMENT ON TABLE public.analyses IS 'Stores AI-powered analysis results for call recordings including incident classification, risk assessment, and flagged terms';