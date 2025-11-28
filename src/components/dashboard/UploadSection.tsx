import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileAudio, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const HF_API_KEY = "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";

export const UploadSection = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const audioFiles = selectedFiles.filter(file => 
      file.type.startsWith('audio/') || 
      file.name.match(/\.(mp3|wav|m4a|ogg|webm)$/i)
    );

    if (audioFiles.length !== selectedFiles.length) {
      toast.error("Some files were not audio files and were filtered out");
    }

    setFiles(prev => [...prev, ...audioFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const transcribeAudio = async (audioFile: File) => {
    console.log('Starting transcription for:', audioFile.name);
    
    const arrayBuffer = await audioFile.arrayBuffer();
    
    const response = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
      },
      body: arrayBuffer
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Transcription failed: ${error}`);
    }

    const result = await response.json();
    console.log('Transcription result:', result);
    return result.text || '';
  };

  const analyzeTranscript = async (transcript: string) => {
    console.log('Starting analysis...');
    
    const prompt = `<s>[INST] <<SYS>>
You are a call classification assistant. Analyze police call transcripts and return structured JSON responses with incident classification, urgency assessment, and key information extraction.
<</SYS>>

Analyze this police call transcript and return a JSON response (ONLY valid JSON) with these exact fields:
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

Return ONLY valid JSON with no surrounding text or commentary. [/INST]`;

    const response = await fetch('https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          temperature: 0.2,
          max_new_tokens: 1024,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Analysis failed: ${error}`);
    }

    const result = await response.json();
    console.log('Analysis result:', result);
    
    const analysisText = Array.isArray(result) ? result[0]?.generated_text || '' : result.generated_text || '';
    
    // Parse JSON from response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse analysis response');
    }
    
    return JSON.parse(jsonMatch[0]);
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      toast.error("Please select at least one audio file");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const totalFiles = files.length;
      let completed = 0;

      for (const file of files) {
        try {
          console.log(`Processing file ${completed + 1}/${totalFiles}: ${file.name}`);
          
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('call-recordings')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          // Create call record
          const { data: callData, error: dbError } = await supabase
            .from('calls')
            .insert({
              user_id: user.id,
              filename: file.name,
              file_path: fileName,
              status: 'processing',
              file_size_bytes: file.size
            })
            .select()
            .single();

          if (dbError || !callData) throw dbError || new Error('Failed to create call record');

          const callId = callData.id;

          // Transcribe audio
          toast.info(`Transcribing ${file.name}...`);
          const transcript = await transcribeAudio(file);
          
          // Save transcript
          await supabase.from('transcripts').insert({
            call_id: callId,
            transcript_text: transcript,
            confidence_score: 90
          });

          // Analyze transcript
          toast.info(`Analyzing ${file.name}...`);
          const analysis = await analyzeTranscript(transcript);

          // Save analysis
          await supabase.from('analyses').insert({
            call_id: callId,
            incident_type: analysis.incident_type || 'unknown',
            urgency_level: analysis.urgency_level || 'medium',
            urgency_score: analysis.urgency_score || 50,
            risk_category: analysis.risk_category || 'routine inquiry',
            anomaly_detected: analysis.anomaly_detected || false,
            sort_priority: analysis.sort_priority || 50,
            sentiment: analysis.sentiment || 'neutral',
            sentiment_score: analysis.sentiment_score || 50,
            keywords: analysis.keywords || [],
            topics: analysis.topics || [],
            emotional_tone: analysis.emotional_tone || 'calm',
            summary: analysis.summary || '',
            flagged_terms: analysis.flagged_terms || [],
            confidence_score: analysis.confidence_score || 50
          });

          // Update call status
          await supabase
            .from('calls')
            .update({ 
              status: 'completed',
              processed_at: new Date().toISOString()
            })
            .eq('id', callId);

          completed++;
          setProgress((completed / totalFiles) * 100);
          toast.success(`Processed ${file.name}`);
        } catch (fileError: any) {
          console.error(`Error processing ${file.name}:`, fileError);
          toast.error(`Failed to process ${file.name}: ${fileError.message}`);
        }
      }

      toast.success(`Completed processing ${completed} of ${totalFiles} file(s)`);
      setFiles([]);
      setProgress(0);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Upload Call Recordings</h2>
          <p className="text-muted-foreground text-sm">
            Upload audio files to automatically transcribe and analyze
          </p>
        </div>

        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            multiple
            onChange={handleFileChange}
            disabled={uploading}
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-sm">
              <span className="font-medium text-primary hover:underline">
                Click to upload
              </span>
              {" or drag and drop"}
            </div>
            <p className="text-xs text-muted-foreground">
              MP3, WAV, M4A, OGG, WEBM files
            </p>
          </label>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Selected Files</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileAudio className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Processing files...</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <Button
          onClick={uploadFiles}
          disabled={files.length === 0 || uploading}
          className="w-full"
        >
          {uploading ? "Processing..." : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </Card>
  );
};
