import express from "express";
import { MongoClient } from "mongodb";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Serve your frontend files (index.html, chatbot.js, css, etc.)
app.use(express.static(__dirname));

// MongoDB setup and chat backend
const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db("chatbot_data");
const collection = db.collection("pages");

// LLM / Hugging Face logic
import fetch from "node-fetch";

async function askLLM(question, context) {
  const response = await fetch("https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: `Context:\n${context}\n\nUser Question: ${question}\nAnswer clearly and concisely:`
    })
  });
  const data = await response.json();
  return data[0]?.generated_text || "Sorry, I couldn’t generate an answer.";
}

// Chat endpoint (still needed for chatbot.js)
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided." });

  const page = await collection.findOne({}, { sort: { scrapedAt: -1 } });
  const context = page?.text?.slice(0, 4000) || "";

  const answer = await askLLM(message, context);
  res.json({ answer });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
