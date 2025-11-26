import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileAudio, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('call-recordings')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Create call record
        const { error: dbError } = await supabase
          .from('calls')
          .insert({
            user_id: user.id,
            filename: file.name,
            file_path: fileName,
            status: 'pending',
            file_size_bytes: file.size
          });

        if (dbError) throw dbError;

        completed++;
        setProgress((completed / totalFiles) * 100);
      }

      // Log audit trail
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'upload_calls',
        resource_type: 'calls',
        details: { count: files.length }
      });

      toast.success(`${files.length} file(s) uploaded successfully`);
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
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-2 mb-4">
        <Upload className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Upload Call Recordings</h2>
      </div>

      <div className="space-y-4">
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <FileAudio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground mb-2">Drop audio files here or click to browse</p>
          <p className="text-sm text-muted-foreground mb-4">
            Supports: MP3, WAV, M4A, OGG, WebM
          </p>
          <input
            type="file"
            multiple
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
            disabled={uploading}
          />
          <label htmlFor="file-upload">
            <Button
              type="button"
              onClick={() => document.getElementById('file-upload')?.click()}
              disabled={uploading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Select Files
            </Button>
          </label>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Selected Files ({files.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-secondary rounded border border-border"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileAudio className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    disabled={uploading}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploading && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">
              Uploading... {Math.round(progress)}%
            </p>
          </div>
        )}

        {files.length > 0 && (
          <Button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {uploading ? "Uploading..." : `Upload ${files.length} File(s)`}
          </Button>
        )}
      </div>
    </Card>
  );
};
