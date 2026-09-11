/**
 * tts-backend/server.js
 *
 * Minimal Cloudflare Worker that proxies text → Amazon Polly Neural TTS.
 * AWS credentials never leave this server; the mobile app gets back audio/mpeg.
 *
 * POST /api/tts
 *   Body: { text: string, voiceId: "Ruth" | "Matthew" }
 *   Returns: audio/mpeg stream
 *
 * GET /health
 *   Returns: { status: "ok" }
 */

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

// ─── Allowed Polly Neural voices ─────────────────────────────────────────────
const ALLOWED_VOICES = new Set(["Ruth", "Matthew"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ─── CORS Preflight Handling (Cross-Origin Policy) ───────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ─── Health check ─────────────────────────────────────────────────────────────
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ─── TTS endpoint ─────────────────────────────────────────────────────────────
    if (url.pathname === "/api/tts" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const { text, voiceId } = body;

        // Validate inputs
        if (!text || typeof text !== "string" || text.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Missing or empty 'text' field." }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        if (!voiceId || !ALLOWED_VOICES.has(voiceId)) {
          return new Response(JSON.stringify({
            error: `Invalid 'voiceId'. Allowed values: ${[...ALLOWED_VOICES].join(", ")}.`,
          }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const sanitizedText = text.trim().slice(0, 3000); // Polly limit safety guard

        // Initialize Polly inside fetch execution block to safely read injected secrets
        const polly = new PollyClient({
          region: env.AWS_REGION || "us-east-1",
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        });

        const command = new SynthesizeSpeechCommand({
          Text: sanitizedText,
          VoiceId: voiceId,
          Engine: "neural",
          OutputFormat: "mp3",
          LanguageCode: "en-US",
        });

        const response = await polly.send(command);

        if (!response.AudioStream) {
          return new Response(JSON.stringify({ error: "Polly returned no audio stream." }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        // Return the binary stream back to the mobile client
        return new Response(response.AudioStream, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store", // Caching is handled client-side
            "Access-Control-Allow-Origin": "*",
          },
        });

      } catch (err) {
        console.error("[TTS] Polly error:", err);
        return new Response(JSON.stringify({ error: "Failed to synthesize speech.", detail: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // ─── App Config (Free Period & Creator Codes) ──────────────────────────────────
    if (url.pathname === "/api/app-config" && request.method === "GET") {
      const code = url.searchParams.get("code");
      
      // Read the date from the environment variable (with a fallback)
      const endDateString = env.FREE_PERIOD_END_DATE || "2026-10-10T23:59:59Z";
      const freePeriodEndDate = new Date(endDateString);
      const isFreePeriod = new Date() < freePeriodEndDate;

      // Read comma-separated codes from environment variable
      const codesString = env.CREATOR_CODES || "DISCORD26";
      const validCodes = codesString.split(",").map(c => c.trim().toUpperCase());
      
      let isValidCode = false;
      if (code) {
        isValidCode = validCodes.includes(code.toUpperCase().trim());
      }

      return new Response(JSON.stringify({ 
        isFreePeriod,
        isValidCode,
        requestedCode: code 
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ─── Default 404 For Unmatched Routes ───────────────────────────────────────
    return new Response("Not Found", { status: 404 });
  },
};
