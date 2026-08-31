# HotelOps

Hotel Management & Booking Administration System — a centralized platform for hotel owners, managers, receptionists, housekeeping, and finance teams to manage rooms, bookings, check-in/out, housekeeping, billing, and reporting.

Full product requirements: [`docs/PRD.md`](docs/PRD.md).

## Structure

```
apps/
  web/        Next.js frontend (App Router). Wired to live data: login, dashboard,
              rooms, bookings, guests (+ profile/history), check-in, check-out,
              housekeeping (kanban), reports. Still static placeholders: calendar,
              settings (no backend yet for pricing rules / user management / notifications).
  api/        NestJS backend — one module per domain (auth, hotels, rooms,
              room-types, guests, bookings, room-blocks, checkin, checkout,
              housekeeping, payments, reports)
packages/
  database/   Prisma schema (the ERD from docs/PRD.md §7) + generated client
docs/
  PRD.md      Full product requirements document
docker-compose.yml   Postgres + Redis + MinIO (S3-compatible) for local dev
```

## Getting started

```bash
npm install
cp .env.example .env          # then point packages/database and apps/api at it
docker compose up -d          # postgres, redis, minio (or use a local Postgres — see below)

npm run db:generate           # generate the Prisma client
npm run db:migrate            # create tables from packages/database/prisma/schema.prisma

# apply the hand-written double-booking guarantee (Postgres EXCLUDE constraint):
psql "$DATABASE_URL" -f packages/database/prisma/manual-sql/001_exclusion_constraints.sql

npm run db:seed               # creates admin@hotelops.local / password123
npm run dev:api               # http://localhost:4000/api/v1
npm run dev:web               # http://localhost:3000
```

**No Docker?** Point `DATABASE_URL` in `.env` (and in `packages/database/.env` and `apps/api/.env` — Prisma CLI and the Nest runtime each load their own `.env` from their own working directory) at any local Postgres 14+. The `hotelops` role needs `CREATEDB` for `prisma migrate dev`'s shadow database.

## Getting a token

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotelops.local","password":"password123"}'
```

Every route except `POST /auth/login` requires `Authorization: Bearer <accessToken>` — see Design notes below.

## Design notes worth knowing before extending this

- **Double-booking prevention is two-layered.** The application checks availability inside a DB transaction (`AvailabilityService.assertRoomsAvailable`, in [`apps/api/src/modules/rooms/availability.service.ts`](apps/api/src/modules/rooms/availability.service.ts)) for a fast, friendly `409 ROOM_UNAVAILABLE`. The actual race-proof guarantee is the Postgres `EXCLUDE` constraint in [`packages/database/prisma/manual-sql/001_exclusion_constraints.sql`](packages/database/prisma/manual-sql/001_exclusion_constraints.sql), which Prisma can't express natively. A trigger keeps `booking_rooms.date_range` in sync with the parent booking's dates/status (NULL unless `CONFIRMED`/`CHECKED_IN`) so the constraint only blocks *active* bookings — verified working: a same-room/overlapping-dates booking attempt gets `409 ROOM_UNAVAILABLE` even bypassing the app-layer check.
- **API responses use a `{ data, error }` envelope** (`ResponseInterceptor` / `HttpExceptionFilter` in `apps/api/src/common/`), matching the contract in `docs/PRD.md` §8.
- **Auth is wired end-to-end**: `POST /auth/login` verifies a bcrypt hash and issues an access token + a refresh token; a global `JwtAuthGuard` (`apps/api/src/common/guards/jwt-auth.guard.ts`) protects every route except ones marked `@Public()`. Use `@CurrentUser()` (`apps/api/src/common/decorators/current-user.decorator.ts`) in controllers to get the authenticated user. `npm run db:seed` creates `admin@hotelops.local` / `password123`, seeds the six `RoleName`s from §4 of the PRD, and grants that user a **platform-wide** `SUPER_ADMIN` role (a `UserHotelRole` row with `hotelId = null` — see the model comment in `schema.prisma`).
- **RBAC is enforced, but only on the endpoints where a `hotelId` is present in the request** (`apps/api/src/common/guards/roles.guard.ts` + `@Roles(...)` decorator, applied to `POST /hotels`, `/room-types`, `/rooms`, `/bookings`, `/rooms/block`). A `SUPER_ADMIN` grant bypasses the hotel check entirely; every other role is checked against `UserHotelRole` for that specific hotel. **Not yet covered**: `POST /checkin`, `/checkout`, `/payments`, `PATCH /housekeeping/tasks/:id`, `/bookings/:id/cancel`, `/rooms/:id/status` — none of their DTOs carry a `hotelId`, so scoping them needs either a DTO change or a lookup through the related booking/room first. There's also no user-management API yet to assign roles through — for now that's done by hand (see `UserHotelRole` in Prisma Studio, or a one-off script).
- **Refresh tokens are implemented and used.** `/auth/login` returns `{ accessToken, refreshToken }`; `POST /auth/refresh` (also `@Public()`) verifies the refresh token against `JWT_REFRESH_SECRET` and issues a rotated pair. The frontend (`apps/web/lib/api.ts`) transparently retries any `401` through `/auth/refresh` once before giving up and redirecting to `/login` — verified by corrupting a live access token in the browser and confirming the app kept working without a redirect.
