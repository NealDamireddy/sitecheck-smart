'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ShieldCheck, Pen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';

interface SignatureBlockProps {
  signed: boolean;
  signedBy: string | null;
  signedDate: string | null;
  onSign: (name: string) => void;
  onUnsign: () => void;
}

export function SignatureBlock({
  signed,
  signedBy,
  signedDate,
  onSign,
  onUnsign,
}: SignatureBlockProps) {
  const [confirmed, setConfirmed] = useState(false);

  function handleSign() {
    if (!confirmed) return;
    onSign('Sarah Chen, QSP-4521');
  }

  if (signed) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          <h3 className="text-sm font-bold text-green-700">Report Certified</h3>
        </div>

        <div className="rounded-lg border border-green-300 bg-green-50 p-4">
          <div className="space-y-2 text-sm text-neutral-700">
            <div className="flex justify-between">
              <span className="text-neutral-500">Certified By</span>
              <span className="font-medium">{signedBy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Date</span>
              <span className="font-medium">{signedDate ? formatDateTime(signedDate) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">License</span>
              <span className="font-medium">QSP-4521</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-green-200 pt-3">
            <div className="flex-1 border-b-2 border-green-600 pb-1">
              <span className="font-serif text-lg italic text-green-800">
                Sarah Chen
              </span>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onUnsign}
          className="border-zinc-300 text-zinc-600 hover:bg-zinc-100 gap-1 text-xs"
        >
          <XCircle className="size-3" />
          Revoke Certification
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Pen className="h-4 w-4 text-neutral-500" />
        <h3 className="text-sm font-bold text-neutral-700">QSP Certification</h3>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        By signing this report, you certify under penalty of law that the information
        submitted is true, accurate, and complete to the best of your knowledge.
      </p>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="space-y-2 text-sm text-neutral-600">
          <div className="flex justify-between">
            <span>QSP Name</span>
            <span className="font-medium text-neutral-800">Sarah Chen</span>
          </div>
          <div className="flex justify-between">
            <span>License Number</span>
            <span className="font-medium text-neutral-800">QSP-4521</span>
          </div>
          <div className="flex justify-between">
            <span>Company</span>
            <span className="font-medium text-neutral-800">Pacific Environmental Consulting</span>
          </div>
        </div>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
        />
        <span className="text-xs text-neutral-600 leading-relaxed">
          I certify that this inspection report has been prepared under my direction and the
          information is true, accurate, and complete. I am aware of the penalties for
          submitting false information.
        </span>
      </label>

      <Button
        onClick={handleSign}
        disabled={!confirmed}
        className="bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 gap-1.5"
      >
        <CheckCircle className="size-4" />
        Sign & Certify Report
      </Button>
    </div>
  );
}
