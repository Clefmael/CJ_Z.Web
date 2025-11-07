const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve index.html, chatbot.js, etc.

// MongoDB setup
const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri);
let db;

// Hugging Face Llama 3.1 (OpenAI-compatible endpoint)
const hfClient = new OpenAI({
  apiKey: process.env.HUGGINGFACE_API_KEY,
  baseURL: "https://router.huggingface.co/v1",
});

// Connect once and reuse
async function initMongo() {
  if (!db) {
    await client.connect();
    db = client.db("chatbotdb");
    console.log("✅ Connected to MongoDB");
  }
}

// Retrieve relevant snippets
async function getRelevantSnippets(message) {
  const collection = db.collection("pages");
  let results = [];

  try {
    // Try text search (requires text index)
    results = await collection
      .find(
        { $text: { $search: message } },
        { projection: { score: { $meta: "textScore" } } }
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(5)
      .toArray();
  } catch {
    // If no text index or error, ignore
  }

  // Fallback: simple regex search
  if (results.length === 0) {
    const keywords = message.split(/\s+/).filter(Boolean);
    results = await collection
      .find({
        $or: keywords.map((k) => ({ text: { $regex: k, $options: "i" } })),
      })
      .limit(5)
      .toArray();
  }

  return results;
}

// Ask LLM using context only
async function askLLM(message, snippets) {
  const context = snippets.map((s) => s.text).join("\n\n---\n\n");

  const completion = await hfClient.chat.completions.create({
    model: "meta-llama/Llama-3.1-8B-Instruct:novita",
    messages: [
      {
        role: "system",
        content: `
You are a grounded assistant. 
Use ONLY the text provided in the context below to answer the user. 
If the answer is not clearly supported by the context, reply exactly with: "I don't know based on the available data."`,
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nUser Question: ${message}`,
      },
    ],
    max_tokens: 512,
  });

  return completion.choices[0]?.message?.content?.trim() || "No answer generated.";
}

// Chat endpoint
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided." });

  try {
    await initMongo();
    const snippets = await getRelevantSnippets(message);

    if (snippets.length === 0) {
      return res.json({
        answer: "No relevant information found in the database.",
      });
    }

    const answer = await askLLM(message, snippets);
    res.json({ answer });
  } catch (err) {
    console.error("Error in /chat:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Start server
app.listen(PORT, async () => {
  await initMongo();
  console.log(`🚀 Server running on port ${PORT}`);
});
