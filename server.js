import express from "express";
import { MongoClient } from "mongodb";
import OpenAI from "openai";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";

const app = express();
app.use(cors());
app.use(express.json());

// ES module __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from the project root (main root)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db("chatbotdb");
const collection = db.collection("pages");
const openai = new OpenAI({ apiKey: process.env.HUGGINGFACE_API_KEY });

// 1️⃣ Retrieve top-k chunks by vector similarity
async function getRelevantChunks(query, k = 5) {
  const qEmb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          queryVector: qEmb.data[0].embedding,
          path: "embedding",
          numCandidates: 100,
          limit: k,
        },
      },
    ])
    .toArray();

  return results;
}

// 2️⃣ Ask LLM using retrieved chunks
async function askLLM(query, chunks) {
  const context = chunks.map((c) => c.text).join("\n---\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `
You are a chatbot whose memory comes ONLY from the database below.
Answer using ONLY this memory. 
If the answer is not in the memory, respond exactly with: "I don’t have that information in my memory."`,
      },
      {
        role: "user",
        content: `Database memory:\n${context}\n\nUser Question: ${query}`,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
}

// 3️⃣ Chat endpoint
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided." });

  try {
    const chunks = await getRelevantChunks(message, 5);
    if (chunks.length === 0)
      return res.json({ answer: "No relevant information found in memory." });

    const answer = await askLLM(message, chunks);
    res.json({ answer });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 4️⃣ Serve index.html for root or unmatched routes
app.get(["/", "*"], async (req, res) => {
  try {
    const index = await readFile(join(__dirname, "index.html"), "utf-8");
    res.send(index);
  } catch (err) {
    res.status(404).send("index.html not found in root");
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Vector chatbot running on port ${PORT}`)
);
