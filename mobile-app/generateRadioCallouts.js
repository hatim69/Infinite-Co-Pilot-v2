const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const AUDIO_DIR = path.join(__dirname, "assets", "audio");
const RADIO_DIR = path.join(AUDIO_DIR, "radio");
const RADIO_AUDIO_PREFIXES = ["callout", "system", "service", "crew", "app"];

const RADIO_FILTER = [
  "aformat=channel_layouts=mono",
  "aresample=8000",
  "aresample=48000",
  "highpass=f=420:p=2",
  "lowpass=f=2850:p=2",
  "equalizer=f=1150:t=q:w=0.9:g=4.5",
  "equalizer=f=2350:t=q:w=0.8:g=6.0",
  "acompressor=threshold=-31dB:ratio=5.8:attack=3:release=80:makeup=7.5",
  "asoftclip=type=tanh:threshold=0.76",
  "alimiter=limit=0.94",
  "loudnorm=I=-15.5:TP=-1.2:LRA=5",
].join(",");

const ffmpegCheck = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
if (ffmpegCheck.error || ffmpegCheck.status !== 0) {
  console.error("ffmpeg is required to generate radio voice assets.");
  console.error("Install it with Homebrew: brew install ffmpeg");
  process.exit(1);
}

fs.mkdirSync(RADIO_DIR, { recursive: true });

const files = fs
  .readdirSync(AUDIO_DIR)
  .filter((file) => {
    const match = file.match(/^(female|male)_([^_]+)_.*\.mp3$/);
    return Boolean(match && RADIO_AUDIO_PREFIXES.includes(match[2]));
  })
  .sort();

let rendered = 0;
for (const file of files) {
  const input = path.join(AUDIO_DIR, file);
  const output = path.join(RADIO_DIR, file);
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-af",
      RADIO_FILTER,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "96k",
      output,
    ],
    { encoding: "utf8" }
  );

  if (result.error || result.status !== 0) {
    console.error(`Failed to render ${file}`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(result.status || 1);
  }
  rendered += 1;
}

console.log(`Rendered ${rendered} radio voice assets to ${RADIO_DIR}`);
