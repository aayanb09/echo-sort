import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callId } = await req.json();
    
    if (!callId) {
      throw new Error('Call ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Processing call:', callId);

    // Get call details
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      throw new Error('Call not found');
    }

    // Update status to processing
    await supabase
      .from('calls')
      .update({ status: 'processing' })
      .eq('id', callId);

    // Download audio file
    const { data: audioData, error: downloadError } = await supabase.storage
      .from('call-recordings')
      .download(call.file_path);

    if (downloadError || !audioData) {
      throw new Error('Failed to download audio file');
    }

    console.log('Audio file downloaded, transcribing...');

    // Convert blob to base64 for Whisper API
    const arrayBuffer = await audioData.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Transcribe with Lovable AI (Whisper)
    const transcribeResponse = await fetch('https://ai.gateway.lovable.dev/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'whisper-1',
        file: base64Audio,
        response_format: 'json'
      })
    });

    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.text();
      console.error('Transcription error:', error);
      throw new Error('Transcription failed');
    }

    const transcription = await transcribeResponse.json();
    const transcriptText = transcription.text;

    console.log('Transcription complete, analyzing...');

    // Save transcript
    const { data: transcript } = await supabase
      .from('transcripts')
      .insert({
        call_id: callId,
        transcript_text: transcriptText,
        confidence_score: 95
      })
      .select()
      .single();

    // Analyze with Lovable AI
    const analysisPrompt = `Analyze this police call transcript and provide:
1. Urgency level (critical/high/medium/low)
2. Urgency score (0-100)
3. Overall sentiment (positive/neutral/negative/distressed)
4. Sentiment score (0-100)
5. Top 5 keywords
6. Main topics discussed
7. Emotional tone
8. Brief summary

Transcript: ${transcriptText}

Respond in JSON format with keys: urgency_level, urgency_score, sentiment, sentiment_score, keywords (array), topics (array), emotional_tone, summary`;

    const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert law enforcement call analyst. Always respond with valid JSON only.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.3
      })
    });

    if (!analysisResponse.ok) {
      throw new Error('Analysis failed');
    }

    const analysisData = await analysisResponse.json();
    const analysisText = analysisData.choices[0].message.content;
    
    // Parse JSON response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(analysisText);

    console.log('Analysis complete, saving results...');

    // Save analysis
    await supabase
      .from('analyses')
      .insert({
        call_id: callId,
        urgency_level: analysis.urgency_level,
        urgency_score: analysis.urgency_score,
        sentiment: analysis.sentiment,
        sentiment_score: analysis.sentiment_score,
        keywords: analysis.keywords,
        topics: analysis.topics,
        emotional_tone: analysis.emotional_tone,
        summary: analysis.summary
      });

    // Update call status
    await supabase
      .from('calls')
      .update({ 
        status: 'completed',
        processed_at: new Date().toISOString()
      })
      .eq('id', callId);

    console.log('Processing complete');

    return new Response(
      JSON.stringify({ 
        success: true,
        transcript: transcriptText,
        analysis 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
