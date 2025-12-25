// server.js
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

// 🔹 PostgreSQL connection
const interactDB = new Pool({
  connectionString: process.env.INTERACT_DB_URL,
  ssl: { rejectUnauthorized: false },
});

// 🔹 Initialize tables
async function initDB() {
  try {
    // Likes table
    
    await interactDB.query(`
      CREATE TABLE likes (
          id SERIAL PRIMARY KEY,
          post_id INT NOT NULL,
          email TEXT NOT NULL,
          reaction TEXT NOT NULL,
          UNIQUE(post_id, email)
      )
    `);

    // Comments table
    await interactDB.query(`
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    post_id INT NOT NULL,
    email TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
)

    `);

    console.log("✅ Tables initialized successfully!");
  } catch (err) {
    console.error("❌ Error initializing tables:", err.message);
  }
}


// Call initDB
initDB();

// 🔹 Add Reaction / Like
app.post("/react", async (req, res) => {
    try {
        const { postId, email, reaction } = req.body;

        if (!postId || !email || !reaction) {
            return res.status(400).json({ message: "Post ID, email and reaction are required!" });
        }

        const query = `
            INSERT INTO likes (post_id, email, reaction)
            VALUES ($1, $2, $3)
            ON CONFLICT (post_id, email)
            DO NOTHING
            RETURNING *;
        `;

        const result = await interactDB.query(query, [postId, email, reaction]);

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "You have already reacted to this post!" });
        }

        res.status(200).json({ message: "Reaction added successfully!" });

    } catch (err) {
        console.error("Server error:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// 🔹 Add Comment (with username + avatar)
app.post("/comment", async (req, res) => {
  try {
    const { postId, email, username, avatar, comment } = req.body;

    if (!postId || !email || !username || !comment) {
      return res.status(400).json({
        message: "postId, email, username and comment are required!"
      });
    }

    const query = `
      INSERT INTO comments (post_id, email, username, avatar, comment)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await interactDB.query(query, [
      postId,
      email,
      username,
      avatar || "🙂",
      comment
    ]);

    res.status(201).json({
      message: "Comment added successfully ✅",
      comment: result.rows[0]
    });

  } catch (err) {
    console.error("Error adding comment:", err.message);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});

// 🔹 Get reaction + comment count for a post
app.get("/QuanOfReact", async (req, res) => {
  try {
    const { postId } = req.query;

    if (!postId) return res.status(400).json({ message: "postId is required" });

    const likeResult = await interactDB.query(
      "SELECT COUNT(*) AS likes FROM likes WHERE post_id=$1",
      [postId]
    );

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

// 🔹 Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));