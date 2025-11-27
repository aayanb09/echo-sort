-- Add anomaly detection and sort priority columns to analyses
ALTER TABLE public.analyses
ADD COLUMN IF NOT EXISTS anomaly_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sort_priority INTEGER DEFAULT 50;

COMMENT ON COLUMN public.analyses.anomaly_detected IS 'Flag marking the call as anomalous or unusual';
COMMENT ON COLUMN public.analyses.sort_priority IS 'Numeric priority (0-100) used to sort calls for triage; higher means higher priority';
