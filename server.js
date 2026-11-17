const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database("bookings.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    event_date TEXT NOT NULL,
    guests INTEGER NOT NULL,
    message TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/enquiries", (req, res) => {
  const { name, email, eventDate, guests, message = "" } = req.body || {};
  if (!name || !email || !eventDate || !Number.isInteger(Number(guests)) ||
      Number(guests) < 1 || Number(guests) > 20) {
    return res.status(400).json({ error: "Please provide valid booking enquiry details." });
  }
  const showDates = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "events.json"), "utf8")).events.map((e) => e.date);
  if (!showDates.includes(String(eventDate))) {
    return res.status(400).json({ error: "There is no listed performance on that date. Please choose an available show date." });
  }
  const result = db.prepare(`
    INSERT INTO enquiries (name, email, event_date, guests, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(name).trim(), String(email).trim(), String(eventDate),
         Number(guests), String(message).trim().slice(0, 1000));
  res.status(201).json({
    message: "Your enquiry has been received. This is not a ticket confirmation.",
    enquiryId: result.lastInsertRowid
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Vegas Show Booking running at http://localhost:${PORT}`);
});