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

// DB Setup:-

const interactDB = new Pool({
  connectionString: process.env.INTERACT_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  try {

    // Create likes table
    await interactDB.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        post_id INT NOT NULL,
        email TEXT NOT NULL,
        reaction TEXT NOT NULL,
        UNIQUE(post_id, email)
      )
    `);

    // Create comments table
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

    console.log("✅ Tables ensured successfully!");
  } catch (err) {
    console.error("❌ DB init error:", err.message);

    // Optional: stop process if tables can't be created
    // process.exit(1);
  }
}

// Initialize
initDB().catch(err => {
  console.error("Unhandled DB init error:", err.message);
});


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


app.get("/api/counts/:postId", async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId) return res.status(400).json({ message: "postId is required" });

    // Likes count
    const likeResult = await interactDB.query(
      "SELECT COUNT(*) AS likes FROM likes WHERE post_id=$1",
      [postId]
    );

    // Comments count
    const commentResult = await interactDB.query(
      "SELECT COUNT(*) AS comments FROM comments WHERE post_id=$1",
      [postId]
    );

    res.json({
      likes: Number(likeResult.rows[0].likes),
      comments: Number(commentResult.rows[0].comments),
    });

  } catch (err) {
    console.error("Error fetching counts:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 Get all comments for a post
app.get("/comments/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({ message: "postId is required" });
    }

    const result = await interactDB.query(
      `SELECT id, username, email, avatar, comment, created_at
       FROM comments
       WHERE post_id = $1
       ORDER BY created_at DESC`,
      [postId]
    );

    res.status(200).json(result.rows);

  } catch (err) {
    console.error("Error fetching comments:", err.message);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});


// 🔹 Delete a comment (only by owner)
app.delete("/comment/:email/:commentId", async (req, res) => {
  try {
    const { email, commentId } = req.params;

    if (!email || !commentId) {
      return res.status(400).json({ message: "Email and commentId are required" });
    }

    // Check if comment exists and belongs to this user
    const checkResult = await interactDB.query(
      "SELECT * FROM comments WHERE id=$1 AND email=$2",
      [commentId, email]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({ message: "You are not allowed to delete this comment" });
    }

    // Delete the comment
    await interactDB.query("DELETE FROM comments WHERE id=$1 AND email=$2", [commentId, email]);

    res.status(200).json({ message: "Comment deleted successfully ✅" });

  } catch (err) {
    console.error("Error deleting comment:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 Update comment (only owner can edit)
app.put("/comment/:email/:comId", async (req, res) => {
  try {
    const { email, comId } = req.params;
    const { newComment } = req.body;

    if (!email || !comId) {
      return res.status(400).json({ message: "Email and commentId are required" });
    }

    if (!newComment || newComment.trim() === "") {
      return res.status(400).json({ message: "Comment text is required" });
    }

    // 🔎 Check ownership
    const check = await interactDB.query(
      `SELECT id FROM comments WHERE id = $1 AND email = $2`,
      [comId, email]
    );

    if (check.rowCount === 0) {
      return res.status(403).json({
        message: "You are not allowed to edit this comment"
      });
    }

    // ✏️ Update comment
    await interactDB.query(
      `UPDATE comments 
       SET comment = $1
       WHERE id = $2`,
      [newComment, comId]
    );

    res.status(200).json({
      message: "Comment updated successfully"
    });

  } catch (err) {
    console.error("Error updating comment:", err.message);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});


// 🔹 Server check
app.get("/", (req, res) => res.json({ message: "Backend is working ✅" }));

// 🔹 Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));