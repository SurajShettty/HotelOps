'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const HOTEL_ID_KEY = 'hotelops_hotel_id';

interface HotelContextValue {
  hotelId: string | null;
  setHotelId: (id: string) => void;
  ready: boolean;
}

const HotelContext = createContext<HotelContextValue | null>(null);

export function HotelProvider({ children }: { children: React.ReactNode }) {
  const [hotelId, setHotelIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHotelIdState(localStorage.getItem(HOTEL_ID_KEY));
    setReady(true);
  }, []);

  const setHotelId = useCallback((id: string) => {
    localStorage.setItem(HOTEL_ID_KEY, id);
    setHotelIdState(id);
  }, []);

  return <HotelContext.Provider value={{ hotelId, setHotelId, ready }}>{children}</HotelContext.Provider>;
}

export function useCurrentHotel() {
  const ctx = useContext(HotelContext);
  if (!ctx) {
    throw new Error('useCurrentHotel must be used within a HotelProvider');
  }
  return ctx;
}
