'use client';

import { useState, useRef, useEffect } from 'react';
import { ReportSection } from '@/types/report';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Lock, Check, X } from 'lucide-react';

interface EditableSectionProps {
  section: ReportSection;
  onSave: (content: string) => void;
}

export function EditableSection({ section, onSave }: EditableSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  function handleEdit() {
    if (!section.editable) return;
    setEditContent(section.content);
    setIsEditing(true);
  }

  function handleSave() {
    onSave(editContent);
    setIsEditing(false);
  }

  function handleCancel() {
    setEditContent(section.content);
    setIsEditing(false);
  }

  return (
    <div className="group/section mb-6">
      {/* Section Header */}
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-heading text-sm font-bold tracking-wide text-zinc-800">
          {section.number}. {section.title}
        </h3>
        {section.edited && (
          <Badge className="bg-amber-500/15 text-amber-700 text-[10px] px-1.5 py-0 h-4 border-amber-500/30">
            Edited
          </Badge>
        )}
        {!section.editable && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-zinc-200 text-zinc-500 gap-1">
            <Lock className="size-2.5" />
            Protected
          </Badge>
        )}
      </div>

      {/* Content Area */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[200px] border-amber-500/50 bg-white text-zinc-800 text-[13px] leading-relaxed font-mono focus-visible:border-amber-500 focus-visible:ring-amber-500/30"
            rows={12}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-amber-500 text-white hover:bg-amber-600 h-7 text-xs gap-1"
            >
              <Check className="size-3" />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className="h-7 text-xs gap-1 border-zinc-300 text-zinc-600 hover:bg-zinc-100"
            >
              <X className="size-3" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={handleEdit}
          className={`relative rounded-md px-3 py-2 text-[13px] leading-relaxed text-zinc-700 whitespace-pre-wrap ${
            section.editable
              ? 'cursor-pointer transition-colors hover:bg-amber-50/50 group-hover/section:ring-1 group-hover/section:ring-amber-500/20'
              : 'opacity-80'
          }`}
        >
          {section.content}

          {/* Edit Indicator */}
          {section.editable && (
            <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 opacity-0 transition-opacity group-hover/section:opacity-100">
              <Pencil className="size-2.5" />
              Click to edit
            </div>
          )}

          {/* Lock indicator for non-editable */}
          {!section.editable && (
            <div className="absolute top-2 right-2">
              <Lock className="size-3 text-zinc-400" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
