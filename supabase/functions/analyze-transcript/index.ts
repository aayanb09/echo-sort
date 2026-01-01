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

    const prompt = `Analyze this police call transcript and return ONLY a valid JSON object with these exact fields. Do not include any text before or after the JSON.

Required JSON fields:
- incident_type: string (e.g., "robbery", "domestic disturbance", "medical emergency")
- urgency_level: string (one of: "low", "medium", "high", "critical")
- risk_category: string (one of: "safety threat", "routine inquiry", "administrative", "emergency response")
- summary: string (2-3 sentence summary)
- flagged_terms: array of strings (important keywords found)
- urgency_score: number (0-100)
- anomaly_detected: boolean
- sort_priority: number (0-100, higher = process sooner)
- sentiment: string (one of: "positive", "neutral", "negative", "distressed")
- sentiment_score: number (0-100)
- emotional_tone: string (description of emotional state)
- topics: array of strings (main topics discussed)
- keywords: array of strings (top 5 keywords)
- confidence_score: number (0-100, your confidence in this analysis)

Example response format:
{"incident_type":"robbery","urgency_level":"high","risk_category":"safety threat","summary":"A robbery was reported...","flagged_terms":["gun","armed"],"urgency_score":85,"anomaly_detected":false,"sort_priority":80,"sentiment":"distressed","sentiment_score":75,"emotional_tone":"fearful and urgent","topics":["crime","weapons"],"keywords":["robbery","gun","armed","suspect"],"confidence_score":90}

Transcript: ${transcript}

Return ONLY the JSON object, no additional text:`;

    // Retry logic with exponential backoff for rate limiting
    let response;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`Retry attempt ${attempt + 1} after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        response = await fetch(
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
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
              }
            })
          }
        );

        if (response.ok) {
          break; // Success, exit retry loop
        }

        if (response.status === 429) {
          lastError = 'Rate limit exceeded';
          if (attempt === maxRetries - 1) {
            throw new Error('Rate limit exceeded after retries. Please wait a moment and try again.');
          }
          continue; // Retry
        }

        // For other errors, don't retry
        const errorText = await response.text();
        console.error('Gemini API error:', response.status, errorText);
        throw new Error(`Gemini API error: ${response.status}`);
        
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        lastError = error;
      }
    }

    if (!response || !response.ok) {
      const errorMessage = lastError instanceof Error ? lastError.message : (typeof lastError === 'string' ? lastError : 'Failed to get response from Gemini API');
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Full Gemini API response:', JSON.stringify(data, null, 2));
    
    // Validate response structure
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      console.error('Invalid Gemini response structure - no candidates array');
      throw new Error('Invalid response structure from Gemini API');
    }
    
    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
      console.error('Invalid Gemini response structure - no content parts');
      throw new Error('Invalid content structure from Gemini API');
    }
    
    const generatedText = candidate.content.parts[0]?.text || '';
    console.log('Raw Gemini response text:', generatedText);
    console.log('Response text length:', generatedText.length);

    if (!generatedText || generatedText.trim().length === 0) {
      throw new Error('Empty response from Gemini API');
    }

    // Parse JSON from response (handle code fences / extra text)
    let raw = String(generatedText).trim();
    
    // Remove markdown code blocks if present
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    
    console.log('Cleaned response for parsing:', raw.substring(0, 200) + (raw.length > 200 ? '...' : ''));

    let analysis: Record<string, unknown>;
    
    // Try multiple parsing strategies
    try {
      // First try: direct JSON parse
      analysis = JSON.parse(raw);
      console.log('Successfully parsed JSON directly');
    } catch (directParseError) {
      console.log('Direct JSON parse failed, trying fallback methods');
      
      try {
        // Second try: extract JSON from text using braces
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        
        if (start !== -1 && end !== -1 && end > start) {
          const jsonCandidate = raw.slice(start, end + 1);
          console.log('Trying to parse extracted JSON:', jsonCandidate.substring(0, 100) + '...');
          analysis = JSON.parse(jsonCandidate);
          console.log('Successfully parsed extracted JSON');
        } else {
          throw new Error('No JSON object found in response');
        }
      } catch (braceParseError) {
        console.log('Brace extraction failed, trying regex approach');
        
        try {
          // Third try: use regex to find JSON-like content
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log('Found JSON-like content with regex');
            analysis = JSON.parse(jsonMatch[0]);
            console.log('Successfully parsed regex-extracted JSON');
          } else {
            throw new Error('No JSON-like content found with regex');
          }
        } catch (regexParseError) {
          console.error('All JSON parsing attempts failed');
          console.error('Direct parse error:', directParseError);
          console.error('Brace parse error:', braceParseError);
          console.error('Regex parse error:', regexParseError);
          throw new Error(`Failed to parse Gemini response as JSON. Response: ${raw.substring(0, 500)}...`);
        }
      }
    }
    
    console.log('Final parsed analysis keys:', Object.keys(analysis));
    
    // Validate and provide defaults for required fields
    const validatedAnalysis = {
      incident_type: analysis.incident_type || 'unknown',
      urgency_level: analysis.urgency_level || 'medium',
      urgency_score: typeof analysis.urgency_score === 'number' ? analysis.urgency_score : 50,
      risk_category: analysis.risk_category || 'routine inquiry',
      anomaly_detected: Boolean(analysis.anomaly_detected),
      sort_priority: typeof analysis.sort_priority === 'number' ? analysis.sort_priority : 50,
      sentiment: analysis.sentiment || 'neutral',
      sentiment_score: typeof analysis.sentiment_score === 'number' ? analysis.sentiment_score : 50,
      keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
      topics: Array.isArray(analysis.topics) ? analysis.topics : [],
      emotional_tone: analysis.emotional_tone || 'calm',
      summary: analysis.summary || 'Analysis completed',
      flagged_terms: Array.isArray(analysis.flagged_terms) ? analysis.flagged_terms : [],
      confidence_score: typeof analysis.confidence_score === 'number' ? analysis.confidence_score : 50
    };
    
    console.log('Validated analysis:', validatedAnalysis);
    console.log('Analysis complete');

    return new Response(
      JSON.stringify({ analysis: validatedAnalysis }),
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
