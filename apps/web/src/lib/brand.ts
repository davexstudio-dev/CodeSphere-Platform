// The brand colours as hex, for the places that cannot use the UI package's CSS variables: the web
// app manifest, the browser's theme colour and the offline page (#249). They are the `--primary`
// and `--background` tokens of packages/ui/src/styles, as apps/e2e/generate-pwa-icons.mjs resolves
// them (it also draws the icons): change the tokens, run the script, update these.
export const BRAND = {
	primary: "#a8432a",
	background: "#fcf6ee",
	darkBackground: "#1e130e",
} as const;
