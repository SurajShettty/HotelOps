# Hotel Management & Booking Administration System
## Product Requirements Document (PRD)

**Version:** 1.0
**Status:** Draft for engineering kickoff
**Owner:** Product / Suraj Shetty

---

## 1. Executive Summary

### 1.1 Product Vision
A centralized, web-based hotel operations platform that lets hotel owners, managers, receptionists, housekeeping staff, and finance teams manage room inventory, bookings, blocking, occupancy, check-in/out, billing, housekeeping, and reporting from a single system of record — replacing spreadsheets, paper registers, and disconnected tools.

### 1.2 Product Mission
Eliminate double bookings, reduce front-desk turnaround time, give owners real-time visibility into occupancy and revenue, and give housekeeping a clear, trackable queue of work — for independent hotels and small chains (1–50 properties).

### 1.3 Business Goals
- Reduce double-booking incidents to zero via atomic availability locking.
- Cut check-in time from ~8 minutes (manual) to under 2 minutes.
- Give owners same-day visibility into occupancy, ADR, and RevPAR instead of end-of-month reconciliation.
- Support multi-property operation from one login (chain-ready from day one).
- Reach positive unit economics on a per-property SaaS pricing model within 12 months of GA.

### 1.4 Success Metrics / KPIs
| Metric | Target |
|---|---|
| Double-booking rate | 0% (hard constraint, not just a target) |
| Average check-in time | < 2 min |
| Average check-out time | < 3 min |
| Occupancy dashboard data lag | < 1 min from source event |
| System uptime (core booking path) | 99.9% monthly |
| P95 API latency (booking, availability) | < 400ms |
| Housekeeping task turnaround (dirty → ready) | < 45 min average |
| Booking creation success rate (no server errors) | > 99.5% |

---

## 2. Problem Statement

### 2.1 Current Industry Challenges
Independent and small-chain hotels typically run operations across a patchwork of a paper/Excel register, a basic OTA extranet, WhatsApp for staff coordination, and a standalone billing tool. There is no single source of truth for room state.

### 2.2 Manual Process Issues
- Front desk and reservations teams update different registers, causing state drift.
- Housekeeping status is tracked verbally or on a whiteboard, invisible to reservations.
- Rate changes (seasonal/weekend) are applied inconsistently across channels.
- Invoicing/tax calculation is manual and error-prone, especially with split payments.

### 2.3 Double-Booking Risks
- No atomic hold on a room-date range during booking creation means two agents can sell the same room for overlapping dates.
- Room blocks for maintenance/VIP use are not visible to whoever is taking a phone booking.
- Overbooking on OTAs isn't reconciled against on-property availability in real time.

### 2.4 Operational Inefficiencies
- No unified dashboard for arrivals/departures/occupancy, so managers assemble reports by hand.
- Guest history isn't retained across stays, so repeat-guest recognition and upsell are missed.
- Refunds and cancellations aren't audit-logged, creating reconciliation disputes with finance.

---

## 3. User Personas

### 3.1 Hotel Owner
- **Goals:** Maximize RevPAR and occupancy; monitor performance across properties without being on-site.
- **Responsibilities:** Set pricing strategy, approve large refunds/discounts, review financial reports.
- **Workflows:** Logs in weekly (or via mobile) to check revenue dashboard, occupancy trend, and manager-flagged issues.
- **Pain points:** No real-time visibility; relies on manager's verbal/WhatsApp summaries; can't compare properties.
- **Success criteria:** Can answer "how are we doing this month" in under 60 seconds from the dashboard.

### 3.2 Hotel Manager
- **Goals:** Run daily operations smoothly; hit occupancy/revenue targets; keep staff coordinated.
- **Responsibilities:** Approve room blocks, oversee pricing calendar, resolve escalations, manage staff shifts.
- **Workflows:** Starts the day reviewing arrivals/departures and housekeeping readiness; intervenes on overbooking conflicts.
- **Pain points:** Reconciling OTA bookings with in-house register; last-minute room availability surprises.
- **Success criteria:** Zero double bookings; housekeeping queue empties before next check-in wave.

### 3.3 Receptionist
- **Goals:** Check guests in/out quickly and accurately; sell walk-in rooms without conflicts.
- **Responsibilities:** Create/modify bookings, verify ID, assign rooms, collect payment, generate folios.
- **Workflows:** Handles a queue of arrivals, walk-ins, and phone bookings simultaneously; needs instant availability truth.
- **Pain points:** Slow lookup of guest history; unclear which rooms are actually clean and ready.
- **Success criteria:** Can complete a check-in in under 2 minutes with correct room and folio.

### 3.4 Housekeeping Staff
- **Goals:** Know exactly which rooms need cleaning and in what priority order.
- **Responsibilities:** Update room status (dirty → cleaning → inspected → ready), report maintenance issues.
- **Workflows:** Receives a prioritized task list (e.g., rooms with same-day arrivals first), marks tasks complete on a phone/tablet.
- **Pain points:** No visibility into which rooms are urgent (arriving today) vs. can wait.
- **Success criteria:** Task list is always accurate and prioritized; no guest checked into an unready room.

### 3.5 Finance / Admin
- **Goals:** Accurate, auditable financial records; clean tax and invoicing compliance.
- **Responsibilities:** Reconcile payments, issue invoices/credit notes, process refunds, run revenue reports.
- **Workflows:** End-of-day reconciliation of cash/card/UPI against system totals; monthly tax reporting.
- **Pain points:** Manual invoice generation, inconsistent tax application, no audit trail for refunds.
- **Success criteria:** End-of-day reconciliation takes minutes, not hours; every financial change is audit-logged.

---

## 4. User Roles & Permissions (RBAC Matrix)

Roles are scoped per-hotel except **Super Admin**, which is platform-wide.

| Module / Action | Super Admin | Owner | Manager | Receptionist | Housekeeping | Finance |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Manage hotels/properties | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Manage users & roles | ✅ | ✅ (own hotel) | ✅ (limited) | ❌ | ❌ | ❌ |
| Room & room-type config | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pricing management | ✅ | ✅ | ✅ | 👁 view | ❌ | 👁 view |
| Create/edit/cancel booking | ✅ | ✅ | ✅ | ✅ | ❌ | 👁 view |
| Room blocking | ✅ | ✅ | ✅ | 👁 view (request) | ❌ | ❌ |
| Check-in / check-out | ✅ | ✅ | ✅ | ✅ | ❌ | 👁 view |
| Payment collection | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Refunds | ✅ | ✅ | ✅ (up to limit) | ❌ | ❌ | ✅ |
| Invoice generation | ✅ | ✅ | ✅ | ✅ (view/print) | ❌ | ✅ |
| Housekeeping task management | ✅ | ✅ | ✅ | 👁 view | ✅ (own tasks) | ❌ |
| Guest profile management | ✅ | ✅ | ✅ | ✅ | ❌ | 👁 view |
| Reports & analytics | ✅ | ✅ | ✅ | 👁 (own shift) | ❌ | ✅ |
| Audit logs | ✅ | ✅ | 👁 view | ❌ | ❌ | 👁 view |
| System/global settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

✅ = full access · 👁 = read-only · ❌ = no access. Enforced server-side via role + hotel-scope claims on every request, not just hidden in the UI.

---

## 5. Functional Modules

### 5.1 Dashboard
- Occupancy KPIs (today, 7-day, 30-day), arrivals list, departures list, revenue snapshot (today/MTD), housekeeping status summary, alerts (overbookings, unassigned rooms, overdue tasks).

### 5.2 Room Management
- **Room Types:** name, description, base occupancy, max occupancy, base rate, amenities, images.
- **Room Inventory:** physical rooms mapped to a room type, floor, status (available/occupied/blocked/dirty/out-of-order).
- **Amenities:** master list assignable to room types or individual rooms.
- **Pricing:** base rate per room type with override layers (see 5.9).

### 5.3 Booking Management
- Create / edit / cancel bookings; multi-room, multi-night bookings; hold-then-confirm flow; source tracking (direct, phone, walk-in, OTA).
- **Booking Lifecycle:** `Draft → Confirmed → CheckedIn → CheckedOut → Completed`, with `Cancelled` and `NoShow` as terminal branches.
- **Availability Validation:** every booking/room-block write acquires a row-level lock (or advisory lock) on the room-date range to guarantee no overlap before commit.

### 5.4 Room Blocking
- Reasons: Maintenance, Renovation, VIP Reservation, Internal Use. Blocks occupy the same availability timeline as bookings and are validated against the same overlap constraint.

### 5.5 Availability Calendar
- Daily / weekly / monthly grid views, one row per room, drag-and-drop to move or extend a booking (re-validates availability on drop), color-coded by status.

### 5.6 Guest Management
- Profiles (contact info, ID documents, preferences), stay history, notes (staff-visible), document uploads (ID proof, scanned forms) stored in S3.

### 5.7 Check-In Management
- Identity verification (ID capture/scan), room assignment (auto-suggest from booking + housekeeping-ready rooms), payment collection (deposit or full), digital registration card.

### 5.8 Check-Out Management
- Folio review, additional charges (minibar, laundry, etc.), tax computation, discount application, invoice generation (PDF), final payment settlement, room status flips to `Dirty`.

### 5.9 Pricing Management
- Base pricing per room type, seasonal rate calendars, weekend rate rules, dynamic pricing hooks (occupancy-based multiplier), manual override per booking with reason + audit log.

### 5.10 Housekeeping Management
- Task queue generated from checkouts/arrivals, statuses `Dirty → InProgress → Inspected → Ready`, priority by same-day arrival, staff assignment, maintenance-issue flagging.

### 5.11 Payments & Billing
- Methods: Cash, Card, UPI; partial/split payments; refunds with reason + approver; ties to invoice/folio line items.

### 5.12 Reporting & Analytics
- Occupancy, Revenue, Booking, Cancellation, and Housekeeping reports; date-range filters; CSV export.

---

## 6. Booking Lifecycle Workflow

```
                     ┌───────────┐
                     │   DRAFT   │  (cart/hold, TTL 15 min)
                     └─────┬─────┘
                           │ payment/confirmation
                           ▼
                     ┌───────────┐        cancel/no-show
                     │ CONFIRMED │ ─────────────────────────┐
                     └─────┬─────┘                          │
                           │ guest arrives                  ▼
                           ▼                          ┌───────────┐
                     ┌───────────┐                    │ CANCELLED │
                     │ CHECKED_IN│                    │ / NO_SHOW │
                     └─────┬─────┘                    └───────────┘
                           │ guest departs, folio settled
                           ▼
                     ┌───────────┐
                     │ CHECKED_OUT│
                     └─────┬─────┘
                           │ invoice finalized
                           ▼
                     ┌───────────┐
                     │ COMPLETED │
                     └───────────┘
```

**Availability check sequence (every create/edit/block):**
1. Request room-date range → 2. Acquire lock on (room_id, date_range) → 3. Query overlapping bookings/blocks → 4. If none, reserve and commit → 5. Release lock. Steps 2–5 execute inside a single DB transaction to prevent race conditions between concurrent agents.

---

## 7. Database Design

### 7.1 Entity Overview
`Users, Roles, Hotels, Rooms, RoomTypes, Guests, Bookings, BookingRooms, Payments, Invoices, HousekeepingTasks, RoomBlocks, AuditLogs`

### 7.2 Key Relationships
- Hotel 1—N Rooms, RoomTypes, Users(staff), Guests(scoped), Bookings
- RoomType 1—N Rooms
- Booking 1—N BookingRooms (supports multi-room bookings); BookingRoom N—1 Room
- Booking 1—N Payments; Booking 1—1 Invoice (finalized at checkout)
- Room 1—N HousekeepingTasks, RoomBlocks
- User N—1 Role (per-hotel assignment via a join table `UserHotelRoles` for multi-property staff)
- All mutating actions write an `AuditLog` row (actor, entity, action, before/after diff, timestamp)

### 7.3 Schema (abridged DDL)

```sql
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  address JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL -- SUPER_ADMIN, OWNER, MANAGER, RECEPTIONIST, HOUSEKEEPING, FINANCE
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_hotel_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id),
  UNIQUE(user_id, hotel_id, role_id)
);

CREATE TABLE room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  base_occupancy INT NOT NULL DEFAULT 2,
  max_occupancy INT NOT NULL DEFAULT 3,
  base_rate NUMERIC(10,2) NOT NULL,
  amenities JSONB DEFAULT '[]',
  UNIQUE(hotel_id, name)
);

CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES room_types(id),
  room_number VARCHAR(20) NOT NULL,
  floor VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, OCCUPIED, DIRTY, OUT_OF_ORDER
  UNIQUE(hotel_id, room_number)
);

CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  id_document_type VARCHAR(50),
  id_document_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, NO_SHOW, COMPLETED
  source VARCHAR(30) NOT NULL DEFAULT 'DIRECT',
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out_date > check_in_date)
);

CREATE TABLE booking_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id),
  rate_applied NUMERIC(10,2) NOT NULL,
  UNIQUE(room_id, booking_id)
);
-- Overlap prevention (Postgres): EXCLUDE USING gist on (room_id WITH =, daterange(check_in,check_out) WITH &&)

CREATE TABLE room_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  reason VARCHAR(30) NOT NULL, -- MAINTENANCE, RENOVATION, VIP, INTERNAL
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method VARCHAR(20) NOT NULL, -- CASH, CARD, UPI
  type VARCHAR(20) NOT NULL DEFAULT 'CHARGE', -- CHARGE, REFUND
  reference VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  subtotal NUMERIC(10,2) NOT NULL,
  tax_total NUMERIC(10,2) NOT NULL,
  discount_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(10,2) NOT NULL,
  pdf_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE housekeeping_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'DIRTY', -- DIRTY, IN_PROGRESS, INSPECTED, READY
  assigned_to UUID REFERENCES users(id),
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id),
  actor_id UUID REFERENCES users(id),
  entity VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bookings_hotel_dates ON bookings(hotel_id, check_in_date, check_out_date);
CREATE INDEX idx_rooms_hotel_status ON rooms(hotel_id, status);
CREATE INDEX idx_housekeeping_status ON housekeeping_tasks(status, priority DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
```

The canonical, engineer-maintained version of this schema lives in [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma).

---

## 8. API Design

Base path: `/api/v1`. Auth: Bearer JWT (short-lived access + refresh token). All responses: `{ data, error }` envelope.

### `POST /bookings`
- **Request:** `{ hotelId, guestId, checkInDate, checkOutDate, rooms: [{roomId, rate}], source }`
- **Response 201:** `{ data: { bookingId, status: "CONFIRMED", ... } }`
- **Validation:** checkOutDate > checkInDate; each roomId belongs to hotelId; no overlapping booking/block for any roomId in range.
- **Errors:** `400 VALIDATION_ERROR`, `409 ROOM_UNAVAILABLE`, `404 GUEST_NOT_FOUND`

### `GET /rooms/availability?hotelId=&checkIn=&checkOut=&roomTypeId=`
- **Response 200:** `{ data: { availableRooms: [{roomId, roomNumber, roomTypeId, rate}] } }`
- **Errors:** `400 VALIDATION_ERROR`

### `POST /rooms/block`
- **Request:** `{ roomId, reason, startDate, endDate, notes }`
- **Response 201:** `{ data: { blockId } }`
- **Validation:** reason ∈ {MAINTENANCE, RENOVATION, VIP, INTERNAL}; no overlap with existing bookings/blocks.
- **Errors:** `400 VALIDATION_ERROR`, `409 ROOM_UNAVAILABLE`

### `POST /checkin`
- **Request:** `{ bookingId, roomAssignments: [{bookingRoomId, roomId}], idDocument, depositPayment? }`
- **Response 200:** `{ data: { bookingId, status: "CHECKED_IN" } }`
- **Validation:** booking status must be `CONFIRMED`; assigned rooms must be housekeeping status `READY`.
- **Errors:** `400 VALIDATION_ERROR`, `409 ROOM_NOT_READY`, `409 INVALID_STATE`

### `POST /checkout`
- **Request:** `{ bookingId, additionalCharges: [{description, amount}], discounts: [{description, amount}], paymentMethod, paymentAmount }`
- **Response 200:** `{ data: { invoiceId, pdfUrl, grandTotal } }`
- **Validation:** booking status must be `CHECKED_IN`; folio balance must reach zero (or be flagged as pending).
- **Errors:** `400 VALIDATION_ERROR`, `409 INVALID_STATE`, `402 PAYMENT_INCOMPLETE`

### Additional endpoints (contract-level, same conventions)
`GET/POST/PATCH /guests`, `GET/PATCH/DELETE /bookings/:id`, `POST /bookings/:id/cancel`, `GET /housekeeping/tasks`, `PATCH /housekeeping/tasks/:id`, `POST /payments`, `POST /payments/:id/refund`, `GET /reports/occupancy|revenue|bookings|cancellations|housekeeping`.

**Standard error codes:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `422 UNPROCESSABLE`, `500 INTERNAL_ERROR`.

---

## 9. UI/UX Requirements (Wireframe Descriptions)

| Screen | Key Elements |
|---|---|
| **Login** | Email/password, "forgot password", hotel selector (if multi-property user), SSO-ready layout |
| **Dashboard** | KPI cards (occupancy %, revenue today, arrivals, departures), arrivals/departures lists, alerts panel |
| **Rooms** | Filterable grid/list by room type, floor, status; bulk status edit; room-type management side panel |
| **Bookings** | Searchable/filterable table, create-booking wizard (dates → room type → room → guest → payment), status badges |
| **Calendar** | Room-by-date grid, day/week/month toggle, drag-and-drop booking bars, color legend (confirmed/checked-in/blocked) |
| **Guests** | Searchable directory, profile detail with stay history timeline, notes, document uploads |
| **Check-In** | Arrivals queue, ID capture, room auto-suggest (ready rooms only), payment collection panel |
| **Check-Out** | Folio line items, add-charge/discount inputs, tax breakdown, payment settlement, invoice preview/print |
| **Housekeeping** | Kanban-style board (Dirty / In Progress / Inspected / Ready), priority flags, staff assignment |
| **Reports** | Report type selector, date-range picker, chart + table view, CSV export button |
| **Settings** | Hotel profile, room types, pricing rules, user & role management, notification preferences |

---

## 10. Non-Functional Requirements

- **Security:** JWT auth with refresh rotation, bcrypt/argon2 password hashing, RBAC enforced server-side on every route, input validation (class-validator/Zod), rate limiting on auth endpoints, encrypted PII at rest for ID documents, HTTPS-only, OWASP Top-10 mitigations (parameterized queries via Prisma, CSRF protection on cookie-based flows, output encoding to prevent XSS).
- **Scalability:** Stateless API instances behind a load balancer; horizontal scaling; Redis for session/cache and availability-lock coordination; read replicas for reporting queries as data grows.
- **Availability:** 99.9% target on the core booking path; multi-AZ DB deployment; graceful degradation (read-only mode) if the write path is impaired.
- **Performance:** P95 < 400ms on availability/booking endpoints; pagination on all list endpoints; DB indexes per §7.3.
- **Logging:** Structured JSON logs (request id, actor, hotel id); centralized log aggregation.
- **Monitoring:** Health checks, uptime monitoring, error-rate and latency alerting, DB connection-pool metrics.

---

## 11. Audit & Activity Logs

Every create/update/delete on `Bookings`, `Payments`, `RoomBlocks`, `Invoices`, and `Users` writes an immutable `AuditLog` row capturing actor, entity, action, before/after diff, and timestamp (see §7.3). Audit logs are append-only, retained indefinitely, and visible (read-only) to Owner/Manager/Finance roles.

---

## 12. Notifications

| Channel | Trigger events |
|---|---|
| Email | Booking confirmation, cancellation, invoice/receipt, password reset |
| SMS | Booking confirmation, check-in reminder (day-of), OTP for verification |
| WhatsApp | Booking confirmation, check-in reminder, housekeeping task alerts (staff-facing) |

Delivered via a queued notification service (BullMQ on Redis) with template management and per-hotel channel configuration.

---

## 13. Architecture

- **Frontend:** React / Next.js (App Router), TypeScript, server components for data-heavy views, Tailwind for styling.
- **Backend:** Node.js / NestJS, modular per domain (auth, hotels, rooms, bookings, guests, housekeeping, payments, reports).
- **Database:** PostgreSQL (via Prisma ORM), with the `btree_gist` extension enabled for overlap-exclusion constraints.
- **Cache / Queues:** Redis — caching availability lookups, BullMQ for notifications and background jobs.
- **Storage:** S3-compatible object storage for guest documents, invoices (PDF), and room-type images.

```
┌────────────┐      HTTPS      ┌──────────────┐
│  Next.js   │ ───────────────▶│   NestJS API  │
│  (web app) │◀─────────────── │  (REST, JWT)  │
└────────────┘                 └──────┬───────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
          ┌─────────────┐      ┌─────────────┐       ┌─────────────┐
          │ PostgreSQL  │      │    Redis    │       │  S3 Storage │
          │ (Prisma)    │      │ cache/queue │       │  (docs/pdfs)│
          └─────────────┘      └─────────────┘       └─────────────┘
```

---

## 14. Acceptance Criteria (representative sample)

**Booking creation**
- *Given* a room is available for the requested date range, *when* a receptionist submits a booking, *then* the booking is created with status `CONFIRMED` and the room is no longer offered as available for that range.
- *Given* two agents attempt to book the same room for overlapping dates concurrently, *when* both submit, *then* exactly one succeeds and the other receives `409 ROOM_UNAVAILABLE`.

**Check-in**
- *Given* a confirmed booking whose assigned room has housekeeping status `READY`, *when* the receptionist checks in the guest, *then* booking status becomes `CHECKED_IN` and room status becomes `OCCUPIED`.
- *Given* the assigned room is not `READY`, *when* check-in is attempted, *then* the system blocks it with `409 ROOM_NOT_READY` and suggests an alternate ready room of the same type.

**Check-out**
- *Given* a checked-in booking, *when* the receptionist finalizes checkout with full payment, *then* an invoice is generated, booking status becomes `CHECKED_OUT`, and room status becomes `DIRTY` (creating a housekeeping task).

**Room blocking**
- *Given* a room has no existing booking/block in the requested range, *when* a manager creates a block, *then* the room is excluded from availability for that range and the block is audit-logged.

**Housekeeping**
- *Given* a room is marked `DIRTY`, *when* staff update it through `IN_PROGRESS → INSPECTED → READY`, *then* it becomes eligible for check-in assignment only at `READY`.

*(Full acceptance-criteria sets per module to be maintained as Given/When/Then specs in the issue tracker, linked from each module's epic.)*

---

## 15. Development Roadmap

### MVP (Phase 1) — Core operations
- Auth + RBAC, Hotel/Room/RoomType setup, Booking CRUD with availability locking, Room blocking, Check-in/Check-out, basic Housekeeping board, Dashboard KPIs, Cash/Card/UPI payment logging, PDF invoice generation.
- **Est. effort:** 8–10 weeks, 3–4 engineers. **Dependencies:** none (greenfield). **Risks:** availability-locking correctness under concurrency; ID-document storage compliance.

### Phase 2 — Revenue & guest experience
- Seasonal/weekend/dynamic pricing, Availability calendar with drag-and-drop, Guest profiles with history/notes/documents, Reporting & analytics suite, Notifications (Email/SMS/WhatsApp).
- **Est. effort:** 6–8 weeks. **Dependencies:** MVP data model stable. **Risks:** WhatsApp Business API approval lead time.

### Phase 3 — Scale & multi-property
- Multi-property chain support, OTA channel-manager integration, advanced audit/reporting exports, read-replica reporting, refund workflows with approval chains.
- **Est. effort:** 8+ weeks. **Dependencies:** Phase 1 & 2 stable in production. **Risks:** OTA API rate limits and mapping complexity; read-replica lag affecting report accuracy.

### Cross-cutting assumptions
- Single currency and tax regime at MVP (India/GST-style single tax rate); multi-currency deferred to a later phase.
- One hotel chain's properties share a single tenant; cross-tenant data isolation is enforced by `hotel_id` scoping everywhere, not separate databases, at this scale.
