import type Hls from "hls.js";
import type { MediaAdapter } from "./media-adapter.js";

export class HlsPlaybackNotSupportedError extends Error {}

/** Create an HLS adapter; HlsConstructor can be injected for deterministic tests. */
export function createHlsAdapter(options?: { HlsConstructor?: typeof Hls }): MediaAdapter;
