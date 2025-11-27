# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/7435e0bd-1888-4b6e-814e-9ec05e64dc4c

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/7435e0bd-1888-4b6e-814e-9ec05e64dc4c) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/7435e0bd-1888-4b6e-814e-9ec05e64dc4c) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## AI model integration (transcription & anomaly detection)

This project includes a serverless function `supabase/functions/process-call` which transcribes audio and analyzes call transcripts using Hugging Face models.

Quick notes:

- The function uses an environment variable `HUGGING_FACE_API_KEY` to authenticate with Hugging Face's Inference and Router endpoints. Make sure you set this secret before deploying.
- Transcription uses the Whisper model `openai/whisper-large-v2` via the Hugging Face Inference API.
- Analysis / anomaly detection uses `meta-llama/Llama-2-7b-chat-hf` via the Hugging Face chat completions router. This model is gated — make sure your account has access and the key has inference permissions.

Example Python local usage (transformers) for transcription:

```py
from transformers import pipeline

pipe = pipeline("automatic-speech-recognition", model="openai/whisper-large-v2")
result = pipe("my_audio_file.wav")
print(result["text"])  # transcribed text
```

Example Python local usage (transformers) for Llama-2 chat-based analysis:

```py
from huggingface_hub import login
from transformers import AutoTokenizer, AutoModelForCausalLM

login()  # ensure you are logged in or set HF_TOKEN in env
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-chat-hf")
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-chat-hf")

# Prepare simple chat message
messages = [{"role": "user", "content": "Analyze this text and return a JSON with urgency_level and anomaly_detected fields: <TRANSCRIPT_HERE>"}]
inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=True, return_tensors="pt")
outputs = model.generate(**inputs, max_new_tokens=200)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

If you plan to run models locally, ensure you have access to gated models and follow Hugging Face's license/usage restrictions.

Quick check: to verify the repo has the environment variable set (locally) you can run:

```bash
# prints whether HUGGING_FACE_API_KEY is set and the models used
npm run check:ai
```

