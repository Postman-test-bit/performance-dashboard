import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors()); // Enable CORS
app.use(express.json()); // Allow JSON requests

const PORT = process.env.PORT || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_TABLE_NAME = process.env.SUPABASE_TABLE_NAME;
const SUPABASE_TOKEN = process.env.SUPABASE_TOKEN;

// API Route to Fetch Data from Supabase
app.get("/api/data", async (req, res) => {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE_NAME}`,
      {
        headers: {
          apikey: SUPABASE_TOKEN,
        },
      }
    );

    if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
