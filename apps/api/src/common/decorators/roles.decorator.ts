import { SetMetadata } from '@nestjs/common';

export type RoleName = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPING' | 'FINANCE';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to users holding one of the given roles for the hotel the
 * request targets (resolved from params/query/body `hotelId`, in that order).
 * A user with a platform-wide SUPER_ADMIN grant (UserHotelRole.hotelId = null)
 * always passes, regardless of which roles are listed.
 */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
