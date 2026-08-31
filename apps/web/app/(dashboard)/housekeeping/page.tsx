'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Card, ErrorBanner, PageHeader } from '@/components/ui/primitives';

interface Task {
  id: string;
  status: 'DIRTY' | 'IN_PROGRESS' | 'INSPECTED' | 'READY';
  priority: number;
  room: { roomNumber: string };
}

const COLUMNS: { key: Task['status']; label: string; next?: Task['status'] }[] = [
  { key: 'DIRTY', label: 'Dirty', next: 'IN_PROGRESS' },
  { key: 'IN_PROGRESS', label: 'In Progress', next: 'INSPECTED' },
  { key: 'INSPECTED', label: 'Inspected', next: 'READY' },
  { key: 'READY', label: 'Ready' },
];

export default function HousekeepingPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

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

  async function advance(task: Task, next: Task['status']) {
    setError(null);
    setMovingId(task.id);
    try {
      await apiFetch(`/housekeeping/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update task');
    } finally {
      setMovingId(null);
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Housekeeping" subtitle="Room readiness, from dirty to ready for check-in." />
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const columnTasks = tasks
              .filter((t) => t.status === col.key)
              .sort((a, b) => b.priority - a.priority);
            return (
              <Card key={col.key} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{col.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{columnTasks.length}</span>
                </div>
                {columnTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-10 text-center">
                    <Sparkles className="h-5 w-5 text-slate-300" />
                    <p className="text-xs text-slate-400">No tasks</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {columnTasks.map((t) => (
                      <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">Room {t.room.roomNumber}</span>
                          {t.priority > 0 && (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Priority</span>
                          )}
                        </div>
                        {col.next && (
                          <button
                            onClick={() => advance(t, col.next!)}
                            disabled={movingId === t.id}
                            className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                          >
                            {movingId === t.id ? 'Moving…' : `Move to ${COLUMNS.find((c) => c.key === col.next)?.label}`}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
