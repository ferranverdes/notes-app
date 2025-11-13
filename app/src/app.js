require("dotenv").config({ quiet: true });
const express = require("express");
const { prisma } = require("./prisma");

const app = express();

app.use(express.json());

/**
 * @openapi
 * /notes:
 *   post:
 *     summary: Create a note
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Note created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 */
app.post("/notes", async (req, res) => {
  const { title, description } = req.body;

  const note = await prisma.note.create({ data: { title, description } });

  res.status(201).json({ title: note.title, description: note.description });
});

/**
 * @openapi
 * /notes:
 *   get:
 *     summary: List notes
 *     responses:
 *       '200':
 *         description: A list of notes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   title:
 *                     type: string
 *                   description:
 *                     type: string
 */
app.get("/notes", async (req, res) => {
  const notes = await prisma.note.findMany({
    select: { id: true, title: true, description: true },
    orderBy: { createdAt: "desc" }
  });

  res.status(200).json(notes);
});

module.exports = app;
