import express from "express";
import OpenAI from "openai";
import cors from "cors";
import { Pinecone } from "@pinecone-database/pinecone";
import { InferenceClient } from "@huggingface/inference";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";

const app = express();
app.use(cors());
app.use(express.json());

// ES module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// ----------------------------
// HuggingFace Clients
// ----------------------------
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;

const hf_chat = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: HF_TOKEN,
});

const hf_emb = new InferenceClient(HF_TOKEN);

// ----------------------------
// Pinecone Setup
// ----------------------------
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index("chatbot");
// ----------------------------
// Helper: HF Embeddings
// ----------------------------
async function embedText(text) {
  try {
    const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const resp = await hf_emb.featureExtraction({
      model: "BAAI/bge-small-en",
      inputs: cleaned
    });

    if (resp.flat) return resp.flat();
    if (Array.isArray(resp) && Array.isArray(resp[0])) return resp[0];

    return resp;
  } catch (err) {
    console.error("Embedding error:", err.message);
    return null;
  }
}

// ----------------------------
// Retrieve from Pinecone
// ----------------------------
async function getRelevantChunks(query, k = 5) {
  const vector = await embedText(query);
  if (!vector) return [];

  const result = await index.query({
    vector,
    topK: k,
    includeMetadata: true
  });

  return result.matches.map(m => m.metadata);
}

// ----------------------------
// Ask LLM (HuggingFace Chat)
// ----------------------------
async function askLLM(query, chunks) {
  const context = chunks.map(c => c.text || "").join("\n---\n");

  const system_prompt = `
You are an assistant for a question-answering task.
Use ONLY the context below to answer.
If the answer is not in the context, reply exactly:
"I don’t have that information in my memory."
Limit answers to 3 sentences.

Context:
${context}
`;

  const completion = await hf_chat.chat.completions.create({
    model: "Qwen/Qwen2.5-7B-Instruct:together",
    temperature: 0.2,
    max_tokens: 300,
    messages: [
      { role: "system", content: system_prompt },
      { role: "user", content: query }
    ],
  });

  return completion.choices[0].message.content.trim();
}

// ----------------------------
// Chat endpoint
// ----------------------------
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message)
    return res.status(400).json({ error: "No message provided." });

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

// ----------------------------
// Serve index.html Fallback
// ----------------------------
app.get(["/", "*"], async (req, res) => {
  try {
    const index = await readFile(join(__dirname, "index.html"), "utf-8");
    res.send(index);
  } catch {
    res.status(404).send("index.html not found in root");
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Pinecone + HF chatbot running on port ${PORT}`)
);
