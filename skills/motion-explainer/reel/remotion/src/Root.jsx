// Compositions: "Reel" (video) and "Cover" (still). Size, length and all data come from inputProps, written by
// renderers/remotion.mjs: { R (scenes.json, voice-fitted), size, fps, motions: { path: motion.json }, assets: { path: data URI }, css }.
import { Composition, Still } from "remotion";
import { LAYOUTS, COVERS, timeline } from "../../core.mjs";
import { Reel } from "./Reel.jsx";
import { Cover } from "./Cover.jsx";

const meta = (table) => ({ props }) => {
  const { W, H } = table[props.size ?? "9:16"];
  const total = timeline(props.R ?? { scenes: [{ duration: 1 }] }).total;
  return { width: W, height: H, fps: props.fps ?? 30, durationInFrames: Math.max(1, Math.round(total * (props.fps ?? 30))) };
};
const empty = { R: { scenes: [{ duration: 1, title: "Run node ../render.mjs --renderer remotion --serve" }] }, size: "9:16", motions: {}, assets: {}, css: {} };

export const Root = () => (
  <>
    <Composition id="Reel" component={Reel} width={1080} height={1920} fps={30} durationInFrames={30}
      defaultProps={empty} calculateMetadata={meta(LAYOUTS)} />
    <Still id="Cover" component={Cover} width={1080} height={1920} defaultProps={empty}
      calculateMetadata={({ props }) => { const { W, H } = COVERS[props.size ?? "9:16"]; return { width: W, height: H }; }} />
  </>
);
