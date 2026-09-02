'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bed,
  Building2,
  CalendarRange,
  ChevronDown,
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
// `section` is purely presentational grouping for the sidebar — it plays no
// role in access control, which still runs entirely off `roles`.
const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; roles: string[] | null; section: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: NON_HOUSEKEEPING_ROLES, section: 'Overview' },
  { href: '/rooms', label: 'Rooms', icon: Bed, roles: null, section: 'Operations' },
  { href: '/availability', label: 'Availability', icon: Search, roles: NON_HOUSEKEEPING_ROLES, section: 'Operations' },
  { href: '/bookings', label: 'Bookings', icon: CalendarRange, roles: NON_HOUSEKEEPING_ROLES, section: 'Operations' },
  { href: '/calendar', label: 'Calendar', icon: CalendarRange, roles: NON_HOUSEKEEPING_ROLES, section: 'Operations' },
  { href: '/guests', label: 'Guests', icon: Users, roles: RECEPTIONIST_AREA_ROLES, section: 'Guest Services' },
  { href: '/checkin', label: 'Check-In', icon: LogIn, roles: RECEPTIONIST_AREA_ROLES, section: 'Guest Services' },
  { href: '/checkout', label: 'Check-Out', icon: DoorOpen, roles: RECEPTIONIST_AREA_ROLES, section: 'Guest Services' },
  { href: '/housekeeping', label: 'Housekeeping', icon: Sparkles, roles: HOUSEKEEPING_AREA_ROLES, section: 'Housekeeping' },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: null, section: 'Insights' },
];

// Shown only to MANAGER/OWNER/SUPER_ADMIN — the first role-gated nav entry in the app.
const AUDIT_LOGS_ITEM = { href: '/audit-logs', label: 'Audit Logs', icon: History, roles: null as string[] | null, section: 'Insights' };
const SETTINGS_ITEM = { href: '/settings', label: 'Settings', icon: Settings, roles: NON_HOUSEKEEPING_ROLES };

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
  const showSettings = !SETTINGS_ITEM.roles || hasAnyRole(myRole, SETTINGS_ITEM.roles);
  // Grouped purely for sidebar presentation — order follows first appearance in NAV_ITEMS.
  const sections = navItems.reduce<{ section: string; items: typeof navItems }[]>((acc, item) => {
    const group = acc.find((g) => g.section === item.section);
    if (group) group.items.push(item);
    else acc.push({ section: item.section, items: [item] });
    return acc;
  }, []);

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
      <aside className="flex w-64 shrink-0 flex-col bg-brand-950 px-4 py-5">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gold-400" />
            <span className="text-[15px] font-semibold tracking-tight text-white">HotelOps</span>
          </div>
          <NotificationsBell />
        </div>

        <div className="relative mt-5">
          <select
            className="w-full appearance-none rounded-lg bg-white/[0.04] py-2.5 pl-3 pr-8 text-[13px] font-medium text-white focus:outline-none focus:ring-1 focus:ring-gold-400"
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
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-400" />
        </div>

        <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          {sections.map(({ section, items }) => (
            <div key={section}>
              <div className="px-2.5 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-brand-500">{section}</div>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
                        active ? 'bg-gold-400/[0.14] font-semibold text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className={`h-[17px] w-[17px] ${active ? 'text-gold-400' : 'text-brand-300'}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-4 flex flex-col gap-0.5 border-t border-white/[0.07] pt-3">
          {showSettings && (
            <Link
              href={SETTINGS_ITEM.href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
                pathname === SETTINGS_ITEM.href ? 'bg-gold-400/[0.14] font-semibold text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Settings className={`h-[17px] w-[17px] ${pathname === SETTINGS_ITEM.href ? 'text-gold-400' : 'text-brand-300'}`} />
              Settings
            </Link>
          )}
          <div className="mt-1.5 flex items-center gap-2.5 rounded-lg bg-white/[0.04] p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-brand-950">
              {user ? initials(user.fullName) : ''}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-white">{user?.fullName}</div>
              <div className="truncate text-[11px] text-brand-400">{user?.email}</div>
            </div>
            <button onClick={handleLogout} title="Log out" className="shrink-0 text-brand-400 hover:text-white">
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
