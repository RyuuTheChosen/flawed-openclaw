#!/usr/bin/env node

import { KokoroTTS } from "kokoro-js";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { exec, execSync } from "node:child_process";
import { resolve } from "node:path";

const VOICES = [
	"af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky",
	"am_adam", "am_michael",
	"bf_emma", "bf_isabella",
	"bm_george", "bm_lewis",
];

function float32ToWav(samples, sampleRate) {
	const bitsPerSample = 16;
	const dataSize = samples.length * 2;
	const buf = Buffer.alloc(44 + dataSize);

	buf.write("RIFF", 0);
	buf.writeUInt32LE(36 + dataSize, 4);
	buf.write("WAVE", 8);
	buf.write("fmt ", 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(1, 22);
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(bitsPerSample, 34);
	buf.write("data", 36);
	buf.writeUInt32LE(dataSize, 40);

	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
	}
	return buf;
}

function playWavSync(filePath) {
	try {
		execSync(
			`powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`,
			{ stdio: "ignore" },
		);
	} catch { /* ignore */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Sentence extraction (mirrors kokoro-tts-service.ts) ──────

function extractSentences(buffer) {
	const sentences = [];
	const regex = /(?<=[.!?])\s+/g;
	let lastIndex = 0;
	let match;
	while ((match = regex.exec(buffer)) !== null) {
		const sentence = buffer.slice(lastIndex, match.index).trim();
		if (sentence) sentences.push(sentence);
		lastIndex = match.index + match[0].length;
	}
	return { sentences, remainder: buffer.slice(lastIndex) };
}

// ── Playback queue (plays segments in background via PowerShell) ──

function createPlaybackQueue(streamStart) {
	let process = null;
	const queue = [];
	const timeline = [];

	function startNext() {
		if (process || queue.length === 0) return;
		const item = queue.shift();
		const segPath = resolve(`test-seg-${item.idx}.wav`);
		writeFileSync(segPath, float32ToWav(item.audio, item.sampleRate));
		const durSec = item.audio.length / item.sampleRate;
		const playStart = performance.now() - streamStart;

		console.log(`  \x1b[32m▶ S${item.idx}\x1b[0m playing at ${playStart.toFixed(0)}ms (${durSec.toFixed(1)}s)`);
		timeline.push({ idx: item.idx, playStart, durSec });

		process = exec(
			`powershell -c "(New-Object Media.SoundPlayer '${segPath}').PlaySync()"`,
			{ stdio: "ignore" },
			() => {
				process = null;
				startNext();
			},
		);
	}

	return {
		enqueue(audio, sampleRate, idx) {
			queue.push({ audio, sampleRate, idx });
			startNext();
		},
		wait() {
			return new Promise((resolve) => {
				const check = () => {
					if (!process && queue.length === 0) resolve();
					else setTimeout(check, 100);
				};
				check();
			});
		},
		timeline,
	};
}

// ── Mode 1: Direct generation (interactive REPL) ─────────────

async function modeInteractive(tts, voice) {
	const outPath = resolve("test-output.wav");
	const rl = createInterface({ input: process.stdin, output: process.stdout });

	const prompt = () => {
		rl.question(`[${voice.v}] > `, async (input) => {
			const text = input.trim();

			if (!text || text === "/quit") {
				rl.close();
				process.exit(0);
			}
			if (text === "/stream") {
				rl.close();
				await modeStream(tts, voice);
				return;
			}
			if (text.startsWith("/voice ")) {
				const v = text.slice(7).trim();
				if (VOICES.includes(v)) {
					voice.v = v;
					console.log(`Voice: ${voice.v}`);
				} else {
					console.log(`Unknown voice. Available: ${VOICES.join(", ")}`);
				}
				prompt();
				return;
			}

			try {
				const t1 = performance.now();
				const result = await tts.generate(text, { voice: voice.v });
				const genMs = (performance.now() - t1).toFixed(0);
				const durSec = (result.audio.length / result.sampling_rate).toFixed(2);

				console.log(`${durSec}s audio in ${genMs}ms — saving to ${outPath}`);

				writeFileSync(outPath, float32ToWav(result.audio, result.sampling_rate));
				playWavSync(outPath);
			} catch (err) {
				console.error("Error:", err.message);
			}

			prompt();
		});
	};

	prompt();
}

// ── Mode 2: Streaming simulation with pipelined playback ─────

async function modeStream(tts, voice) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });

	console.log("\n── Stream mode ──");
	console.log("Simulates word-by-word streaming with sentence buffering.");
	console.log("Audio plays as soon as each sentence is generated (pipelined).\n");

	const prompt = () => {
		rl.question(`[${voice.v} stream] > `, async (input) => {
			const text = input.trim();

			if (!text || text === "/quit") {
				rl.close();
				process.exit(0);
			}
			if (text === "/direct") {
				rl.close();
				await modeInteractive(tts, voice);
				return;
			}
			if (text.startsWith("/voice ")) {
				const v = text.slice(7).trim();
				if (VOICES.includes(v)) {
					voice.v = v;
					console.log(`Voice: ${voice.v}`);
				} else {
					console.log(`Unknown voice. Available: ${VOICES.join(", ")}`);
				}
				prompt();
				return;
			}

			try {
				await simulateStream(tts, voice.v, text);
			} catch (err) {
				console.error("Error:", err.message);
			}

			prompt();
		});
	};

	prompt();
}

async function simulateStream(tts, voice, fullText) {
	const words = fullText.split(/\s+/);
	const WORD_DELAY_MS = 50;
	const FLUSH_CHARS = 200;

	let buffer = "";
	let sentenceIndex = 0;
	let sampleRate = 24000;
	const streamStart = performance.now();
	let firstAudioTime = null;
	let totalAudioSec = 0;

	const playback = createPlaybackQueue(streamStart);

	console.log(`\nStreaming ${words.length} words (~${(words.length * WORD_DELAY_MS / 1000).toFixed(1)}s stream time)...\n`);

	for (let i = 0; i < words.length; i++) {
		buffer += (buffer ? " " : "") + words[i];
		process.stdout.write(`  \x1b[90m${words[i]}\x1b[0m `);

		const { sentences, remainder } = extractSentences(buffer);
		let flush = false;

		if (!sentences.length && remainder.length >= FLUSH_CHARS) {
			flush = true;
		}

		const toGenerate = flush ? [remainder.trim()] : sentences;
		if (flush) buffer = "";
		else buffer = remainder;

		for (const sentence of toGenerate) {
			sentenceIndex++;
			const idx = sentenceIndex;
			const extractTime = performance.now() - streamStart;

			process.stdout.write(`\n  \x1b[33m[S${idx}]\x1b[0m "${sentence.slice(0, 60)}${sentence.length > 60 ? "..." : ""}"\n`);
			console.log(`        extracted at ${extractTime.toFixed(0)}ms`);

			const genStart = performance.now();
			const result = await tts.generate(sentence, { voice });
			const genMs = performance.now() - genStart;
			sampleRate = result.sampling_rate;
			const durSec = result.audio.length / sampleRate;
			totalAudioSec += durSec;

			if (!firstAudioTime) {
				firstAudioTime = performance.now() - streamStart;
			}

			console.log(`        generated ${durSec.toFixed(2)}s audio in ${genMs.toFixed(0)}ms (${(durSec / (genMs / 1000)).toFixed(1)}x realtime)`);

			// Enqueue for immediate playback (plays in background via PowerShell)
			playback.enqueue(result.audio, sampleRate, idx);
		}

		if (i < words.length - 1 && !toGenerate.length) {
			await sleep(WORD_DELAY_MS);
		}
	}

	// Flush remaining buffer
	if (buffer.trim()) {
		sentenceIndex++;
		const sentence = buffer.trim();
		process.stdout.write(`\n  \x1b[33m[S${sentenceIndex}]\x1b[0m "${sentence.slice(0, 60)}${sentence.length > 60 ? "..." : ""}" (flush)\n`);

		const genStart = performance.now();
		const result = await tts.generate(sentence, { voice });
		const genMs = performance.now() - genStart;
		sampleRate = result.sampling_rate;
		const durSec = result.audio.length / sampleRate;
		totalAudioSec += durSec;

		if (!firstAudioTime) {
			firstAudioTime = performance.now() - streamStart;
		}

		console.log(`        generated ${durSec.toFixed(2)}s audio in ${genMs.toFixed(0)}ms`);
		playback.enqueue(result.audio, sampleRate, sentenceIndex);
	}

	const genDoneTime = performance.now() - streamStart;
	console.log(`\n  \x1b[90m(all generated at ${genDoneTime.toFixed(0)}ms — waiting for playback...)\x1b[0m`);

	await playback.wait();
	const totalMs = performance.now() - streamStart;

	console.log(`\n── Summary ──`);
	console.log(`  Sentences:       ${sentenceIndex}`);
	console.log(`  First audio at:  ${firstAudioTime?.toFixed(0) ?? "N/A"}ms`);
	console.log(`  Gen complete at: ${genDoneTime.toFixed(0)}ms`);
	console.log(`  Playback done:   ${totalMs.toFixed(0)}ms`);
	console.log(`  Total audio:     ${totalAudioSec.toFixed(2)}s`);

	// Show timeline
	if (playback.timeline.length > 0) {
		console.log(`\n── Timeline ──`);
		for (const t of playback.timeline) {
			const end = t.playStart + t.durSec * 1000;
			const bar = "█".repeat(Math.round(t.durSec * 4));
			console.log(`  S${t.idx}  ${t.playStart.toFixed(0).padStart(6)}ms ${bar} ${end.toFixed(0)}ms`);
		}
	}

	console.log();
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
	console.log("Loading Kokoro TTS model (q8 quantized)...");
	const t0 = performance.now();

	const tts = await KokoroTTS.from_pretrained(
		"onnx-community/Kokoro-82M-v1.0-ONNX",
		{ dtype: "q8" },
	);

	console.log(`Model loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
	console.log(`Voices: ${VOICES.join(", ")}`);
	console.log();
	console.log(`Modes:`);
	console.log(`  /stream  — streaming simulation with pipelined playback`);
	console.log(`  /direct  — direct generation (default)`);
	console.log(`  /voice <id>  /quit`);
	console.log();

	const voice = { v: "af_heart" };
	await modeInteractive(tts, voice);
}

main().catch(console.error);
