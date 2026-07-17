// Seeds the first SUPER_ADMIN from env credentials.
//
// Run with:  npm run db:seed   (which is `prisma db seed`, so .env is loaded)
//
// Requires ADMIN_EMAIL and ADMIN_PASSWORD in .env. Safe to re-run: it upserts
// by email and (re)sets the role to SUPER_ADMIN and the password to the env
// value — handy if you forget the admin password.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Seed skipped: set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running `npm run db:seed`."
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.upsert({
    where: { email },
    update: { role: "SUPER_ADMIN", passwordHash, isActive: true },
    create: {
      email,
      passwordHash,
      fullName: "Pizza Pazzo Admin",
      role: "SUPER_ADMIN",
    },
  });

  console.log(`✔ Seeded SUPER_ADMIN: ${user.email}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
