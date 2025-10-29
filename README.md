# 🗒️ Notes App

This project has been created to meet the following goals:

- ✅ Build a **CI/CD pipeline with continuous deployment** on **Google Cloud**, deploying every branch automatically.
- 🔒 Integrate **automated security controls** such as **SCA**, **SAST**, and **DAST** within the delivery pipeline.

To achieve this, a minimal REST API is provided using **Express.js**, **Prisma ORM**, and **PostgreSQL**, with a **SQLite-based test setup** for isolated automated tests.

It exposes two endpoints:

- **POST `/notes`** → Creates a new note and returns `{ title, description }`.
- **GET `/notes`** → Retrieves a list of all existing notes.

The project is intentionally simple: no validation, no authentication, and no dependencies beyond what is strictly required.

## 🚀 Local Development Setup (Developer Machine)

Follow these steps to run the API **locally** during development.

### 1️⃣ Clone the repository

```bash
git clone https://github.com/<your-username>/notes-api.git
cd notes-api
```

### 2️⃣ Install dependencies

```bash
npm install
```

When you run `npm install`, Prisma's client is automatically generated via the `postinstall` hook defined in `package.json`.

This installs:

- `express` for the HTTP server  
- `dotenv` for environment management  
- `@prisma/client` and `prisma` for database access

### 3️⃣ Configure environment variables

Create a **.env** file at the root of the project. Follow the **.env.sample** structure:

```env
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
DB_NAME=notes_local

# Prisma uses this composed URL to connect
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"

# Port where the app will run locally
PORT=3000
```

> 💡 Tip: If PostgreSQL isn't running yet, start it and create the database:
>
> ```bash
> createdb notes_local
> ```

### 4️⃣ Apply Prisma migrations

Generate the database schema and ensure the Prisma client is ready:

```bash
npm run migrate
```

This will:

- Create the `Note` table defined in `prisma/schema.prisma` on PostgreSQL.
- Generate the Prisma client under `node_modules/@prisma/client` if not already generated.

If you ever need to regenerate the client manually:

```bash
npm run generate
```

### 5️⃣ Run the server

```bash
npm run dev
```

You should see:

```text
🚀 Notes API running on http://localhost:3000
```

### 6️⃣ Test the endpoints

#### ➕ Create a new note

Use `curl` or any REST client (Postman, Insomnia, etc.):

```bash
curl -X POST http://localhost:3000/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"Meeting Notes","description":"Discuss Q4 roadmap"}'
```

✅ **Expected response:**

```json
{
  "title": "Meeting Notes",
  "description": "Discuss Q4 roadmap"
}
```

The note is now stored in your local PostgreSQL database.

#### 📋 List all notes

```bash
curl http://localhost:3000/notes
```

✅ **Expected response:**

```json
[
  {
    "id": 1,
    "title": "Meeting Notes",
    "description": "Discuss Q4 roadmap",
    "createdAt": "2025-10-23T09:00:00.000Z"
  },
  {
    "id": 2,
    "title": "Brainstorm",
    "description": "Ideas for next sprint",
    "createdAt": "2025-10-23T09:05:00.000Z"
  }
]
```

## 🧪 Running Tests (SQLite)

To ensure tests run in isolation without requiring PostgreSQL, a separate **SQLite database** and **Prisma schema** are used.

### 1️⃣ SQLite test schema

The file **`prisma/schema.test.prisma`** defines the same models but uses SQLite as the provider and generates a dedicated test client under:

```path
node_modules/@prisma/test/client
```

### 2️⃣ Test environment

Tests use the following database configuration:

```env
DATABASE_URL="file:./test.db"
NODE_ENV=test
```

This file-based SQLite database is temporary and automatically deleted after all tests.

### 3️⃣ Scripts for test preparation

Before tests run, Prisma pushes the schema and generates the SQLite test client:

```json
{
  "scripts": {
    "test:db:prepare": "NODE_ENV=test DATABASE_URL='file:./test.db' npx prisma db push --schema prisma/schema.test.prisma",
    "pretest": "npm run test:db:prepare",
    "test": "jest --runInBand"
  }
}
```

### 4️⃣ Test runtime configuration

The Prisma client automatically switches depending on the environment:

```js
// src/prisma.js
let PrismaClient;

if (process.env.NODE_ENV === "test") {
  ({ PrismaClient } = require("@prisma/test/client"));
} else {
  ({ PrismaClient } = require("@prisma/client"));
}

const prisma = new PrismaClient();
module.exports = { prisma };
```

### 5️⃣ Test setup file

The **`tests/test-setup.js`** file ensures the database is cleared before each test and removed after all tests:

```js
const fs = require("fs");
const path = require("path");
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./test.db";

const { prisma } = require("../src/prisma");

beforeEach(async () => {
  try {
    await prisma.$executeRawUnsafe("DELETE FROM Note;");
    await prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence WHERE name='Note';");
  } catch (_) {}
});

afterAll(async () => {
  await prisma.$disconnect();
  const dbPath = path.join(process.cwd(), "test.db");
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
});
```

### 6️⃣ Jest configuration

```js
// jest.config.js
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/test-setup.js"]
};
```

### 7️⃣ Example tests

```js
// tests/app.test.js
const request = require("supertest");
const app = require("../src/app");

describe("Notes API (SQLite test client)", () => {
  test("POST /notes creates a note", async () => {
    const payload = { title: "Meeting Notes", description: "Discuss Q4 roadmap" };
    const res = await request(app).post("/notes").send(payload).expect(201);
    expect(res.body).toEqual(payload);
  });

  test("GET /notes lists notes (newest first)", async () => {
    await request(app).post("/notes").send({ title: "First", description: "One" });
    await new Promise((r) => setTimeout(r, 5));
    await request(app).post("/notes").send({ title: "Second", description: "Two" });

    const res = await request(app).get("/notes").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toMatchObject({ title: "Second", description: "Two" });
    expect(res.body[1]).toMatchObject({ title: "First", description: "One" });
  });
});
```

### 8️⃣ Run the tests

```bash
npm test
```

During the test run:

1. The **SQLite schema** is pushed to `test.db`.
2. The **test client** is generated at `@prisma/test/client`.
3. All requests use SQLite instead of PostgreSQL.
4. The file `test.db` is removed after all tests complete.

## ☁️ Cloud Deployment (CI/CD Integration)

Soon, **each branch** will be deployed automatically to the cloud.  
The setup will include:

- Cloud PostgreSQL database (e.g., Google Cloud SQL, Neon, Supabase, or RDS)
- Automated migrations on deploy
- Environment-specific `.env` configuration (secrets stored in the platform)
- Continuous deployment from Git branches

### 🔜 **TODO (Cloud Deployment Section)**

To be implemented:

- [ ] Define hosting provider (e.g., Cloud Run, Render, Vercel, or Railway)
- [ ] Add cloud database connection details and secrets handling
- [ ] Integrate CI/CD pipeline for automatic deploys
- [ ] Configure migrations to run automatically after deployment
- [ ] Document environment variables for staging and production

## 🗂️ Project Structure

```text
notes-api/
├── prisma/
│   ├── schema.prisma         # PostgreSQL schema
│   └── schema.test.prisma    # SQLite schema for tests
├── src/
│   ├── app.js                # Express routes
│   ├── prisma.js             # Prisma client switcher
│   └── server.js             # Entry point
├── tests/
│   ├── app.test.js           # Test suite
│   └── test-setup.js         # Test setup/teardown
├── jest.config.js            # Jest configuration
├── package.json
└── README.md
```

## ⚙️ Useful Commands

| Command | Description |
|-|-|
| `npm run dev` | Start the Express server locally |
| `npm run migrate` | Apply Prisma migrations locally |
| `npm run generate` | Generate Prisma client manually |
| `npm test` | Run Jest tests with SQLite |
| `npx prisma studio` | Open Prisma’s visual database UI |

## 🧩 Notes

- Input is trusted (no validation).  
- Two endpoints are implemented:  
  - `POST /notes` → Create a new note  
  - `GET /notes` → Retrieve all existing notes  
- Database connection is fully configurable through `DB_`-prefixed variables.  
- The app port defaults to `3000` if `PORT` is not set.  
- Prisma client generation is handled automatically after dependency installation.  
- Tests run entirely in SQLite using a generated client (`@prisma/test/client`), avoiding any PostgreSQL dependency.  
- Future deployments will handle multiple environments automatically.

## 🧠 Example `.env` for Quick Local Start

```env
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=notes_local
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
PORT=3000
```

## ✅ That’s it!

You can now:

- Develop locally with PostgreSQL  
- Run fully isolated tests on SQLite  
- Prepare the app for automated cloud deployments 🎉
