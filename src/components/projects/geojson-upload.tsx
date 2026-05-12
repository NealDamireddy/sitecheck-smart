'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';

interface GeoJsonUploadProps {
  onCenterlineLoaded: (centerline: [number, number][]) => void;
}

interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: GeoJsonGeometry;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

function extractLineString(parsed: unknown): [number, number][] | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  // Direct LineString geometry
  if (obj.type === 'LineString' && Array.isArray(obj.coordinates)) {
    return obj.coordinates as [number, number][];
  }

  // Feature with LineString geometry
  if (obj.type === 'Feature') {
    const feature = obj as unknown as GeoJsonFeature;
    if (feature.geometry?.type === 'LineString' && Array.isArray(feature.geometry.coordinates)) {
      return feature.geometry.coordinates as [number, number][];
    }
    if (feature.geometry?.type === 'MultiLineString' && Array.isArray(feature.geometry.coordinates)) {
      // Take the longest sub-line
      const lines = feature.geometry.coordinates as [number, number][][];
      let longest = lines[0];
      for (const l of lines) if (l.length > longest.length) longest = l;
      return longest;
    }
  }

  // FeatureCollection — find first LineString feature
  if (obj.type === 'FeatureCollection') {
    const fc = obj as unknown as GeoJsonFeatureCollection;
    for (const feat of fc.features ?? []) {
      const result = extractLineString(feat);
      if (result) return result;
    }
  }

  return null;
}

export function GeoJsonUpload({ onCenterlineLoaded }: GeoJsonUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [vertexCount, setVertexCount] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFilename(file.name);
      setVertexCount(null);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const coords = extractLineString(parsed);
        if (!coords || coords.length < 2) {
          throw new Error('No LineString geometry found in this file (need at least 2 points)');
        }
        // Validate coordinate format
        for (const c of coords) {
          if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number') {
            throw new Error('Invalid coordinate format — expected [longitude, latitude] pairs');
          }
        }
        setVertexCount(coords.length);
        onCenterlineLoaded(coords as [number, number][]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse GeoJSON');
      }
    },
    [onCenterlineLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleClear = () => {
    setFilename(null);
    setVertexCount(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? 'border-amber-500/60 bg-amber-500/5'
            : 'border-border hover:border-amber-500/40 hover:bg-elevated/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Drop a .geojson file here</p>
        <p className="mt-1 text-xs text-muted-foreground">
          or click to browse — must contain a LineString feature
        </p>
      </div>

      {filename && (
        <div className="flex items-center justify-between rounded-md border border-border bg-elevated px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{filename}</p>
              {vertexCount != null && (
                <p className="text-[11px] text-muted-foreground">
                  {vertexCount} vertices loaded
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
