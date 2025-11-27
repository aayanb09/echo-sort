# AI integration — transcription and anomaly detection

This project ships with a serverless function at `supabase/functions/process-call` to transcribe audio and analyze transcripts. It uses Hugging Face endpoints and the following models:

- Transcription: `openai/whisper-large-v2` (Inference API)
- Analysis / anomaly detection: `meta-llama/Llama-2-7b-chat-hf` (Router / Chat Completion)

Important: `meta-llama/Llama-2-7b-chat-hf` is gated — ensure your Hugging Face account has access and you provide a valid API token.

Environment variables

- `HUGGING_FACE_API_KEY` — required in production / serverless (the serverless function reads this from env)

Quick examples

Transcription using transformers pipeline (Python):

```py
from transformers import pipeline

pipe = pipeline("automatic-speech-recognition", model="openai/whisper-large-v2")
result = pipe("/path/to/audio.wav")
print(result['text'])
```

Chat-based analysis using Llama-2 (Python):

```py
from huggingface_hub import login
from transformers import AutoTokenizer, AutoModelForCausalLM

# login() will try to use HF_TOKEN env var if available
login(new_session=False)

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-chat-hf")
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-chat-hf")

messages = [{"role":"user","content":"Analyze the following transcript and return JSON containing urgency_level, anomaly_detected, sort_priority and summary: <TRANSCRIPT_TEXT>"}]

inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=200)
print(tokenizer.decode(outputs[0][inputs['input_ids'].shape[-1]:]))
```

If you encounter any issues while running these local snippets, first ensure you are logged into Hugging Face and the HF token has the right access rights. See Hugging Face docs and the model pages for gating requirements.
