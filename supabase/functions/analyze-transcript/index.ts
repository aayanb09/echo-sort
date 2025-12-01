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
    const { transcript } = await req.json();
    
    if (!transcript) {
      throw new Error('Transcript is required');
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    console.log('Starting Gemini analysis for transcript length:', transcript.length);

    const prompt = `Analyze this police call transcript and return a JSON response (ONLY valid JSON) with these exact fields:
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

Transcript: ${transcript}

Return ONLY valid JSON with no surrounding text or commentary.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('Raw Gemini response:', generatedText);

    // Parse JSON from response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Gemini response');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    
    console.log('Analysis complete');

    return new Response(
      JSON.stringify({ analysis }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Analysis error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
