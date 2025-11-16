//////////////////////////////
//  IMPORTS
//////////////////////////////
import express from "express";
import cors from "cors";
import { Pinecone } from "@pinecone-database/pinecone";
import { HfInference } from "@huggingface/inference";
import { fileURLToPath } from "url";
import { dirname, join } from "path";


//////////////////////////////
//  ESM __dirname FIX  (REQUIRED)
//////////////////////////////
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


//////////////////////////////
//  ENV VARIABLES (Render injects these)
//////////////////////////////
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || "chatbot";

if (!HF_TOKEN || !PINECONE_API_KEY) {
    console.error("❌ Missing API keys");
    process.exit(1);
}


//////////////////////////////
// INITIALIZE CLIENTS
//////////////////////////////
const hf = new HfInference(HF_TOKEN);
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pinecone.Index(PINECONE_INDEX);


//////////////////////////////
// EXPRESS SERVER
//////////////////////////////
const app = express();
app.use(cors());
app.use(express.json());

// ⭐ IMPORTANT: serve static files (this makes your page load)
app.use(express.static(join(__dirname, "public")));  
// If your index.html is not inside /public, change the folder above


const PORT = process.env.PORT || 3000;


////////////////////////////////////////////////////////////
// 🔍 1. VECTOR SEARCH (Pinecone)
////////////////////////////////////////////////////////////
async function getRelevantChunks(query, k = 3) {
    const emb = await hf.featureExtraction({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        inputs: query,
    });

    const vector = Array.isArray(emb[0]) ? emb[0] : emb;

    const results = await index.query({
        vector,
        topK: k,
        includeMetadata: true,
    });

    return results.matches.map((m) => ({
        text: m.metadata?.text || "",
        source: m.metadata?.source || "",
    }));
}


////////////////////////////////////////////////////////////
// 🧠 2. ASK HF LLM WITH CONTEXT
////////////////////////////////////////////////////////////
async function askLLM(query, chunks) {
    const context = chunks.map((c) => c.text).join("\n---\n");

    const systemPrompt = `
Use ONLY the provided context to answer.
If the answer is not in the context, reply:
"I don’t have that information in my memory."
Keep responses under 3 sentences.

Context:
${context}
`;

    const completion = await hf.chatCompletion({
        model: "meta-llama/Llama-3.2-3B-Instruct",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
        ],
    });

    return completion.choices[0].message.content.trim();
}


////////////////////////////////////////////////////////////
// 💬 3. /chat ENDPOINT
////////////////////////////////////////////////////////////
app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message is required." });

        const chunks = await getRelevantChunks(message, 3);
        if (chunks.length === 0)
            return res.json({ answer: "I don’t have that information in my memory." });

        const answer = await askLLM(message, chunks);
        res.json({ answer });

    } catch (err) {
        console.error("Chat Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});


//////////////////////////////
// START SERVER
//////////////////////////////
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
