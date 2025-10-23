let PrismaClient;

if (process.env.NODE_ENV === "test") {
  // Test-only client generated from prisma/schema.test.prisma (SQLite)
  process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./test.db";
  ({ PrismaClient } = require("@prisma/test/client"));
} else {
  // Default client generated from prisma/schema.prisma (PostgreSQL)
  ({ PrismaClient } = require("@prisma/client"));
}

const prisma = new PrismaClient();

module.exports = { prisma };
