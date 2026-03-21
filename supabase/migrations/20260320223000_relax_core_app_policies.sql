-- Make the core app flow depend on authenticated ownership instead of custom roles.

-- Calls: users should be able to manage their own records throughout processing.
DROP POLICY IF EXISTS "Officers can upload calls" ON public.calls;
DROP POLICY IF EXISTS "Admins can update calls" ON public.calls;
DROP POLICY IF EXISTS "Users can delete their own calls" ON public.calls;

CREATE POLICY "Users can insert their own calls"
ON public.calls
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calls"
ON public.calls
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calls"
ON public.calls
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Transcripts and analyses: allow inserts only when the linked call belongs to the user.
DROP POLICY IF EXISTS "Officers can insert transcripts" ON public.transcripts;
DROP POLICY IF EXISTS "Officers can insert analyses" ON public.analyses;

CREATE POLICY "Users can insert transcripts for their own calls"
ON public.transcripts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.calls
    WHERE calls.id = transcripts.call_id
      AND calls.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert analyses for their own calls"
ON public.analyses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.calls
    WHERE calls.id = analyses.call_id
      AND calls.user_id = auth.uid()
  )
);

-- Storage: scope access to the authenticated user's own folder.
DROP POLICY IF EXISTS "Officers can upload recordings" ON storage.objects;
DROP POLICY IF EXISTS "Officers can view recordings" ON storage.objects;
DROP POLICY IF EXISTS "Officers can upload call recordings" ON storage.objects;
DROP POLICY IF EXISTS "Officers can view their own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete recordings" ON storage.objects;

CREATE POLICY "Users can upload their own recordings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own recordings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
