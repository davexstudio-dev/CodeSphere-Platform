import { Composition } from "remotion";
import { CUT_SCENES, FPS, MASTER_SCENES } from "./data";
import { CodeSphereVideo, type VideoProps } from "./Video";

const last = (scenes: { to: number }[]) => scenes[scenes.length - 1].to;

const master: VideoProps = {
	scenes: MASTER_SCENES,
	burnSubtitles: false,
	musicFile: "master-bg.mp3",
};
const cut: VideoProps = {
	scenes: CUT_SCENES,
	burnSubtitles: true,
	musicFile: "master-bg.mp3",
};

export const Root = () => (
	<>
		<Composition
			id="Master"
			component={CodeSphereVideo}
			durationInFrames={last(MASTER_SCENES) * FPS}
			fps={FPS}
			width={1920}
			height={1080}
			defaultProps={master}
		/>
		<Composition
			id="Cut"
			component={CodeSphereVideo}
			durationInFrames={last(CUT_SCENES) * FPS}
			fps={FPS}
			width={1080}
			height={1920}
			defaultProps={cut}
		/>
	</>
);
