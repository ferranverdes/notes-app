const fs = require("fs");
const path = require("path");
const { prisma } = require("../src/prisma");

beforeEach(async () => {
  try {
    await prisma.$executeRawUnsafe("DELETE FROM Note;");
    await prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence WHERE name='Note';");
  } catch (_) {}
});

afterAll(async () => {
  await prisma.$disconnect();
  const dbPath = path.join(process.cwd(), "prisma/test.db");
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
});
