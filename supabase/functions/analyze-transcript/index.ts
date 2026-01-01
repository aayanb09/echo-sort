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
- incident_type: type of incident. choose from one of these: medical emergency, cardiac arrest, heart attack, stroke, respiratory distress, unconscious person, seizure, allergic reaction, drug overdose, poisoning, diabetic emergency, childbirth complication, severe bleeding, gunshot injury, stabbing injury, burn injury, fall injury, head injury, bone fracture, mental health crisis, suicide attempt, suicide threat, deceased person discovered, structural fire, vehicle fire, brush fire, dumpster fire, smoke condition, gas leak, carbon monoxide exposure, explosion, electrical hazard, downed power line, hazardous materials spill, chemical exposure, radiation exposure, biological exposure, bomb threat, suspicious package, terrorism-related threat, active shooter situation, gunfire reported, physical assault, assault with weapon, domestic violence incident, child abuse incident, elder abuse incident, sexual assault, rape, kidnapping, abduction, human trafficking activity, homicide, suspicious death, robbery, armed robbery, burglary, home invasion, theft, shoplifting incident, fraud occurrence, forgery incident, identity theft incident, vandalism, property damage, trespassing incident, prowler activity, suspicious person behavior, suspicious vehicle activity, stalking behavior, harassment incident, criminal threats, hate crime incident, disorderly behavior, public disturbance, excessive noise, public intoxication, illegal drug activity, impaired driving, reckless driving, road rage incident, hit and run collision, traffic collision with property damage, traffic collision with injuries, fatal traffic collision, vehicle rollover, pedestrian struck by vehicle, bicycle collision, motorcycle collision, train collision, aircraft crash, boating accident, water rescue situation, drowning incident, missing person, runaway juvenile, lost child, custody dispute incident, restraining order violation, illegal weapon possession, firearm brandishing, animal attack, aggressive animal incident, dog bite, injured animal, animal cruelty incident, livestock on roadway, wildlife hazard, flooding, flash flood, landslide, mudslide, sinkhole collapse, earthquake damage, tornado damage, hurricane damage, severe weather damage, lightning strike injury, fallen tree hazard, blocked roadway, roadway debris, traffic signal failure, power outage, utility failure, water main break, sewer backup, building collapse, structural damage, elevator entrapment, confined space incident, trench collapse, high-angle fall, ice rescue situation, swift water incident, lost hiker, wilderness emergency, crowd surge incident, mass casualty incident, public health emergency, quarantine violation, pandemic-related incident.
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
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('Raw Gemini response:', generatedText);

    // Parse JSON from response (handle code fences / extra text)
    let raw = String(generatedText ?? '').trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        analysis = JSON.parse(raw.slice(start, end + 1));
      } else {
        throw new Error(`No valid JSON found in Gemini response`);
      }
    }
    
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
