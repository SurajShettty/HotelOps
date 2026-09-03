'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, BellRing, ChevronDown, DoorOpen, Sparkles, UserRound, Users } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { useCurrentHotel } from '@/lib/hotel-context';
import { ErrorBanner } from '@/components/ui/primitives';
import { roleAtHotel, useRoleGrants } from '@/lib/roles';

// Deliberately duplicated from apps/web/app/(dashboard)/housekeeping/page.tsx
// rather than sharing a hook — keeps the desktop board untouched, at the
// cost of the two staying in sync by hand if the API shape changes.

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

interface Task {
  id: string;
  status: 'DIRTY' | 'IN_PROGRESS' | 'INSPECTED' | 'READY';
  priority: number;
  room: { roomNumber: string; status: string };
  assignedToId: string | null;
  assignedTo: { id: string; fullName: string } | null;
  nudgedAt: string | null;
  nudgedBy: { fullName: string } | null;
  serviceRequest: boolean;
}

const NUDGE_HIGHLIGHT_MINUTES = 60;

function minutesAgo(iso: string) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

interface StaffOption {
  id: string;
  fullName: string;
}

const TABS: { key: Task['status']; label: string; next?: Task['status'] }[] = [
  { key: 'DIRTY', label: 'Dirty', next: 'IN_PROGRESS' },
  { key: 'IN_PROGRESS', label: 'In Progress', next: 'INSPECTED' },
  { key: 'INSPECTED', label: 'Inspected', next: 'READY' },
  { key: 'READY', label: 'Ready' },
];

export default function HkTaskBoard() {
  const { hotelId, ready } = useCurrentHotel();
  const roleGrants = useRoleGrants();
  const canReassign = roleAtHotel(roleGrants, hotelId) !== 'HOUSEKEEPING';
  const me = getUser();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Task['status']>('DIRTY');
  const [myTasksOnly, setMyTasksOnly] = useState(true);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    apiFetch<Task[]>(`/housekeeping/tasks?hotelId=${hotelId}`)
      .then(setTasks)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<StaffOption[]>(`/housekeeping/staff?hotelId=${hotelId}`)
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [hotelId]);

  async function advance(task: Task, next: Task['status']) {
    setError(null);
    setMovingId(task.id);
    try {
      await apiFetch(`/housekeeping/tasks/${task.id}/status?hotelId=${hotelId}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update task');
    } finally {
      setMovingId(null);
    }
  }

  async function assign(task: Task, userId: string) {
    setError(null);
    setAssigningId(task.id);
    try {
      await apiFetch(`/housekeeping/tasks/${task.id}/assign?hotelId=${hotelId}`, { method: 'PATCH', body: JSON.stringify({ assignedToId: userId || null }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign staff');
    } finally {
      setAssigningId(null);
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">No hotel selected.</p>;

  const scoped = myTasksOnly && me ? tasks.filter((t) => t.assignedToId === me.id) : tasks;
  const tabCounts = new Map(TABS.map((t) => [t.key, scoped.filter((task) => task.status === t.key).length]));
  const tab = TABS.find((t) => t.key === activeTab)!;
  const visibleTasks = scoped.filter((t) => t.status === activeTab).sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-3">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <button
        type="button"
        onClick={() => setMyTasksOnly((v) => !v)}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors ${
          myTasksOnly ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600'
        }`}
      >
        <Users className="h-3.5 w-3.5" />
        {myTasksOnly ? 'Showing my tasks' : 'Showing full board'}
      </button>

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
              activeTab === t.key ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            <span>{t.label}</span>
            <span className="text-[10px] tabular-nums opacity-70">{tabCounts.get(t.key)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
      ) : visibleTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-14 text-center">
          <Sparkles className="h-5 w-5 text-slate-300" />
          <p className="text-xs text-slate-400">No tasks here</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleTasks.map((t) => {
            const assignedStaff = t.assignedTo;
            const assignOptions = assignedStaff && !staff.some((s) => s.id === assignedStaff.id) ? [...staff, assignedStaff] : staff;
            const nudgeAge = t.nudgedAt ? minutesAgo(t.nudgedAt) : null;
            const recentlyNudged = nudgeAge !== null && nudgeAge < NUDGE_HIGHLIGHT_MINUTES;
            const guestPresent = t.serviceRequest && t.room.status === 'OCCUPIED';
            return (
              <div
                key={t.id}
                className={`rounded-lg border p-3.5 ${
                  recentlyNudged ? 'border-amber-300 bg-amber-50/60' : guestPresent ? 'border-sky-200 bg-sky-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold tabular-nums text-slate-900">Room {t.room.roomNumber}</span>
                  {t.priority > 0 && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Priority</span>
                  )}
                </div>
                {guestPresent && (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-sky-700">
                    <DoorOpen className="h-3 w-3" /> Guest present — knock first
                  </div>
                )}
                {recentlyNudged && (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <BellRing className="h-3 w-3" />
                    {t.nudgedBy ? `${t.nudgedBy.fullName} flagged this` : 'Flagged'} · {nudgeAge}m ago
                  </div>
                )}

                <div className="mt-2.5 flex items-center gap-1.5">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      assignedStaff ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {assignedStaff ? initials(assignedStaff.fullName) : <UserRound className="h-3.5 w-3.5" />}
                  </div>
                  {canReassign ? (
                    <div className="relative min-w-0 flex-1">
                      <select
                        value={t.assignedToId ?? ''}
                        onChange={(e) => assign(t, e.target.value)}
                        disabled={assigningId === t.id}
                        className={`w-full cursor-pointer appearance-none truncate rounded-full border py-1.5 pl-2.5 pr-6 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                          assignedStaff ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-dashed border-slate-300 bg-white text-slate-400'
                        }`}
                      >
                        <option value="">Unassigned</option>
                        {assignOptions.map((s) => (
                          <option key={s.id} value={s.id}>{s.fullName}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                    </div>
                  ) : (
                    <span className="truncate text-xs font-medium text-slate-600">
                      {assignedStaff ? assignedStaff.fullName : 'Unassigned'}
                    </span>
                  )}
                </div>

                {tab.next && (
                  <button
                    onClick={() => advance(t, tab.next!)}
                    disabled={movingId === t.id}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-800 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {movingId === t.id ? 'Moving…' : `Move to ${TABS.find((c) => c.key === tab.next)?.label}`}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
