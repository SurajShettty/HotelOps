'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export interface RoleGrant {
  hotelId: string | null;
  role: string;
}

const MANAGE_ROLES = ['SUPER_ADMIN', 'OWNER', 'MANAGER'];

// Mirrors the @Roles(...) sets on the corresponding API controllers —
// front-desk operations (guests, check-in, check-out) and housekeeping's own area.
export const RECEPTIONIST_AREA_ROLES = [...MANAGE_ROLES, 'RECEPTIONIST'];
export const HOUSEKEEPING_AREA_ROLES = [...MANAGE_ROLES, 'RECEPTIONIST', 'HOUSEKEEPING'];
export const FINANCE_AREA_ROLES = [...MANAGE_ROLES, 'FINANCE'];

export const ALL_ROLES = [...MANAGE_ROLES, 'RECEPTIONIST', 'HOUSEKEEPING', 'FINANCE'];
// Housekeeping's job is cleaning rooms, not front-desk/finance work — everyone
// else keeps access to nav items scoped this way.
export const NON_HOUSEKEEPING_ROLES = ALL_ROLES.filter((r) => r !== 'HOUSEKEEPING');

/** Fetches the current user's role grants once per session — used to gate role-restricted UI (nav items, actions). */
export function useRoleGrants() {
  const [grants, setGrants] = useState<RoleGrant[] | null>(null);

  useEffect(() => {
    apiFetch<RoleGrant[]>('/users/me/roles')
      .then(setGrants)
      .catch(() => setGrants([]));
  }, []);

  return grants;
}

/** A platform-wide SUPER_ADMIN grant (hotelId null) wins regardless of which hotel is selected; otherwise the grant scoped to `hotelId`. */
export function roleAtHotel(grants: RoleGrant[] | null, hotelId: string | null): string | null {
  if (!grants) return null;
  const superAdmin = grants.find((g) => g.hotelId === null && g.role === 'SUPER_ADMIN');
  if (superAdmin) return superAdmin.role;
  return grants.find((g) => g.hotelId === hotelId)?.role ?? null;
}

export function canManage(role: string | null): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}

export function hasAnyRole(role: string | null, allowed: string[]): boolean {
  return !!role && allowed.includes(role);
}
