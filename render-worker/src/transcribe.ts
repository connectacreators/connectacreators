// render-worker/src/transcribe.ts
// Audio extraction + Whisper transcription + ffmpeg silencedetect.
// All ffmpeg work is local; Whisper is a single HTTPS POST.
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");

export type WhisperWord = { text: string; start_ms: number; end_ms: number };

// Mono 16kHz 64kbps mp3 — Whisper-friendly and tiny (~480KB/min audio).
// A 30-minute talking-head video produces ~14MB, well under Whisper's 25MB limit.
export async function extractAudio(input: string, output: string): Promise<void> {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const args = [
    "-y",
    "-i", input,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    "-c:a", "libmp3lame",
    output,
  ];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg audio extract failed (${code}): ${stderr.slice(-400)}`));
    });
  });
}

export async function transcribeWithWhisper(audioPath: string, apiKey: string): Promise<WhisperWord[]> {
  const buf = await fs.readFile(audioPath);
  const fd = new FormData();
  // Use a generic File-like Blob; the filename is what Whisper inspects for format hints.
  const blob = new Blob([new Uint8Array(buf)], { type: "audio/mpeg" });
  fd.append("file", blob, "audio.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Whisper API ${res.status}: ${txt.slice(0, 500)}`);
  }
  const json = (await res.json()) as { words?: { word: string; start: number; end: number }[] };
  const words = json.words ?? [];
  return words.map((w) => ({
    text: w.word,
    start_ms: Math.round(w.start * 1000),
    end_ms: Math.round(w.end * 1000),
  }));
}

export type SilenceSegment = { start_ms: number; end_ms: number };

// ffmpeg silencedetect emits stderr lines like:
//   [silencedetect @ 0x...] silence_start: 1.234
//   [silencedetect @ 0x...] silence_end: 2.567 | silence_duration: 1.333
// We parse both and emit ranges.
export async function detectSilences(
  audioPath: string,
  opts: { noiseDb?: number; minDurationMs?: number } = {},
): Promise<SilenceSegment[]> {
  const noiseDb = opts.noiseDb ?? -30;
  const minDurationS = (opts.minDurationMs ?? 400) / 1000;
  const args = [
    "-i", audioPath,
    "-af", `silencedetect=noise=${noiseDb}dB:d=${minDurationS}`,
    "-f", "null",
    "-",
  ];
  const stderr = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stderr.on("data", (d) => { out += d.toString(); });
    proc.on("error", reject);
    proc.on("close", () => resolve(out));
  });

  const segments: SilenceSegment[] = [];
  let currentStart: number | null = null;
  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch && currentStart !== null) {
      const end = parseFloat(endMatch[1]);
      segments.push({
        start_ms: Math.round(currentStart * 1000),
        end_ms: Math.round(end * 1000),
      });
      currentStart = null;
    }
  }
  return segments;
}
