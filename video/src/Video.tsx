import type { CSSProperties } from "react";
import {
	AbsoluteFill,
	Audio,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { FPS, type Scene, SITE_URL, TAGLINE, TEAM, VOTE_LINK } from "./data";

export type VideoProps = {
	scenes: Scene[];
	/** Plays public/voice/<prefix>-<scene id>.mp3 in each scene (scripts/voice.ts). Unset: silent. */
	voicePrefix?: string;
	/** File in public/music/, royalty-free music (note its licence in the video description). */
	musicFile?: string;
	/** Burn French subtitles into the picture (the 9:16 cut). The master uses a separate SRT. */
	burnSubtitles?: boolean;
	/** The vote call, shown only once the real vote link is published (#237). */
	voteLink?: string;
};

const palette = {
	bg: "#0b1020",
	panel: "#141b34",
	text: "#f4f6ff",
	muted: "#9aa4c7",
	accent: "#3ddc97",
};

const font: CSSProperties = {
	fontFamily:
		"system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

function useFade(durationInFrames: number) {
	const frame = useCurrentFrame();
	const edge = Math.min(10, Math.floor(durationInFrames / 4));
	return interpolate(
		frame,
		[0, edge, durationInFrames - edge, durationInFrames],
		[0, 1, 1, 0],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
	);
}

function Placeholder({ scene }: { scene: Scene }) {
	return (
		<AbsoluteFill
			style={{
				...font,
				alignItems: "center",
				justifyContent: "center",
				background: palette.panel,
				color: palette.muted,
				fontSize: 36,
				textAlign: "center",
				padding: 80,
			}}
		>
			Prise d'écran manquante : déposer public/clips/{scene.id}.mp4 puis
			renseigner `clip` dans data.ts
		</AbsoluteFill>
	);
}

function Screen({ scene }: { scene: Scene }) {
	if (!scene.clip) {
		return <Placeholder scene={scene} />;
	}
	return (
		<AbsoluteFill>
			<OffthreadVideo
				src={staticFile(`clips/${scene.clip}`)}
				style={{ width: "100%", height: "100%", objectFit: "cover" }}
				muted
			/>
		</AbsoluteFill>
	);
}

function Overlay({ text, bottom }: { text: string; bottom?: boolean }) {
	const { height } = useVideoConfig();
	const size = Math.round(height * 0.032);
	return (
		<div
			style={{
				...font,
				position: "absolute",
				left: "5%",
				...(bottom ? { bottom: "6%" } : { top: "6%" }),
				maxWidth: "90%",
				padding: `${size * 0.5}px ${size}px`,
				borderRadius: size,
				background: "rgba(11, 16, 32, 0.82)",
				color: palette.text,
				fontSize: size,
				fontWeight: 600,
				borderLeft: `${size * 0.2}px solid ${palette.accent}`,
			}}
		>
			{text}
		</div>
	);
}

function Subtitle({ text }: { text: string }) {
	const { height } = useVideoConfig();
	const size = Math.round(height * 0.03);
	return (
		<div
			style={{
				...font,
				position: "absolute",
				left: "6%",
				right: "6%",
				bottom: "8%",
				textAlign: "center",
				color: palette.text,
				fontSize: size,
				fontWeight: 700,
				textShadow: "0 2px 8px rgba(0,0,0,0.9)",
			}}
		>
			{text}
		</div>
	);
}

function Outro({ voteLink }: { voteLink?: string }) {
	const { height } = useVideoConfig();
	const big = Math.round(height * 0.045);
	return (
		<AbsoluteFill
			style={{
				...font,
				background: palette.bg,
				color: palette.text,
				alignItems: "center",
				justifyContent: "center",
				textAlign: "center",
				padding: "0 8%",
				gap: big * 0.8,
			}}
		>
			<div style={{ fontSize: big, fontWeight: 800, lineHeight: 1.2 }}>
				{TAGLINE}
			</div>
			<div
				style={{ fontSize: big * 1.1, color: palette.accent, fontWeight: 700 }}
			>
				{SITE_URL}
			</div>
			{voteLink ? (
				<div style={{ fontSize: big * 0.8, color: palette.muted }}>
					Votez : {voteLink}
				</div>
			) : null}
			<div style={{ fontSize: big * 0.6, color: palette.muted }}>
				{TEAM.join("  ·  ")}
			</div>
		</AbsoluteFill>
	);
}

function SceneView({
	scene,
	burnSubtitles,
	voteLink,
}: {
	scene: Scene;
	burnSubtitles?: boolean;
	voteLink?: string;
}) {
	const frames = Math.round((scene.to - scene.from) * FPS);
	const opacity = useFade(frames);
	if (scene.id === "outro") {
		return (
			<AbsoluteFill style={{ opacity }}>
				<Outro voteLink={voteLink} />
			</AbsoluteFill>
		);
	}
	return (
		<AbsoluteFill style={{ opacity, background: palette.bg }}>
			<Screen scene={scene} />
			{scene.overlay ? (
				<Overlay text={scene.overlay} bottom={scene.overlayAt === "bottom"} />
			) : null}
			{burnSubtitles ? <Subtitle text={scene.voice} /> : null}
		</AbsoluteFill>
	);
}

export const CodeSphereVideo = ({
	scenes,
	voicePrefix,
	musicFile,
	burnSubtitles,
	voteLink = VOTE_LINK,
}: VideoProps) => {
	return (
		<AbsoluteFill style={{ background: palette.bg }}>
			{scenes.map((scene) => (
				<Sequence
					key={scene.id}
					from={Math.round(scene.from * FPS)}
					durationInFrames={Math.round((scene.to - scene.from) * FPS)}
				>
					<SceneView
						scene={scene}
						burnSubtitles={burnSubtitles}
						voteLink={voteLink}
					/>
					{voicePrefix ? (
						<Audio src={staticFile(`voice/${voicePrefix}-${scene.id}.mp3`)} />
					) : null}
				</Sequence>
			))}
			{musicFile ? (
				<Audio src={staticFile(`music/${musicFile}`)} volume={0.12} />
			) : null}
		</AbsoluteFill>
	);
};
