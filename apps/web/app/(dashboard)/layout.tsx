'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bed,
  Building2,
  CalendarRange,
  ClipboardCheck,
  DoorOpen,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { clearSession, getToken, getUser, StoredUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { HotelProvider, useCurrentHotel } from '@/lib/hotel-context';
import { canManage, hasAnyRole, HOUSEKEEPING_AREA_ROLES, NON_HOUSEKEEPING_ROLES, RECEPTIONIST_AREA_ROLES, roleAtHotel, useRoleGrants } from '@/lib/roles';
import { NotificationsBell } from '@/components/ui/notifications-bell';

// `roles: null` means every role sees the item — matches endpoints left
// open to all staff (see the API's @Roles(...) audit). Everything else
// mirrors the corresponding controller's role set exactly. Housekeeping's
// job is cleaning rooms, not front-desk/scheduling/finance/admin work, so
// it's the one role scoped down across several items below.
const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; roles: string[] | null }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: NON_HOUSEKEEPING_ROLES },
  { href: '/rooms', label: 'Rooms', icon: Bed, roles: null },
  { href: '/availability', label: 'Availability', icon: Search, roles: NON_HOUSEKEEPING_ROLES },
  { href: '/bookings', label: 'Bookings', icon: CalendarRange, roles: NON_HOUSEKEEPING_ROLES },
  { href: '/calendar', label: 'Calendar', icon: CalendarRange, roles: NON_HOUSEKEEPING_ROLES },
  { href: '/guests', label: 'Guests', icon: Users, roles: RECEPTIONIST_AREA_ROLES },
  { href: '/checkin', label: 'Check-In', icon: LogIn, roles: RECEPTIONIST_AREA_ROLES },
  { href: '/checkout', label: 'Check-Out', icon: DoorOpen, roles: RECEPTIONIST_AREA_ROLES },
  { href: '/housekeeping', label: 'Housekeeping', icon: Sparkles, roles: HOUSEKEEPING_AREA_ROLES },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: null },
  { href: '/settings', label: 'Settings', icon: Settings, roles: NON_HOUSEKEEPING_ROLES },
];

// Shown only to MANAGER/OWNER/SUPER_ADMIN — the first role-gated nav entry in the app.
const AUDIT_LOGS_ITEM = { href: '/audit-logs', label: 'Audit Logs', icon: History };

interface Hotel {
  id: string;
  name: string;
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const { hotelId, setHotelId, ready } = useCurrentHotel();
  const roleGrants = useRoleGrants();
  const myRole = roleAtHotel(roleGrants, hotelId);
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || hasAnyRole(myRole, item.roles));
  const navItems = canManage(myRole) ? [...visibleItems, AUDIT_LOGS_ITEM] : visibleItems;

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
    setCheckedAuth(true);
  }, [router]);

  useEffect(() => {
    if (!checkedAuth) return;
    apiFetch<Hotel[]>('/hotels')
      .then((data) => {
        setHotels(data);
        if (!hotelId && data.length > 0) {
          setHotelId(data[0].id);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth]);

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  if (!checkedAuth || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-brand-950 text-brand-100">
        <div className="flex items-center justify-between px-5 py-5 text-white">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gold-400" />
            <span className="text-base font-semibold tracking-tight">HotelOps</span>
          </div>
          <NotificationsBell />
        </div>

        <div className="px-4 pb-4">
          <select
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
            value={hotelId ?? ''}
            onChange={(e) => setHotelId(e.target.value)}
          >
            {hotels.length === 0 && <option value="">No hotels yet</option>}
            {hotels.map((h) => (
              <option key={h.id} value={h.id} className="text-slate-900">
                {h.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-white/10 font-medium text-white'
                    : 'text-brand-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-gold-400' : 'text-brand-400'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-400/20 text-xs font-semibold text-gold-300">
              {user ? initials(user.fullName) : ''}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user?.fullName}</div>
              <div className="truncate text-xs text-brand-300">{user?.email}</div>
            </div>
            <button onClick={handleLogout} title="Log out" className="text-brand-300 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <HotelProvider>
      <DashboardShell>{children}</DashboardShell>
    </HotelProvider>
  );
}
