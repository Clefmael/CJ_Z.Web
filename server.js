const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const OpenAI = require("openai"); // npm install openai

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve index.html + chatbot.js

// MongoDB setup
const mongoUri = process.env.MONGODB_URI; // Render env var
const client = new MongoClient(mongoUri);

// Hugging Face Llama 3.1 client via OpenAI-compatible API
const hfClient = new OpenAI({
  apiKey: process.env.HUGGINGFACE_API_KEY, // Render env var
  baseURL: "https://router.huggingface.co/v1",
});

// Ask LLM using only DB context
async function askLLM(question, context) {
  try {
    const completion = await hfClient.chat.completions.create({
      model: "meta-llama/Llama-3.1-8B-Instruct:novita",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Answer ONLY using the context provided below."
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nUser Question: ${question}`
        }
      ],
      max_tokens: 512,
    });

    return completion.choices[0]?.message?.content || "No answer found in the database.";
  } catch (err) {
    console.error("LLM error:", err);
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

    // Retrieve latest pages or multiple pages if needed
    const pages = await collection.find({}).sort({ scrapedAt: -1 }).limit(5).toArray();
    const context = pages.map(p => p.text).join("\n\n");

    const answer = await askLLM(message, context);
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    await client.close();
  }
});

// Root route for testing
app.get("/", (req, res) => res.send("✅ Chatbot backend is running!"));

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
