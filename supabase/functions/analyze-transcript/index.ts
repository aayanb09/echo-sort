import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Extracts JSON from Gemini's response, handling various formats
 */
function extractJSON(text: string): any {
  // Remove markdown code blocks if present
  let cleaned = text.trim();
 
  // Remove ```json and ``` markers
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  cleaned = cleaned.replace(/\s*```$/, '');
 
  // Try to find JSON object or array
  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
 
  // Parse the JSON
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // If still failing, try to extract from text more aggressively
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('{') || line.startsWith('[')) {
        // Found potential JSON start, get everything until the end
        const jsonText = lines.slice(i).join('\n');
        const match = jsonText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
    }
    throw new Error(`Could not extract valid JSON from response. Raw text: ${text.substring(0, 500)}`);
  }
}

/**
 * Analyzes call audio using Gemini API
 */
async function analyzeWithGemini(audioUrl: string, mimeType: string) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  // Download audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
  }
 
  const audioBuffer = await audioResponse.arrayBuffer();
  const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

  // Prepare Gemini API request
  const prompt = `Analyze this police call recording and provide a detailed analysis in JSON format.

Return ONLY valid JSON (no markdown, no explanations) with this exact structure:
{
  "summary": "Brief summary of the call",
  "priority": "high|medium|low",
  "category": "emergency|non-emergency|administrative|other",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "sentiment": "positive|neutral|negative|urgent",
  "actionRequired": "Description of any required follow-up action",
  "participants": ["participant 1", "participant 2"],
  "duration": "estimated duration in minutes",
  "location": "mentioned location if any",
  "incidentType": "type of incident reported"
}

Analyze the call and respond with ONLY the JSON object, nothing else.`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType || "audio/mpeg",
              data: base64Audio,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      topK: 32,
      topP: 1,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
 
  // Extract text from Gemini response
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No text content in Gemini response");
  }

  console.log("Raw Gemini response:", text);

  // Parse JSON from response (handles markdown, extra text, etc.)
  const analysisResult = extractJSON(text);
 
  return analysisResult;
}

serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const { callId } = await req.json();

    if (!callId) {
      throw new Error("callId is required");
    }

    // Get call details from database
    const { data: call, error: fetchError } = await supabase
      .from("calls")
      .select("*")
      .eq("id", callId)
      .single();

    if (fetchError || !call) {
      throw new Error(`Call not found: ${fetchError?.message}`);
    }

    // Update status to processing
    await supabase
      .from("calls")
      .update({ status: "processing" })
      .eq("id", callId);

    // Analyze with Gemini
    const analysis = await analyzeWithGemini(call.file_url, call.file_type);

    // Update call with analysis results
    const { error: updateError } = await supabase
      .from("calls")
      .update({
        status: "completed",
        analysis_result: analysis,
      })
      .eq("id", callId);

    if (updateError) {
      throw new Error(`Failed to update call: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Analysis error:", error);

    // Try to update call status to failed
    try {
      const { callId } = await req.json();
      if (callId) {
        await supabase
          .from("calls")
          .update({
            status: "failed",
            analysis_result: { error: error.message },
          })
          .eq("id", callId);
      }
    } catch (e) {
      console.error("Failed to update error status:", e);
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
