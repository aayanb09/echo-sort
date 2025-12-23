-- Drop existing SELECT policy on calls table
DROP POLICY IF EXISTS "Officers can view all calls" ON public.calls;

-- Create new policy so users can only see their own calls
CREATE POLICY "Users can view their own calls"
ON public.calls
FOR SELECT
USING (auth.uid() = user_id);

-- Drop the admin-only delete policy and create user delete policy
DROP POLICY IF EXISTS "Admins can delete calls" ON public.calls;

-- Allow users to delete their own calls
CREATE POLICY "Users can delete their own calls"
ON public.calls
FOR DELETE
USING (auth.uid() = user_id);

-- Update analyses view policy to only show analyses for user's own calls
DROP POLICY IF EXISTS "Officers can view all analyses" ON public.analyses;

CREATE POLICY "Users can view analyses for their own calls"
ON public.analyses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.calls 
    WHERE calls.id = analyses.call_id 
    AND calls.user_id = auth.uid()
  )
);

-- Update transcripts view policy to only show transcripts for user's own calls
DROP POLICY IF EXISTS "Officers can view all transcripts" ON public.transcripts;

CREATE POLICY "Users can view transcripts for their own calls"
ON public.transcripts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.calls 
    WHERE calls.id = transcripts.call_id 
    AND calls.user_id = auth.uid()
  )
);