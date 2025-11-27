#!/usr/bin/env bash
set -euo pipefail

echo "Checking AI integration environment..."

if [ -z "${HUGGING_FACE_API_KEY:-}" ]; then
  echo "WARNING: HUGGING_FACE_API_KEY is not set. The serverless function will fail without a valid key."
else
  echo "HUGGING_FACE_API_KEY is set (redacted)."
fi

echo "Models used by the project:"
echo "  - openai/whisper-large-v2 (transcription)"
echo "  - meta-llama/Llama-2-7b-chat-hf (analysis / anomaly detection)"

echo "If you want to run local checks using the transformers library, ensure you have Python installed and the HF token set via HF_TOKEN env var."

echo "Done."
