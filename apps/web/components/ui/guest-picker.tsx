'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Input, Label } from './primitives';

export interface PickedGuest {
  id: string | null; // null = not linked to an existing record; create one from fullName on submit
  fullName: string;
}

interface GuestOption {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export function GuestPicker({
  hotelId,
  value,
  onChange,
}: {
  hotelId: string;
  value: PickedGuest | null;
  onChange: (guest: PickedGuest) => void;
}) {
  const [query, setQuery] = useState(value?.fullName ?? '');
  const [results, setResults] = useState<GuestOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!hotelId || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiFetch<{ items: GuestOption[] }>(`/guests?hotelId=${hotelId}&search=${encodeURIComponent(query.trim())}&pageSize=6`)
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [hotelId, query]);

  function handleInputChange(v: string) {
    setQuery(v);
    onChange({ id: null, fullName: v });
    setOpen(true);
  }

  function selectExisting(guest: GuestOption) {
    setQuery(guest.fullName);
    onChange({ id: guest.id, fullName: guest.fullName });
    setResults([]);
    setOpen(false);
  }

  const trimmed = query.trim();
  const exactMatch = results.some((r) => r.fullName.toLowerCase() === trimmed.toLowerCase());
  const showDropdown = open && trimmed.length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <Label htmlFor="guest-search">Guest</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          id="guest-search"
          required
          autoComplete="off"
          placeholder="Search or add a guest…"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          className="pl-9"
        />
      </div>
      {value?.id && <p className="mt-1 text-xs text-emerald-600">Using existing guest — history and notes carry over.</p>}

      {showDropdown && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-popover">
          {searching ? (
            <p className="px-3 py-2 text-sm text-slate-400">Searching…</p>
          ) : (
            <>
              {results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectExisting(g)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{g.fullName}</span>
                  {(g.email || g.phone) && (
                    <span className="text-xs text-slate-400">{[g.email, g.phone].filter(Boolean).join(' · ')}</span>
                  )}
                </button>
              ))}
              {results.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No matching guests.</p>}
              {!exactMatch && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-brand-700 hover:bg-slate-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add new guest &quot;{trimmed}&quot;
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
