// One-off: adds a handful of upcoming CONFIRMED bookings spread across
// September so the Calendar page (which only shows CONFIRMED/CHECKED_IN
// bookings) has something to display when paging forward.
// Run with: node scripts/seed-september-bookings.js
const { PrismaClient } = require('../generated/client');

const prisma = new PrismaClient();

const MS_DAY = 24 * 60 * 60 * 1000;
const BOOKINGS_TO_CREATE = 12;

const SOURCES = ['DIRECT', 'DIRECT', 'PHONE', 'WALK_IN', 'OTA', 'OTA'];

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_DAY);
}
function utcDateOnly(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function main() {
  const hotel = await prisma.hotel.findFirstOrThrow();
  const rooms = await prisma.room.findMany({ where: { hotelId: hotel.id }, include: { roomType: true } });
  const staff = await prisma.user.findFirstOrThrow();
  const guests = await prisma.guest.findMany({ where: { hotelId: hotel.id } });

  // Seed the "busy" map from existing active bookings so new ones don't
  // collide with the room-nights already held by CONFIRMED/CHECKED_IN stays.
  const activeBookings = await prisma.booking.findMany({
    where: { hotelId: hotel.id, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
    include: { bookingRooms: true },
  });
  const busy = new Map(rooms.map((r) => [r.id, []]));
  for (const b of activeBookings) {
    for (const br of b.bookingRooms) {
      busy.get(br.roomId)?.push([b.checkInDate, b.checkOutDate]);
    }
  }

  const now = new Date();
  const monthStart = utcDateOnly(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const septemberEnd = utcDateOnly(2026, 8, 30); // September is month index 8; exclusive upper bound for check-out

  let created = 0;
  let attempts = 0;
  const maxAttempts = BOOKINGS_TO_CREATE * 40;

  while (created < BOOKINGS_TO_CREATE && attempts < maxAttempts) {
    attempts++;
    const room = pick(rooms);
    const nights = randInt(1, 4);
    const latestStart = addDays(septemberEnd, -nights);
    if (latestStart < monthStart) continue;
    const spanDays = Math.round((latestStart.getTime() - monthStart.getTime()) / MS_DAY);
    const checkIn = addDays(monthStart, randInt(0, spanDays));
    const checkOut = addDays(checkIn, nights);

    const roomBusy = busy.get(room.id) ?? [];
    const conflict = roomBusy.some(([s, e]) => overlaps(checkIn, checkOut, s, e));
    if (conflict) continue;

    const guest = pick(guests);
    const rateApplied = round2(Number(room.roomType.baseRate) * (0.9 + Math.random() * 0.3));
    const occupants = randInt(1, room.roomType.maxOccupancy);
    const source = pick(SOURCES);

    const booking = await prisma.booking.create({
      data: {
        hotelId: hotel.id,
        guestId: guest.id,
        status: 'CONFIRMED',
        source,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        createdById: staff.id,
      },
    });
    await prisma.bookingRoom.create({
      data: { bookingId: booking.id, roomId: room.id, rateApplied, occupants },
    });

    roomBusy.push([checkIn, checkOut]);
    busy.set(room.id, roomBusy);
    created++;
  }

  console.log(`Created ${created} CONFIRMED bookings across September ${2026} for "${hotel.name}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
