'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, DoorOpen, FileText, LogIn, Search, ShieldCheck, Upload } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { formatTime12h, localTimeHHmm, todayInTimeZone } from '@/lib/format';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';
import { RequireRole } from '@/components/ui/require-role';
import { RECEPTIONIST_AREA_ROLES } from '@/lib/roles';
import { ID_DOC_ACCEPT_ATTR, ID_DOCUMENT_TYPES, isIdDocumentPdf, readIdDocumentFile } from '@/lib/id-document';

interface BookingRoom {
  id: string;
  room: { id: string; roomNumber: string; status: string; roomTypeId: string };
}

interface Booking {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guest: {
    fullName: string;
    idDocumentType: string | null;
    idDocumentNumber: string | null;
    idDocumentUrl: string | null;
    idVerifiedAt: string | null;
  } & GuestBadgeInfo;
  bookingRooms: BookingRoom[];
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  status: string;
  roomType: { id: string; name: string; baseRate: string };
}

export default function CheckinPage() {
  const { hotelId, ready, timezone } = useCurrentHotel();
  const [arrivals, setArrivals] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<Record<string, string>>({});
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState('');
  // Bookings that were just checked in this session — kept out of `reload()`
  // (which would otherwise drop them from `arrivals` the instant their status
  // moves off CONFIRMED) until the receptionist dismisses the summary below,
  // so check-in doesn't feel like the row vanished with no confirmation.
  const [justCheckedIn, setJustCheckedIn] = useState<Record<string, { roomNumbers: string[]; depositAmount: number | null; idVerified: boolean }>>({});
  const [hotelPolicy, setHotelPolicy] = useState<{ timezone: string; checkInTime: string; earlyCheckInFee: string } | null>(null);
  const [waiveEarlyFee, setWaiveEarlyFee] = useState<Record<string, boolean>>({});
  // Alternate rooms offered when a guest's reserved room isn't ready yet —
  // either it's dirty/occupied, or (a room's housekeeping status doesn't
  // reflect the reservation calendar) an early arrival's widened stay would
  // overlap another guest's confirmed booking of the same room — so front
  // desk can seat them elsewhere rather than hitting a booking conflict.
  // Keyed by booking id.
  const [altRooms, setAltRooms] = useState<Record<string, AvailableRoom[]>>({});
  // Whether the guest's originally assigned room is actually free for the
  // dates this check-in needs (housekeeping-clean AND no reservation
  // conflict). Undefined until the availability check for that booking
  // resolves.
  const [assignedRoomOk, setAssignedRoomOk] = useState<Record<string, boolean>>({});
  // Set when the assigned room is free to check into right now but has a
  // room block starting later in the stay (e.g. a VIP hold) — informational
  // only, shown as a note before check-in rather than blocking it.
  const [roomBlockNote, setRoomBlockNote] = useState<Record<string, { startDate: string; reason: string } | null>>({});
  const [selectedAltRoom, setSelectedAltRoom] = useState<Record<string, string>>({});
  // Base rate per room type, so alternate-room options can be labeled
  // Upgrade/Downgrade relative to what was actually booked.
  const [roomTypeRates, setRoomTypeRates] = useState<Record<string, number>>({});
  // ID verification, keyed by booking id — seeded from the guest's stored
  // document (if any) once, then left to the receptionist to edit/confirm.
  const [idDocType, setIdDocType] = useState<Record<string, string>>({});
  const [idDocNumber, setIdDocNumber] = useState<Record<string, string>>({});
  const [idDocUrl, setIdDocUrl] = useState<Record<string, string>>({});
  const [idVerified, setIdVerified] = useState<Record<string, boolean>>({});
  const [idSeeded, setIdSeeded] = useState<Record<string, boolean>>({});
  const [docUploadError, setDocUploadError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<{ id: string; baseRate: string }[]>(`/room-types?hotelId=${hotelId}`)
      .then((types) => setRoomTypeRates(Object.fromEntries(types.map((t) => [t.id, Number(t.baseRate)]))))
      .catch(() => setRoomTypeRates({}));
  }, [hotelId]);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CONFIRMED&pageSize=200`)
      .then((res) => setArrivals([...res.items].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  useEffect(() => {
    const toSeed = arrivals.filter((b) => !idSeeded[b.id]);
    if (toSeed.length === 0) return;
    setIdDocType((prev) => {
      const next = { ...prev };
      toSeed.forEach((b) => { next[b.id] = b.guest.idDocumentType ?? ID_DOCUMENT_TYPES[0]; });
      return next;
    });
    setIdDocNumber((prev) => {
      const next = { ...prev };
      toSeed.forEach((b) => { next[b.id] = b.guest.idDocumentNumber ?? ''; });
      return next;
    });
    setIdDocUrl((prev) => {
      const next = { ...prev };
      toSeed.forEach((b) => { next[b.id] = b.guest.idDocumentUrl ?? ''; });
      return next;
    });
    setIdVerified((prev) => {
      const next = { ...prev };
      toSeed.forEach((b) => { next[b.id] = !!b.guest.idVerifiedAt; });
      return next;
    });
    setIdSeeded((prev) => {
      const next = { ...prev };
      toSeed.forEach((b) => { next[b.id] = true; });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivals]);

  // Only offered for single-room bookings — same scope limit as the "move
  // rooms" flows on the Check-Out and Extend Stay pages.
  useEffect(() => {
    if (!hotelId) return;
    const today = todayInTimeZone(timezone);
    for (const b of arrivals) {
      if (b.bookingRooms.length !== 1) continue;
      if (altRooms[b.id]) continue;
      const room = b.bookingRooms[0].room;
      const checkOut = b.checkOutDate.slice(0, 10);
      // Mirrors what the server checks on submit (see CheckinService): once
      // checked in, the room is reserved continuously from today through
      // checkout. A conflicting BOOKING there is a real double-booking and
      // hard-blocks check-in. A conflicting room BLOCK (VIP hold,
      // maintenance…) doesn't — the room is genuinely free right now, so
      // check-in can proceed with a note that it'll need to be moved before
      // the block starts, unless the block already covers today itself.
      apiFetch<{ bookingConflict: boolean; block: { startDate: string; reason: string } | null }>(
        `/rooms/${room.id}/conflict?checkIn=${today}&checkOut=${checkOut}&excludeBookingId=${b.id}`,
      )
        .then((conflict) => {
          // Normalize to a plain YYYY-MM-DD before comparing — the API
          // returns a full ISO timestamp, and comparing that directly
          // against `today` (10 chars) would make a block starting exactly
          // today sort as "later" than today and wrongly look non-blocking.
          const blockStartDate = conflict.block ? conflict.block.startDate.slice(0, 10) : null;
          const hardBlocked = room.status !== 'AVAILABLE' || conflict.bookingConflict || (!!blockStartDate && blockStartDate <= today);
          setAssignedRoomOk((prev) => ({ ...prev, [b.id]: !hardBlocked }));
          setRoomBlockNote((prev) => ({
            ...prev,
            [b.id]: !hardBlocked && conflict.block && blockStartDate ? { startDate: blockStartDate, reason: conflict.block.reason } : null,
          }));
          if (!hardBlocked) {
            setAltRooms((prev) => ({ ...prev, [b.id]: [] }));
            return;
          }
          apiFetch<{ availableRooms: AvailableRoom[] }>(
            `/rooms/availability?hotelId=${hotelId}&checkIn=${today}&checkOut=${checkOut}&excludeBookingId=${b.id}`,
          )
            .then((res) => setAltRooms((prev) => ({ ...prev, [b.id]: res.availableRooms.filter((r) => r.status === 'AVAILABLE' && r.id !== room.id) })))
            .catch(() => setAltRooms((prev) => ({ ...prev, [b.id]: [] })));
        })
        .catch(() => {
          // Conflict check failed — fall back to the housekeeping status
          // alone rather than blocking check-in on a network hiccup.
          setAssignedRoomOk((prev) => ({ ...prev, [b.id]: room.status === 'AVAILABLE' }));
          setRoomBlockNote((prev) => ({ ...prev, [b.id]: null }));
          setAltRooms((prev) => ({ ...prev, [b.id]: [] }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, arrivals]);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<{ timezone: string; checkInTime: string; earlyCheckInFee: string }>(`/hotels/${hotelId}`)
      .then((h) => setHotelPolicy({ timezone: h.timezone, checkInTime: h.checkInTime, earlyCheckInFee: h.earlyCheckInFee }))
      .catch(() => setHotelPolicy(null));
  }, [hotelId]);

  // Client-side estimate only, for the fee hint below — the server checks
  // its own clock against the hotel's policy time when check-in is submitted.
  const isEarlyNow = !!hotelPolicy && localTimeHHmm(new Date(), hotelPolicy.timezone) < hotelPolicy.checkInTime;
  const earlyFeeAmount = hotelPolicy ? Number(hotelPolicy.earlyCheckInFee) : 0;

  function handleIdDocChange(bookingId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDocUploadError((prev) => ({ ...prev, [bookingId]: '' }));
    readIdDocumentFile(file)
      .then((url) => setIdDocUrl((prev) => ({ ...prev, [bookingId]: url })))
      .catch((err: Error) => setDocUploadError((prev) => ({ ...prev, [bookingId]: err.message })));
  }

  async function handleCheckin(booking: Booking) {
    setError(null);
    setCheckingInId(booking.id);
    try {
      const depositRaw = deposits[booking.id];
      const altRoomId = selectedAltRoom[booking.id];
      await apiFetch(`/checkin?hotelId=${hotelId}`, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          roomAssignments: booking.bookingRooms.map((br) => ({ bookingRoomId: br.id, roomId: altRoomId ?? br.room.id })),
          ...(depositRaw ? { depositAmount: Number(depositRaw) } : {}),
          waiveEarlyCheckInFee: !!waiveEarlyFee[booking.id],
          idDocumentType: idDocType[booking.id],
          idDocumentNumber: idDocNumber[booking.id],
          idDocumentUrl: idDocUrl[booking.id],
          idVerified: !!idVerified[booking.id],
        }),
      });
      const altRoomNumber = altRoomId ? altRooms[booking.id]?.find((r) => r.id === altRoomId)?.roomNumber : undefined;
      setJustCheckedIn((prev) => ({
        ...prev,
        [booking.id]: {
          roomNumbers: altRoomNumber ? [altRoomNumber] : booking.bookingRooms.map((br) => br.room.roomNumber),
          depositAmount: depositRaw ? Number(depositRaw) : null,
          idVerified: !!idVerified[booking.id],
        },
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Check-in failed');
    } finally {
      setCheckingInId(null);
    }
  }

  function dismissCheckedIn(bookingId: string) {
    setJustCheckedIn((prev) => {
      const next = { ...prev };
      delete next[bookingId];
      return next;
    });
    reload();
  }

  const visibleArrivals = guestSearch.trim()
    ? arrivals.filter((b) => b.guest.fullName.toLowerCase().includes(guestSearch.trim().toLowerCase()))
    : arrivals;

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <RequireRole allowed={RECEPTIONIST_AREA_ROLES}>
    <div>
      <PageHeader
        title="Check-In"
        subtitle={`Confirmed bookings waiting to arrive.${hotelPolicy ? ` Standard check-in from ${formatTime12h(hotelPolicy.checkInTime)}.` : ''}`}
      />
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {arrivals.length > 0 && (
        <Card className="mb-4 p-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search guest name…"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : arrivals.length === 0 ? (
        <EmptyState icon={<LogIn className="h-8 w-8" />} title="No arrivals waiting" description="Confirmed bookings will show up here, ready to check in." />
      ) : visibleArrivals.length === 0 ? (
        <EmptyState icon={<LogIn className="h-8 w-8" />} title="No matching guest" description="Try a different name." />
      ) : (
        <div className="space-y-3">
          {visibleArrivals.map((b) => {
            const justDone = justCheckedIn[b.id];
            if (justDone) {
              return (
                <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                        {b.guest.fullName} checked in
                        <span className="tabular-nums text-slate-500">— Room {justDone.roomNumbers.join(', ')}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {justDone.depositAmount ? `Deposit collected: ${justDone.depositAmount}` : 'No deposit collected'}
                        {justDone.idVerified ? ' · ID verified' : ''}
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => dismissCheckedIn(b.id)}>
                    Done
                  </Button>
                </Card>
              );
            }
            const isSingleRoom = b.bookingRooms.length === 1;
            const notReady = isSingleRoom
              ? b.bookingRooms[0].room.status !== 'AVAILABLE' || assignedRoomOk[b.id] === false
              : b.bookingRooms.some((br) => br.room.status !== 'AVAILABLE');
            const canOfferAlt = notReady && isSingleRoom;
            const altOptions = altRooms[b.id];
            const altPicked = selectedAltRoom[b.id];
            const idComplete = !!(idDocType[b.id]?.trim() && idDocNumber[b.id]?.trim() && idDocUrl[b.id]);
            const canCheckIn = idComplete && (!notReady || (canOfferAlt && !!altPicked));
            const blockNote = !notReady ? roomBlockNote[b.id] : null;
            return (
              <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {initials(b.guest.fullName)}
                  </span>
                  <div>
                  <div className="flex items-center gap-1.5 font-medium text-slate-900">
                    {b.guest.fullName}
                    <GuestBadges guest={b.guest} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>{b.checkInDate.slice(0, 10)} → {b.checkOutDate.slice(0, 10)}</span>
                    <span>·</span>
                    <span>Room {b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}</span>
                    {b.bookingRooms.map((br) => (
                      <StatusBadge key={br.id} status={br.room.status} />
                    ))}
                  </div>
                  {isEarlyNow && earlyFeeAmount > 0 && (
                    <label className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                      <input
                        type="checkbox"
                        checked={!!waiveEarlyFee[b.id]}
                        onChange={(e) => setWaiveEarlyFee((prev) => ({ ...prev, [b.id]: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      {waiveEarlyFee[b.id]
                        ? `Early check-in fee of ${earlyFeeAmount} waived`
                        : `Early check-in — waive the ${earlyFeeAmount} fee?`}
                    </label>
                  )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32">
                    <Label htmlFor={`deposit-${b.id}`}>Deposit</Label>
                    <Input
                      id={`deposit-${b.id}`}
                      type="number"
                      placeholder="0"
                      value={deposits[b.id] ?? ''}
                      onChange={(e) => setDeposits((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    onClick={() => handleCheckin(b)}
                    disabled={checkingInId === b.id || !canCheckIn}
                    title={
                      !idComplete
                        ? "Upload the guest's ID document, type, and number to check in"
                        : !canCheckIn
                          ? (canOfferAlt ? 'Pick a room to check into' : 'Room is not marked available')
                          : undefined
                    }
                  >
                    {checkingInId === b.id ? 'Checking in…' : altPicked ? `Check In → Room ${altOptions?.find((r) => r.id === altPicked)?.roomNumber}` : 'Check In'}
                  </Button>
                </div>
                <div className="w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <Label htmlFor={`id-type-${b.id}`}>ID document type</Label>
                      <Select
                        id={`id-type-${b.id}`}
                        value={idDocType[b.id] ?? ID_DOCUMENT_TYPES[0]}
                        onChange={(e) => setIdDocType((prev) => ({ ...prev, [b.id]: e.target.value }))}
                      >
                        {ID_DOCUMENT_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`id-number-${b.id}`}>ID number</Label>
                      <Input
                        id={`id-number-${b.id}`}
                        required
                        placeholder="Document number"
                        value={idDocNumber[b.id] ?? ''}
                        onChange={(e) => setIdDocNumber((prev) => ({ ...prev, [b.id]: e.target.value }))}
                      />
                    </div>
                    <label className="flex items-center gap-1.5 self-end pb-2 text-sm text-slate-700 sm:pb-2.5">
                      <input
                        type="checkbox"
                        checked={!!idVerified[b.id]}
                        onChange={(e) => setIdVerified((prev) => ({ ...prev, [b.id]: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      ID verified
                    </label>
                  </div>
                  <div>
                    <Label htmlFor={`id-doc-${b.id}`}>
                      ID document photo/scan {!idDocUrl[b.id] && <span className="text-rose-600">(required)</span>}
                    </Label>
                    <div className="flex items-center gap-3">
                      {idDocUrl[b.id] ? (
                        isIdDocumentPdf(idDocUrl[b.id]) ? (
                          <a
                            href={idDocUrl[b.id]}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-brand-700"
                          >
                            <FileText className="h-5 w-5" />
                          </a>
                        ) : (
                          <a href={idDocUrl[b.id]} target="_blank" rel="noreferrer" className="shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={idDocUrl[b.id]} alt="ID document" className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
                          </a>
                        )
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300">
                          <Upload className="h-5 w-5" />
                        </span>
                      )}
                      <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        {idDocUrl[b.id] ? 'Replace file' : 'Upload file'}
                        <input
                          id={`id-doc-${b.id}`}
                          type="file"
                          accept={ID_DOC_ACCEPT_ATTR}
                          onChange={(e) => handleIdDocChange(b.id, e)}
                          className="hidden"
                        />
                      </label>
                      {docUploadError[b.id] && <span className="text-xs text-rose-600">{docUploadError[b.id]}</span>}
                    </div>
                  </div>
                  {b.guest.idVerifiedAt && (
                    <p className="flex items-center gap-1 text-xs text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Previously verified on {b.guest.idVerifiedAt.slice(0, 10)}
                    </p>
                  )}
                  {blockNote && (
                    <p className="mt-2 text-xs text-amber-700">
                      Note: room {b.bookingRooms[0].room.roomNumber} is free to check into now, but it's held for {blockNote.reason.toLowerCase()} from {blockNote.startDate} — move this guest to another room before then.
                    </p>
                  )}
                </div>
                {canOfferAlt && (
                  <div className="w-full space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      Room {b.bookingRooms[0].room.roomNumber} isn't available for these dates — check in to another room instead:
                    </p>
                    {altOptions === undefined ? (
                      <p className="text-xs text-amber-700">Checking other rooms…</p>
                    ) : altOptions.length === 0 ? (
                      <p className="text-xs text-amber-700">No other rooms are free right now — wait for this room to be ready.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {altOptions.map((r) => {
                          const selected = altPicked === r.id;
                          const originalRate = roomTypeRates[b.bookingRooms[0].room.roomTypeId];
                          const altRate = Number(r.roomType.baseRate);
                          const tier =
                            originalRate === undefined || altRate === originalRate
                              ? null
                              : altRate > originalRate
                                ? 'upgrade'
                                : 'downgrade';
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setSelectedAltRoom((prev) => ({ ...prev, [b.id]: r.id }))}
                              className={`flex items-start gap-2 rounded-lg border p-2 text-left transition-colors ${
                                selected
                                  ? 'border-brand-600 bg-brand-50 ring-1 ring-inset ring-brand-600'
                                  : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
                              }`}
                            >
                              <DoorOpen className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-brand-700' : 'text-slate-400'}`} />
                              <span className="min-w-0">
                                <span className={`block truncate text-sm font-medium ${selected ? 'text-brand-900' : 'text-slate-900'}`}>
                                  Room {r.roomNumber}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <span className="truncate">{r.roomType.name}</span>
                                  {tier && (
                                    <span
                                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                        tier === 'upgrade' ? 'bg-gold-50 text-gold-700' : 'bg-slate-200 text-slate-600'
                                      }`}
                                    >
                                      {tier === 'upgrade' ? 'Upgrade' : 'Downgrade'}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </RequireRole>
  );
}
