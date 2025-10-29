const request = require("supertest");
const app = require("../src/app");

describe("Notes API (SQLite test client)", () => {
  test("POST /notes creates a note", async () => {
    const payload = {
      title: "Meeting Notes",
      description: "Discuss Q4 roadmap"
    };
    const res = await request(app).post("/notes").send(payload).expect(201);
    expect(res.body).toEqual(payload);
  });

  test("GET /notes lists notes (newest first)", async () => {
    await request(app).post("/notes").send({ title: "First", description: "One" });

    await request(app).post("/notes").send({ title: "Second", description: "Two" });

    const res = await request(app).get("/notes").expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toMatchObject({ title: "Second", description: "Two" });
    expect(res.body[1]).toMatchObject({ title: "First", description: "One" });
    expect(res.body[0]).toHaveProperty("id");
  });
});
