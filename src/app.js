require("dotenv").config({ quiet: true });
const express = require("express");
const { prisma } = require("./prisma");

const app = express();

app.use(express.json());

app.post("/notes", async (req, res) => {
  const { title, description } = req.body;

  const note = await prisma.note.create({ data: { title, description } });

  res.status(201).json({ title: note.title, description: note.description });
});

app.get("/notes", async (req, res) => {
  const notes = await prisma.note.findMany({
    select: {
      id: true,
      title: true,
      description: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json(notes);
});

module.exports = app;
