require("dotenv").config({ quiet: true });
const { faker } = require("@faker-js/faker");
const { prisma } = require("../../src/prisma");

/**
 * Database seeding script.
 *
 * Populates the database with a predefined number of fake Note entries.
 * Existing records in the "Note" table will be deleted before inserting new ones.
 *
 * ⚠️ Not intended to be executed in production environments.
 */
async function seed() {
  console.log("Starting database seed...");

  try {
    // Only clear data if not in staging
    if (process.env.NODE_ENV !== "staging") {
      await prisma.note.deleteMany();
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Note_id_seq" RESTART WITH 1`);
    }

    // Generate fake notes
    const notes = Array.from({ length: 3 }, () => ({
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph()
    }));

    // Insert generated data
    await prisma.note.createMany({ data: notes });

    const total = await prisma.note.count();
    console.log(`Inserted ${total} fake notes successfully.`);
  } catch (err) {
    console.error("Error occurred during database seeding:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log("Seeding finished. Database connection closed.");
  }
}

seed();
