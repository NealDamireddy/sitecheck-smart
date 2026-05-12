'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileText, X, AlertCircle, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSwpppStore } from '@/stores/swppp-store';
import { cn } from '@/lib/utils';

export function UploadZone() {
  const { file, setFile, setProcessingStep, setProgress, setError, setSiteInfo, setExtractedCheckpoints } = useSwpppStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
    }
  }, [setFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  }, [setFile]);

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [setFile]);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setIsAnalyzing(true);

    try {
      // Step 1: Uploading
      setProcessingStep('uploading');
      setProgress(10);

      const formData = new FormData();
      formData.append('file', file);

      // Step 2: Extracting
      setProcessingStep('extracting');
      setProgress(30);

      const response = await fetch('/api/scan-swppp', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Scan failed');
      }

      const data = await response.json();

      // Step 3: Cross-referencing
      setProcessingStep('cross-referencing');
      setProgress(70);

      setSiteInfo(data.siteInfo);
      setExtractedCheckpoints(data.checkpoints);

      // Brief pause to show cross-referencing step
      await new Promise(resolve => setTimeout(resolve, 800));

      // Step 4: Complete
      setProcessingStep('complete');
      setProgress(100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [file, setProcessingStep, setProgress, setError, setSiteInfo, setExtractedCheckpoints]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="border-0 bg-[#141414] ring-1 ring-white/5">
      <CardContent className="p-6">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {!file ? (
          /* Drop zone */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-all',
              isDragOver
                ? 'border-amber-500 bg-amber-500/5'
                : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
            )}
          >
            <div className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
              isDragOver ? 'bg-amber-500/10' : 'bg-white/5'
            )}>
              <Upload className={cn('h-7 w-7', isDragOver ? 'text-amber-500' : 'text-muted-foreground')} />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {isDragOver ? 'Release to upload' : 'Drop your SWPPP PDF here'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              or click to browse • PDF up to 20MB
            </p>
          </div>
        ) : (
          /* File selected */
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <FileText className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={handleRemoveFile} disabled={isAnalyzing}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              <Sparkles className="h-4 w-4" />
              {isAnalyzing ? 'Analyzing...' : 'Analyze Document with AI'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
