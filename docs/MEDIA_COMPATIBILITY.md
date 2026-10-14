# Media compatibility matrix

> Status: P5.4 behavioral acceptance confirmed by the user in Web and Windows Electron on 2026-10-14. This records playback behavior for the tested fixtures; codec/container claims remain limited to metadata that was actually identified. It does not imply universal format support.

## Rules for recording support

- Record the exact source fixture, operating system, browser/Electron version, container and codecs when they can be inspected.
- A container extension (for example, `.mp4`) does not identify its video/audio codecs. Do not turn a successful playback of one MP4 into a claim that every MP4 is supported.
- `canPlayType()` is only a likelihood signal, not a substitute for an actual playback attempt. See [MDN: HTMLMediaElement.canPlayType](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType).
- The Web and Electron renderer share the player UI, but codec support may differ by operating system and runtime. Keep macOS status separate until it has been manually tested.
- The table does not claim support for MKV, HEVC, HDR, embedded subtitle formats, or external subtitle tracks unless a separate tested row is added.

## Fixture and runtime matrix

| Fixture | Media details / rights | Web | Windows Electron 44.7.0 | macOS ARM64 |
|---|---|---|---|---|
| Existing catalog MP4 demo: [View From A Blue Moon, 720p](https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4) | MP4 by URL; exact video/audio codecs were not independently recorded. Use only for historical functional regression, not as a redistributable fixture. | Playback, controls, seek, and progress workflow accepted by user on 2026-10-13 | Playback, controls, seek, and progress workflow accepted by user on 2026-10-13 | Not tested |
| Redistributable MP4: [Big Buck Bunny 480p/30s sample](https://raw.githubusercontent.com/bower-media-samples/big-buck-bunny-480p-30s/master/video.mp4) | Blender Foundation open movie; CC BY 3.0. Attribution: `(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org`. The fixture repository identifies it as a 30-second 480p MP4 sample. Exact stream codec metadata is not recorded here, so no codec-specific claim is made. | P5.4 behavioral acceptance confirmed 2026-10-14; no codec-specific claim | P5.4 behavioral acceptance confirmed 2026-10-14; no codec-specific claim | Not tested |
| Public HLS test playlist: [Mux x36xhzz](https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8) | Remote protocol test stream; requires network and cross-origin requests. We do not redistribute it or assert its content licensing/codecs. The origin may change availability/content. | Playback, pause/resume, seek, errors, source cleanup, and P5.3 Auto/manual quality switching accepted by user on 2026-10-13 | Playback, pause/resume, seek, errors, source cleanup, and P5.3 Auto/manual quality switching accepted by user on 2026-10-13 | Not tested |
| WebM (VP8/VP9/AV1 variants) | No pinned, redistributable fixture in this phase | Not tested | Not tested | Not tested |
| Ogg/Theora | No pinned fixture in this phase | Not tested | Not tested | Not tested |
| MKV, HEVC, HDR, subtitles | No acceptance fixture or evidence for this phase | Not claimed | Not claimed | Not claimed |

## P5.4 manual acceptance procedure

P5.4 playback behavior was accepted in both clients on 2026-10-14. Keep the following procedure as the repeatable verification checklist for regressions or future release qualification:

1. For future repeatable release qualification, record OS, browser version (Web), Electron version (desktop), date, and the exact fixture URL.
2. Play for at least 15 seconds and confirm moving video and audible audio where the fixture contains audio.
3. Pause/resume; seek backward and forward; confirm the timeline and duration remain coherent.
4. Switch to another source and return; confirm the old source is released and the player remains usable.
5. Refresh/reopen the same item and confirm the existing progress-restoration behavior still works.
6. Codec details were not supplied in the acceptance record. Before claiming codec-level support, inspect DevTools/media diagnostics or use MediaInfo/ffprobe to record the actual video/audio codecs, dimensions and frame rate; do not infer them from the URL alone.
7. Test an unreachable source separately and confirm the UI says to check the network/source. Test a known unsupported file only when an appropriate redistributable fixture is available; confirm it reports that the format/codec may be unsupported without displaying tokens or the full source URL.
8. Record each result in the table above and leave unsupported/unrun cases as pending.

HLS playback and quality switching have prior user acceptance. Re-run them only as a regression check after player changes; an HLS success does not establish support for unrelated containers/codecs.

## User-facing media error behavior

The player maps standard HTML media error codes to these messages:

- Aborted: playback was cancelled; retry.
- Network: check the network connection or media source.
- Decode: the runtime could not decode the media; its format/codec or file may be unsupported.
- Source not supported: the runtime may not support the format/codec, or the media source may be invalid.
- Unknown error: retain the source-specific fallback message.
- No playable media data within 15 seconds (and no browser error event): show a loading-timeout message asking the user to check the network or source. Successful media readiness cancels this timer.

These messages are diagnostic guidance, not proof that a specific codec is unsupported. Confirm the diagnosis against the actual file and runtime.
