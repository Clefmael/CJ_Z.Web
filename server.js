const express = require("express");
const { MongoClient } = require("mongodb");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname)); // serve index.html + chatbot.js

// MongoDB setup
const uri = process.env.MONGODB_URI; // store securely in Render environment variables
const client = new MongoClient(uri);

app.post("/ask", async (req, res) => {
    try {
        const { question } = req.body;
        await client.connect();
        const db = client.db("yourDB");
        const collection = db.collection("qa");

        const answer = await collection.findOne({ question });
        res.json({ answer: answer?.answer || "No answer found" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    } finally {
        await client.close();
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
