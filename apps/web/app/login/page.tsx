'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BedDouble, Building2, CalendarCheck, ClipboardCheck } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { setSession } from '@/lib/auth';
import { Button, ErrorBanner, Input, Label } from '@/components/ui/primitives';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string };
}

const HIGHLIGHTS = [
  { icon: BedDouble, text: 'Live room availability, zero double bookings' },
  { icon: CalendarCheck, text: 'Bookings, blocks, and stays in one calendar' },
  { icon: ClipboardCheck, text: 'Housekeeping and front desk, always in sync' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@hotelops.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSession(result.accessToken, result.refreshToken, result.user);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,169,66,0.15),transparent_45%)]" />
        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-6 w-6 text-gold-400" />
          HotelOps
        </div>
        <div className="relative space-y-8">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Every room, every booking,
            <br />
            one source of truth.
          </h1>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-brand-100">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Icon className="h-4 w-4 text-gold-400" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-300">Hotel Management &amp; Booking Administration System</p>
      </section>

      <section className="flex items-center justify-center bg-slate-50 p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div className="mb-2 lg:hidden">
            <div className="flex items-center gap-2 text-lg font-semibold text-brand-900">
              <Building2 className="h-6 w-6 text-brand-700" />
              HotelOps
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-900">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in to manage your property.</p>
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hotel.com"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-center text-xs text-slate-400">
            Seeded account: admin@hotelops.local / password123
          </p>
        </form>
      </section>
    </main>
  );
}
