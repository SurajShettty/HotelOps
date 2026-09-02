'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from './api';

const HOTEL_ID_KEY = 'hotelops_hotel_id';

interface HotelContextValue {
  hotelId: string | null;
  setHotelId: (id: string) => void;
  ready: boolean;
  /** The current hotel's IANA timezone — falls back to the browser's own zone until the hotel record loads. */
  timezone: string;
}

const HotelContext = createContext<HotelContextValue | null>(null);

export function HotelProvider({ children }: { children: React.ReactNode }) {
  const [hotelId, setHotelIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  useEffect(() => {
    setHotelIdState(localStorage.getItem(HOTEL_ID_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<{ timezone: string }>(`/hotels/${hotelId}`)
      .then((h) => setTimezone(h.timezone))
      .catch(() => {});
  }, [hotelId]);

  const setHotelId = useCallback((id: string) => {
    localStorage.setItem(HOTEL_ID_KEY, id);
    setHotelIdState(id);
  }, []);

  return <HotelContext.Provider value={{ hotelId, setHotelId, ready, timezone }}>{children}</HotelContext.Provider>;
}

export function useCurrentHotel() {
  const ctx = useContext(HotelContext);
  if (!ctx) {
    throw new Error('useCurrentHotel must be used within a HotelProvider');
  }
  return ctx;
}
