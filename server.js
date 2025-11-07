const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve index.html + chatbot.js

// MongoDB setup
const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri);

// Hugging Face Llama 3.1 via OpenAI-compatible API
const hfClient = new OpenAI({
  apiKey: process.env.HUGGINGFACE_API_KEY,
  baseURL: "https://router.huggingface.co/v1",
});

// Helper: retrieve relevant database snippets
async function getRelevantSnippets(message) {
  try {
    await client.connect();
    const db = client.db("chatbotdb");
    const collection = db.collection("pages");

    // Use text index if available
    const results = await collection
      .find({ $text: { $search: message } }, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } })
      .limit(5)
      .toArray();

    // Fallback: if text index is not defined, search keywords
    if (results.length === 0) {
      const keywords = message
        .split(/\s+/)
        .map((k) => k.trim())
        .filter(Boolean);
      return await collection
        .find({
          $or: keywords.map((k) => ({ text: { $regex: k, $options: "i" } })),
        })
        .sort({ scrapedAt: -1 })
        .limit(5)
        .toArray();
    }

    return results;
  } catch (err) {
    console.error("DB search error:", err);
    return [];
  } finally {
    await client.close();
  }
}

// Ask LLM to generate answer based on snippets
async function askLLM(message, snippets) {
  try {
    const context = snippets.map((s) => s.text).join("\n\n---\n\n");
    const completion = await hfClient.chat.completions.create({
      model: "meta-llama/Llama-3.1-8B-Instruct:novita",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Answer clearly and concisely using only the provided context. If the answer is not in the context, say you don't know.",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nUser Question: ${message}`,
        },
      ],
      max_tokens: 512,
    });

    return completion.choices[0]?.message?.content || "Sorry, I couldn't generate an answer.";
  } catch (err) {
    console.error("LLM error:", err);
    return "Error fetching response from AI.";
  }
}

// Chat endpoint
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided." });

  const snippets = await getRelevantSnippets(message);
  if (snippets.length === 0) {
    return res.json({ answer: "No relevant information found in the database." });
  }

  const answer = await askLLM(message, snippets);
  res.json({ answer });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
