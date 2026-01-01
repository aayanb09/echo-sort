import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileAudio, X, Square } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const UploadSection = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const cancelledRef = useRef(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const audioFiles = filterAudioFiles(selectedFiles);
    setFiles(prev => [...prev, ...audioFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    const audioFiles = filterAudioFiles(droppedFiles);
    setFiles(prev => [...prev, ...audioFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const transcribeAudio = async (audioFile: File, filePath: string) => {
    console.log('Starting transcription for:', audioFile.name);
    
    try {
      // Get signed URL for the uploaded file (valid for 1 hour)
      const { data: urlData, error: urlError } = await supabase.storage
        .from('call-recordings')
        .createSignedUrl(filePath, 3600);

      if (urlError || !urlData?.signedUrl) {
        throw new Error('Failed to create signed URL');
      }

      console.log('Calling transcription edge function...');
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audioUrl: urlData.signedUrl }
      });

      if (error) throw error;
      if (!data?.text) throw new Error('No transcription text returned');
      
      console.log('Transcription result length:', data.text.length);
      return data.text;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const analyzeTranscript = async (transcript: string) => {
    console.log('Starting analysis...');
    try {
      console.log('Calling analysis edge function...');
      const { data, error } = await supabase.functions.invoke('analyze-transcript', {
        body: { transcript }
      });

      if (error) throw error;
      if (!data?.analysis) throw new Error('No analysis data returned');
      
      console.log('Analysis complete');
      return data.analysis;
    } catch (error) {
      console.error('Analysis error:', error);
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const cancelUpload = () => {
    cancelledRef.current = true;
    setProgressLabel("Cancelling...");
    toast.info("Cancelling upload after current file...");
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      toast.error("Please select at least one audio file");
      return;
    }

    cancelledRef.current = false;
    setUploading(true);
    setProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const totalFiles = files.length;
      let completed = 0;

      // Each file has 3 stages: upload (33%), transcribe (33%), analyze (34%)
      const progressPerFile = 100 / totalFiles;
      const stageWeight = progressPerFile / 3;

      for (const file of files) {
        // Check for cancellation before starting each file
        if (cancelledRef.current) {
          toast.info(`Cancelled. Processed ${completed} of ${totalFiles} file(s).`);
          break;
        }

        const fileIndex = completed;
        const baseProgress = fileIndex * progressPerFile;
        
        try {
          console.log(`Processing file ${completed + 1}/${totalFiles}: ${file.name}`);
          
          // Stage 1: Upload
          setProgressLabel(`Uploading ${file.name}...`);
          setProgress(baseProgress + stageWeight * 0.5);
          
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('call-recordings')
            .upload(fileName, file);

          if (uploadError) throw uploadError;
          
          setProgress(baseProgress + stageWeight);

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

          try {
            // Stage 2: Transcribe
            setProgressLabel(`Transcribing ${file.name}...`);
            setProgress(baseProgress + stageWeight * 1.5);
            
            const transcript = await transcribeAudio(file, fileName);
            console.log('Transcript length:', transcript.length);
            
            setProgress(baseProgress + stageWeight * 2);
            
            // Save transcript
            await supabase.from('transcripts').insert({
              call_id: callId,
              transcript_text: transcript,
              confidence_score: 90
            });

            // Stage 3: Analyze
            setProgressLabel(`Analyzing ${file.name}...`);
            setProgress(baseProgress + stageWeight * 2.5);
            
            const analysis = await analyzeTranscript(transcript);
            console.log('Analysis:', analysis);

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

            // Update call status to completed
            await supabase
              .from('calls')
              .update({ 
                status: 'completed',
                processed_at: new Date().toISOString()
              })
              .eq('id', callId);

            completed++;
            setProgress(completed * progressPerFile);
            toast.success(`Processed ${file.name}`);
          } catch (processingError: any) {
            console.error(`Processing error for ${file.name}:`, processingError);
            
            // Update call status to failed
            await supabase
              .from('calls')
              .update({ 
                status: 'failed',
                processed_at: new Date().toISOString()
              })
              .eq('id', callId);
              
            toast.error(`Failed to process ${file.name}: ${processingError.message}`);
          }
        } catch (fileError: any) {
          console.error(`Error with ${file.name}:`, fileError);
          toast.error(`Failed to upload ${file.name}: ${fileError.message}`);
        }
      }

      if (!cancelledRef.current) {
        setProgressLabel("Complete!");
        toast.success(`Completed processing ${completed} of ${totalFiles} file(s)`);
      }
      setFiles([]);
      setProgress(0);
      setProgressLabel("");
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

        <div 
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50'
          } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            multiple
            onChange={handleFileChange}
            disabled={uploading}
          />
          <input
            type="file"
            id="folder-upload"
            className="hidden"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            multiple
            webkitdirectory=""
            directory=""
            onChange={handleFileChange}
            disabled={uploading}
          />
          <label
            htmlFor="file-upload"
            className={`flex flex-col items-center gap-2 ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Upload className={`h-12 w-12 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            <div className="text-sm">
              <span className="font-medium text-primary hover:underline">
                Click to upload files
              </span>
              {" or drag and drop"}
            </div>
            <p className="text-xs text-muted-foreground">
              MP3, WAV, M4A, OGG, WEBM files
            </p>
          </label>
          <div className="mt-4 flex gap-4 justify-center">
            <label
              htmlFor="folder-upload"
              className={`text-sm font-medium text-primary hover:underline ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'} px-3 py-1 border border-primary rounded-md hover:bg-primary/5`}
            >
              Upload Folder
            </label>
          </div>
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
              <span className="text-muted-foreground">{progressLabel || "Starting..."}</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={uploadFiles}
            disabled={files.length === 0 || uploading}
            className="flex-1"
          >
            {uploading ? "Processing..." : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}
          </Button>
          {uploading && (
            <Button
              onClick={cancelUpload}
              variant="destructive"
              disabled={cancelledRef.current}
            >
              <Square className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
