// Generates the French voice-over, one MP3 per scene, with ElevenLabs (#358):
//   public/voice/master-<scene id>.mp3 and public/voice/cut-<scene id>.mp3
// The text of each scene is its `voice` field in src/data.ts.
//
//   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... bun scripts/voice.ts [--dry] [--force] [--only=master|cut]
//
// --dry    print the texts and the files, call nothing (also the script to read aloud)
// --force  regenerate files that already exist (default: skip them, so no credit is spent twice)
// The key is read from the environment only: never write it in a file or paste it in a chat.
// Check that your ElevenLabs plan allows commercial use and publication, and keep the licence of
// the voice you chose. The request shape below follows ElevenLabs' text-to-speech endpoint as
// known when this was written; read their current docs if a call fails.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { CUT_SCENES, MASTER_SCENES, type Scene } from "../src/data.ts";

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");
const force = args.has("--force");
const only = process.argv
	.find((arg) => arg.startsWith("--only="))
	?.slice("--only=".length);

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
if (!dry && (!apiKey || !voiceId)) {
	console.error(
		"Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID, or use --dry.",
	);
	process.exit(1);
}

const jobs: { prefix: string; scenes: Scene[] }[] = [
	{ prefix: "master", scenes: MASTER_SCENES },
	{ prefix: "cut", scenes: CUT_SCENES },
].filter((job) => !only || job.prefix === only);

mkdirSync("public/voice", { recursive: true });

let spent = 0;
for (const { prefix, scenes } of jobs) {
	for (const scene of scenes) {
		const file = `public/voice/${prefix}-${scene.id}.mp3`;
		const length = scene.to - scene.from;
		console.log(`${file} (${length}s): ${scene.voice}`);
		if (dry) {
			continue;
		}
		if (existsSync(file) && !force) {
			console.log("  exists, skipped");
			continue;
		}
		const response = await fetch(
			`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
			{
				method: "POST",
				headers: {
					"xi-api-key": apiKey as string,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					text: scene.voice,
					model_id: "eleven_multilingual_v2",
					language_code: "fr",
				}),
			},
		);
		if (!response.ok) {
			console.error(`  failed: HTTP ${response.status}`);
			process.exit(1);
		}
		writeFileSync(file, Buffer.from(await response.arrayBuffer()));
		spent += scene.voice.length;
	}
}
if (!dry) {
	console.log(`done, ${spent} characters sent to ElevenLabs`);
}
