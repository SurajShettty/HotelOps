const { PrismaClient } = require('../generated/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@hotelops.local';
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'password123';

const ROLE_NAMES = ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING', 'FINANCE'];

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: SEED_EMAIL },
    update: { passwordHash },
    create: {
      email: SEED_EMAIL,
      passwordHash,
      fullName: 'HotelOps Admin',
      isActive: true,
    },
  });

  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });

  // Platform-wide role: hotelId is NULL, so this doesn't depend on any hotel existing yet.
  const existingGrant = await prisma.userHotelRole.findFirst({
    where: { userId: user.id, hotelId: null, roleId: superAdminRole.id },
  });
  if (!existingGrant) {
    await prisma.userHotelRole.create({
      data: { userId: user.id, hotelId: null, roleId: superAdminRole.id },
    });
  }

  console.log(`Seeded user ${user.email} (id: ${user.id}) as platform-wide SUPER_ADMIN`);
  console.log(`Login with: email="${SEED_EMAIL}" password="${SEED_PASSWORD}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
