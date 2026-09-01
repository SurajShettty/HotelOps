// One-off dummy-data generator: fills in guests + bookings (with payments,
// invoices, and room charges) spanning the last 5 weeks, so dashboards and
// reports that chart trailing occupancy/revenue have something to show.
// Run with: node scripts/seed-demo-5-weeks.js
const { PrismaClient } = require('../generated/client');

const prisma = new PrismaClient();

const MS_DAY = 24 * 60 * 60 * 1000;
const WEEKS_BACK = 5;
const DEFAULT_TAX_RATE_PERCENT = 12;

const GUEST_NAMES = [
  'Ananya Rao', 'Vikram Mehta', 'Priya Nair', 'Arjun Kapoor', 'Sneha Iyer',
  'Rohan Deshpande', 'Kavya Reddy', 'Aditya Bhat', 'Meera Pillai', 'Karthik Menon',
  'Ishaan Bose', 'Divya Chawla', 'Nikhil Saxena', 'Pooja Malhotra', 'Rahul Verma',
  'Tanvi Joshi', 'Aarav Shetty', 'Lavanya Rangan', 'Sameer Khanna', 'Neha Gupta',
  'Oliver Fitzgerald', 'Isabella Romano', 'Lucas Hartmann', 'Chloe Bennett', 'Daniel Kessler',
  'Freya Lindqvist', 'Ethan Walcott', 'Amara Osei', 'Noah Kastrup', 'Mira Andersen',
];

const CHARGE_DESCRIPTIONS = [
  ['Minibar', 150, 500],
  ['Room service', 200, 800],
  ['Laundry', 100, 350],
  ['Spa treatment', 800, 2500],
  ['Extra bed', 500, 800],
  ['Airport pickup', 600, 1200],
];

const SOURCES = ['DIRECT', 'DIRECT', 'PHONE', 'WALK_IN', 'OTA', 'OTA'];
const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI'];

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
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
}

async function main() {
  const hotel = await prisma.hotel.findFirstOrThrow();
  const rooms = await prisma.room.findMany({ where: { hotelId: hotel.id }, include: { roomType: true } });
  const staff = await prisma.user.findFirstOrThrow();

  if (rooms.length === 0) throw new Error('No rooms found — seed the base hotel/rooms first.');

  const guests = [];
  for (const name of GUEST_NAMES) {
    const suffix = Math.random().toString(16).slice(2, 8);
    const guest = await prisma.guest.create({
      data: {
        hotelId: hotel.id,
        fullName: name,
        email: `${slugify(name)}.${suffix}@example.com`,
        phone: `9${randInt(100000000, 999999999)}`,
      },
    });
    guests.push(guest);
  }

  const now = new Date();
  const today = utcDateOnly(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const rangeStart = addDays(today, -WEEKS_BACK * 7);

  let bookingsCreated = 0;

  for (const room of rooms) {
    let cursor = rangeStart;

    while (cursor < today) {
      if (Math.random() < 0.55) {
        const nights = randInt(1, 4);
        let checkOut = addDays(cursor, nights);
        if (checkOut > today) checkOut = today;
        if (checkOut <= cursor) {
          cursor = addDays(cursor, 1);
          continue;
        }
        const nightsActual = Math.round((checkOut.getTime() - cursor.getTime()) / MS_DAY);

        const guest = pick(guests);
        const rateApplied = round2(Number(room.roomType.baseRate) * (0.9 + Math.random() * 0.3));
        const occupants = randInt(1, room.roomType.maxOccupancy);
        const source = pick(SOURCES);
        const createdAt = addDays(cursor, -randInt(0, 5));

        const roll = Math.random();
        const status = roll < 0.08 ? 'CANCELLED' : roll < 0.11 ? 'NO_SHOW' : 'CHECKED_OUT';

        const booking = await prisma.booking.create({
          data: {
            hotelId: hotel.id,
            guestId: guest.id,
            status,
            source,
            checkInDate: cursor,
            checkOutDate: checkOut,
            createdById: staff.id,
            createdAt,
          },
        });

        await prisma.bookingRoom.create({
          data: { bookingId: booking.id, roomId: room.id, rateApplied, occupants },
        });

        if (status === 'CHECKED_OUT') {
          let chargesTotal = 0;
          const chargeCount = Math.random() < 0.4 ? randInt(1, 3) : 0;
          for (let i = 0; i < chargeCount; i++) {
            const [description, min, max] = pick(CHARGE_DESCRIPTIONS);
            const amount = round2(randInt(min, max));
            chargesTotal = round2(chargesTotal + amount);
            await prisma.roomCharge.create({
              data: {
                bookingId: booking.id,
                description,
                amount,
                addedById: staff.id,
                createdAt: addDays(cursor, randInt(0, Math.max(0, nightsActual - 1))),
              },
            });
          }

          const roomSubtotal = round2(rateApplied * nightsActual);
          const lateCheckOutFee = Math.random() < 0.1 ? round2(Number(hotel.lateCheckOutFee)) : 0;
          const subtotal = round2(roomSubtotal + chargesTotal + lateCheckOutFee);
          const taxTotal = round2(subtotal * (DEFAULT_TAX_RATE_PERCENT / 100));
          const grandTotal = round2(subtotal + taxTotal);
          const checkoutTime = new Date(checkOut.getTime() + (9 + randInt(0, 4)) * 60 * 60 * 1000);

          let alreadyPaid = 0;
          if (Math.random() < 0.5) {
            const deposit = round2(grandTotal * (0.2 + Math.random() * 0.2));
            await prisma.payment.create({
              data: {
                bookingId: booking.id,
                amount: deposit,
                method: pick(PAYMENT_METHODS),
                type: 'CHARGE',
                reference: 'Check-in deposit',
                createdAt: new Date(cursor.getTime() + (11 + randInt(0, 3)) * 60 * 60 * 1000),
              },
            });
            alreadyPaid = deposit;
          }
          await prisma.payment.create({
            data: {
              bookingId: booking.id,
              amount: round2(grandTotal - alreadyPaid),
              method: pick(PAYMENT_METHODS),
              type: 'CHARGE',
              createdAt: checkoutTime,
            },
          });

          await prisma.invoice.create({
            data: {
              bookingId: booking.id,
              nights: nightsActual,
              roomSubtotal,
              chargesTotal,
              lateCheckOutFee,
              additionalCharges: [],
              discounts: [],
              subtotal,
              taxRatePercent: DEFAULT_TAX_RATE_PERCENT,
              taxTotal,
              discountTotal: 0,
              grandTotal,
              issuedAt: checkoutTime,
            },
          });
        } else if (status === 'CANCELLED' && Math.random() < 0.4) {
          await prisma.payment.create({
            data: {
              bookingId: booking.id,
              amount: round2(rateApplied * 0.3),
              method: pick(PAYMENT_METHODS),
              type: 'CHARGE',
              reference: 'Booking deposit (forfeited)',
              createdAt: addDays(createdAt, randInt(0, 1)),
            },
          });
        }

        bookingsCreated++;
        cursor = addDays(checkOut, randInt(0, 2));
      } else {
        cursor = addDays(cursor, randInt(1, 3));
      }
    }
  }

  console.log(
    `Seeded ${guests.length} guests and ${bookingsCreated} bookings (with payments/invoices) across the last ${WEEKS_BACK} weeks for "${hotel.name}".`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
