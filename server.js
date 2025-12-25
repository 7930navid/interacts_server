const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
app.use(helmet());
app.use(bodyParser.json());

app.use(
  cors({
    origin: ["https://7930navid.github.io", "http://localhost:8080"],
  })
);

// 🔹 Interact-DB connection
const interactDB = new Pool({
  connectionString: process.env.INTERACT_DB_URL,
  ssl: { rejectUnauthorized: false },
});

// 🔹 Initialize tables
async function initDB() {
  try {
    await interactDB.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        post_id INT NOT NULL,
        email TEXT NOT NULL,
        reaction TEXT
      );

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INT NOT NULL,
        email TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ interact table initialized successfully!");
  } catch (err) {
    console.error("❌ Error initializing table:", err.message);
  }
}

// Call initDB once server starts
initDB();

// 🔹 Add Reaction / Like
app.post("/react", async (req, res) => {
  try {
    const { postId, email, reaction } = req.body;

    if (!postId || !email || !reaction) {
      return res.status(400).json({ message: "Post ID, email and reaction are required!" });
    }

    // Reaction save
    const result = await interactDB.query(
      "INSERT INTO likes (post_id, email, reaction) VALUES ($1, $2, $3) RETURNING *",
      [postId, email, reaction]
    );

    res.json({ message: "Reaction saved ✅", data: result.rows[0] });
  } catch (err) {
    console.error("Error saving reaction:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 Get reaction + comment quantity for a post
app.get("/QuanOfReact", async (req, res) => {
  try {
    const { postId } = req.query;

    if (!postId) {
      return res.status(400).json({ message: "postId is required" });
    }

    // Count reactions
    const likeResult = await interactDB.query(
      "SELECT COUNT(*) AS likes FROM likes WHERE post_id=$1",
      [postId]
    );

    // Count comments
    const commentResult = await interactDB.query(
      "SELECT COUNT(*) AS comments FROM comments WHERE post_id=$1",
      [postId]
    );

    res.json({
      likes: Number(likeResult.rows[0].likes),
      comments: Number(commentResult.rows[0].comments)
    });

  } catch (err) {
    console.error("Error fetching react/comment quantity:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 Get all reactions for a post
app.get("/api/react/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    const reactions = await interactDB.query(
      "SELECT * FROM likes WHERE post_id=$1",
      [postId]
    );

    res.json(reactions.rows);
  } catch (err) {
    console.error("Error fetching reactions:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 Server check
app.get("/", (req, res) => res.json({ message: "Backend is working ✅" }));

// 🔹 Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
