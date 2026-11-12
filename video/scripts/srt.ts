// Writes the subtitle files from src/data.ts: out/master.en.srt (English track of the master)
// and out/cut.fr.srt (French, for the 9:16 cut). Run: bun scripts/srt.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { CUT_SCENES, MASTER_SCENES, type Scene } from "../src/data.ts";

function stamp(seconds: number): string {
	const ms = Math.round(seconds * 1000);
	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function srt(scenes: Scene[], text: (scene: Scene) => string): string {
	return scenes
		.map(
			(scene, i) =>
				`${i + 1}\n${stamp(scene.from)} --> ${stamp(scene.to - 0.5)}\n${text(scene)}\n`,
		)
		.join("\n");
}

mkdirSync("out", { recursive: true });
writeFileSync(
	"out/master.en.srt",
	srt(MASTER_SCENES, (s) => s.en),
);
writeFileSync(
	"out/cut.fr.srt",
	srt(CUT_SCENES, (s) => s.voice),
);
console.log("wrote out/master.en.srt and out/cut.fr.srt");
