/**
 * tts-backend/server.js
 *
 * Minimal Express server that proxies text → Amazon Polly Neural TTS.
 * AWS credentials never leave this server; the mobile app gets back audio/mpeg.
 *
 * POST /api/tts
 *   Body: { text: string, voiceId: "Ruth" | "Matthew" }
 *   Returns: audio/mpeg stream
 *
 * GET /health
 *   Returns: { status: "ok" }
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── AWS Polly client ─────────────────────────────────────────────────────────
const polly = new PollyClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ─── Allowed Polly Neural voices ─────────────────────────────────────────────
const ALLOWED_VOICES = new Set(["Ruth", "Matthew"]);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ─── TTS endpoint ─────────────────────────────────────────────────────────────
app.post("/api/tts", async (req, res) => {
  const { text, voiceId } = req.body;

  // Validate inputs
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Missing or empty 'text' field." });
  }
  if (!voiceId || !ALLOWED_VOICES.has(voiceId)) {
    return res.status(400).json({
      error: `Invalid 'voiceId'. Allowed values: ${[...ALLOWED_VOICES].join(", ")}.`,
    });
  }

  const sanitizedText = text.trim().slice(0, 3000); // Polly limit safety guard

  try {
    const command = new SynthesizeSpeechCommand({
      Text: sanitizedText,
      VoiceId: voiceId,
      Engine: "neural",
      OutputFormat: "mp3",
      LanguageCode: "en-US",
    });

    const response = await polly.send(command);

    if (!response.AudioStream) {
      return res.status(500).json({ error: "Polly returned no audio stream." });
    }

    // Stream the audio back to the client
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store"); // Caching is handled client-side

    // response.AudioStream is a Node.js Readable in the AWS SDK v3
    response.AudioStream.pipe(res);

    response.AudioStream.on("error", (err) => {
      console.error("[TTS] AudioStream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Stream error." });
      }
    });
  } catch (err) {
    console.error("[TTS] Polly error:", err);
    res.status(500).json({ error: "Failed to synthesize speech.", detail: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[TTS Backend] Running on http://localhost:${PORT}`);
  console.log(`[TTS Backend] AWS Region: ${process.env.AWS_REGION || "us-east-1"}`);
  console.log(`[TTS Backend] Voices available: Ruth (Neural, Female), Matthew (Neural, Male)`);
});
