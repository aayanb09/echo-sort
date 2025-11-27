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
    const huggingFaceApiKey = Deno.env.get('HUGGING_FACE_API_KEY')!;
    
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

    // Convert audio to array buffer for Hugging Face API
    const arrayBuffer = await audioData.arrayBuffer();

    // Transcribe with Hugging Face Whisper API (use whisper-large-v2 as requested)
    const transcribeResponse = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${huggingFaceApiKey}`,
      },
      body: arrayBuffer
    });

    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.text();
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error}`);
    }

    const transcription = await transcribeResponse.json();
    const transcriptText = transcription.text || '';
    
    console.log('Transcription successful, length:', transcriptText.length);

    console.log('Transcription complete, analyzing...');

    // Save transcript
    await supabase
      .from('transcripts')
      .insert({
        call_id: callId,
        transcript_text: transcriptText,
        confidence_score: 90
      });

    // Analyze with Hugging Face Llama-2 via chat completions API (meta-llama/Llama-2-7b-chat-hf)
    const analysisResponse = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${huggingFaceApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-2-7b-chat-hf',
        messages: [
          {
            role: 'system',
            content: 'You are a call classification assistant. Analyze police call transcripts and return structured JSON responses with incident classification, urgency assessment, and key information extraction.'
          },
          {
            role: 'user',
            content: `Analyze this police call transcript and return a JSON response (ONLY valid JSON) with these exact fields:
- incident_type: type of incident (e.g., robbery, domestic disturbance, medical emergency, traffic accident, routine inquiry)
- urgency_level: one of "low", "medium", "high", "critical"
- risk_category: one of "safety threat", "routine inquiry", "administrative", "emergency response"
- summary: short natural-language summary (2-3 sentences)
- flagged_terms: array of important keywords detected (violence-related, weapon mentions, medical terms, etc.)
- urgency_score: numeric score from 0-100
- anomaly_detected: boolean — true if this call is anomalous/unusual based on content, otherwise false
- sort_priority: numeric score 0-100 that represents sorting priority (higher => process sooner)
- sentiment: one of "positive", "neutral", "negative", "distressed"
- sentiment_score: numeric score from 0-100
- emotional_tone: description of emotional state
- topics: array of main topics discussed
- keywords: array of top 5 keywords
- confidence_score: your confidence in this classification (0-100)

Transcript: ${transcriptText}

Return ONLY valid JSON with no surrounding text or commentary.`
          }
        ],
        temperature: 0.2,
        max_tokens: 1024
      })
    });

    if (!analysisResponse.ok) {
      const error = await analysisResponse.text();
      console.error('Analysis error:', error);
      throw new Error(`Analysis failed: ${error}`);
    }

    const analysisData = await analysisResponse.json();
    const analysisText = analysisData.choices?.[0]?.message?.content || '';
    
    console.log('Raw analysis response:', analysisText);
    
    // Parse JSON response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      incident_type: 'unknown',
      urgency_level: 'medium',
      risk_category: 'routine inquiry',
      summary: transcriptText.substring(0, 200),
      flagged_terms: [],
      urgency_score: 50,
      anomaly_detected: false,
      sort_priority: 50,
      sentiment: 'neutral',
      sentiment_score: 50,
      emotional_tone: 'calm',
      topics: [],
      keywords: [],
      confidence_score: 50
    };

    console.log('Analysis complete, saving results...');

    // Save analysis
    await supabase
      .from('analyses')
      .insert({
        call_id: callId,
        incident_type: analysis.incident_type,
        urgency_level: analysis.urgency_level,
        urgency_score: analysis.urgency_score,
        risk_category: analysis.risk_category,
        anomaly_detected: analysis.anomaly_detected ?? false,
        sort_priority: analysis.sort_priority ?? 50,
        sentiment: analysis.sentiment,
        sentiment_score: analysis.sentiment_score,
        keywords: analysis.keywords,
        topics: analysis.topics,
        emotional_tone: analysis.emotional_tone,
        summary: analysis.summary,
        flagged_terms: analysis.flagged_terms,
        confidence_score: analysis.confidence_score
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
