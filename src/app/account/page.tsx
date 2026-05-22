'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Check } from 'lucide-react';
import { SectionHeader } from '@/components/shared/section-header';
import { PageTransition } from '@/components/shared/page-transition';
import { Button } from '@/components/ui/button';

interface QspProfile {
  userId: string;
  name: string;
  licenseNumber: string;
  company: string;
  phone: string;
  email: string;
}

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/qsp-profile');
        if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
        const data = (await res.json()) as QspProfile;
        if (cancelled) return;
        setName(data.name);
        setLicenseNumber(data.licenseNumber);
        setCompany(data.company);
        setPhone(data.phone);
        setEmail(data.email);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/qsp-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, licenseNumber, company, phone, email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ? String(body.error) : `Save failed (${res.status})`);
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  const justSaved = savedAt && Date.now() - savedAt < 3000;

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="My Account"
          description="Your QSP profile is used to pre-fill new site setups and to identify you on submitted reports."
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading profile…
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                placeholder="Jane Doe"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                QSP license number
              </label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                placeholder="QSD-12345"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Used on every report and SMARTS submission.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                placeholder="Acme Stormwater Consulting"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                  placeholder="jane@example.com"
                />
              </div>
            </div>

            {error && (
              <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              {justSaved && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" /> Save changes
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </PageTransition>
  );
}
