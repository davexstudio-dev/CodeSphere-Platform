// Generates the background music of the video with ElevenLabs Music (#358):
//   public/music/<name>.mp3, read by Video.tsx through its `musicFile` prop.
//
//   ELEVENLABS_API_KEY=... bun scripts/music.ts [--dry] [--force] [--name=master-bg] [--seconds=180] [--prompt="..."]
//
// --dry     print the prompt and the file, call nothing
// --force   regenerate the file if it already exists (default: skip it, so no credit is spent twice)
// The key is read from the environment only: never write it in a file or paste it in a chat.
// Check that your ElevenLabs plan allows commercial use and publication of generated music before
// rendering the final video, and declare the music in docs/cadev/ai-usage.md, as for the voice.
// The request shape below follows ElevenLabs' music endpoint as known when this was written;
// read their current docs if a call fails.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const force = args.includes("--force");
const option = (name: string, fallback: string) =>
	args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ??
	fallback;

const name = option("name", "master-bg");
const seconds = Number(option("seconds", "180"));
const prompt = option(
	"prompt",
	"Calm, warm, modern background music for a tech product presentation, soft piano and light percussion, no vocals, steady tempo, unobtrusive under narration",
);
const file = `public/music/${name}.mp3`;

console.log(`${file} (${seconds}s): ${prompt}`);
if (dry) {
	process.exit(0);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
	console.error("Set ELEVENLABS_API_KEY, or use --dry.");
	process.exit(1);
}
if (existsSync(file) && !force) {
	console.log("exists, skipped (use --force to regenerate)");
	process.exit(0);
}

mkdirSync("public/music", { recursive: true });
const response = await fetch("https://api.elevenlabs.io/v1/music", {
	method: "POST",
	headers: {
		"xi-api-key": apiKey,
		"content-type": "application/json",
	},
	body: JSON.stringify({
		prompt,
		music_length_ms: Math.round(seconds * 1000),
	}),
});
if (!response.ok) {
	console.error(`failed: HTTP ${response.status}`);
	process.exit(1);
}
writeFileSync(file, Buffer.from(await response.arrayBuffer()));
console.log(`done: ${file}`);
