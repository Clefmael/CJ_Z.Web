//////////////////////////////
//  IMPORTS
//////////////////////////////
import express from "express";
import cors from "cors";
import { Pinecone } from "@pinecone-database/pinecone";
import { HfInference } from "@huggingface/inference";


//////////////////////////////
// ENV VARIABLES (Render provides them automatically)
//////////////////////////////
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || "chatbot";

if (!HF_TOKEN || !PINECONE_API_KEY) {
    console.error("❌ Missing HuggingFace or Pinecone API keys");
    process.exit(1);
}


//////////////////////////////
//  INITIALIZE CLIENTS
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

const PORT = process.env.PORT || 3000;


////////////////////////////////////////////////////////////
// 🔍 1. GET RELEVANT CHUNKS USING PINECONE VECTOR SEARCH
////////////////////////////////////////////////////////////
async function getRelevantChunks(query, k = 3) {
    // Embed query using HuggingFace
    const emb = await hf.featureExtraction({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        inputs: query,
    });

    const qVector = Array.isArray(emb[0]) ? emb[0] : emb;

    // Pinecone vector search
    const results = await index.query({
        vector: qVector,
        topK: k,
        includeMetadata: true,
    });

    return results.matches.map((m) => ({
        text: m.metadata.text || "",
        source: m.metadata.source || "",
    }));
}


////////////////////////////////////////////////////////////
// 🧠 2. ASK HF LLM USING CONTEXT
////////////////////////////////////////////////////////////
async function askLLM(query, chunks) {
    const context = chunks.map((c) => c.text).join("\n---\n");

    const systemPrompt = `
You are an assistant for a question-answering task.
Use ONLY the provided context to answer.
If the information is not present in the context, say:
"I don’t have that information in my memory."
Limit answers to 3 sentences.

Context:
${context}
`;

    const response = await hf.chatCompletion({
        model: "meta-llama/Llama-3.2-3B-Instruct",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
        ]
    });

    return response.choices[0].message.content.trim();
}


////////////////////////////////////////////////////////////
// 💬 3. CHAT ENDPOINT
////////////////////////////////////////////////////////////
app.post("/chat", async (req, res) => {
    const { message } = req.body;

    if (!message)
        return res.status(400).json({ error: "Message is required." });

    try {
        const chunks = await getRelevantChunks(message, 3);

        if (chunks.length === 0)
            return res.json({ answer: "I don’t have that information in my memory." });

        const answer = await askLLM(message, chunks);
        res.json({ answer });

    } catch (err) {
        console.error("Chat error:", err);
        res.status(500).json({ error: "Server error" });
    }
});


//////////////////////////////
// START SERVER
//////////////////////////////
app.listen(PORT, () => {
    console.log(`🚀 Server running on Render (port ${PORT})`);
});
