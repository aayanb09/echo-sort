-- Add missing columns to analyses table
ALTER TABLE public.analyses 
ADD COLUMN IF NOT EXISTS anomaly_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sort_priority INTEGER DEFAULT 50;