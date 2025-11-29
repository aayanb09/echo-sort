import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ASSEMBLYAI_API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!ASSEMBLYAI_API_KEY) {
      throw new Error('ASSEMBLYAI_API_KEY not configured');
    }

    const { audioUrl } = await req.json();
    
    if (!audioUrl) {
      throw new Error('No audio URL provided');
    }

    console.log('Starting transcription for audio URL:', audioUrl);

    // Submit audio for transcription
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speech_model: 'best',
      }),
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`AssemblyAI upload failed: ${error}`);
    }

    const { id: transcriptId } = await uploadResponse.json();
    console.log('Transcript ID:', transcriptId);

    // Poll for completion
    let transcript;
    while (true) {
      const pollingResponse = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            'Authorization': ASSEMBLYAI_API_KEY,
          },
        }
      );

      if (!pollingResponse.ok) {
        const error = await pollingResponse.text();
        throw new Error(`AssemblyAI polling failed: ${error}`);
      }

      transcript = await pollingResponse.json();
      console.log('Transcription status:', transcript.status);

      if (transcript.status === 'completed') {
        break;
      } else if (transcript.status === 'error') {
        throw new Error(`Transcription error: ${transcript.error}`);
      }

      // Wait 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return new Response(
      JSON.stringify({ 
        text: transcript.text,
        confidence: transcript.confidence 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
