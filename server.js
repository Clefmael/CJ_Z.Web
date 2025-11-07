const express = require("express");
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend (index.html, chatbot.js, etc.)
app.use(express.static(__dirname));

// MongoDB setup
const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri);

// Hugging Face LLM
async function askLLM(question, context) {
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: `Context:\n${context}\n\nUser Question: ${question}\nAnswer clearly and concisely:`,
        }),
      }
    );

    const data = await response.json();
    return data[0]?.generated_text || "Sorry, I couldn’t generate an answer.";
  } catch (err) {
    console.error(err);
    return "Error fetching response from AI.";
  }
}

// Chat endpoint
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided." });

  try {
    await client.connect();
    const db = client.db("chatbot_data");
    const collection = db.collection("pages");

    // Pull latest context from MongoDB
    const page = await collection.findOne({}, { sort: { scrapedAt: -1 } });
    const context = page?.text?.slice(0, 4000) || "";

    // Ask LLM
    const answer = await askLLM(message, context);
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    await client.close();
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
