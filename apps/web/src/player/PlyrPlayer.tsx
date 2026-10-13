import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import {
  createHtml5Adapter,
  resolveMediaAdapter,
  UnsupportedMediaAdapterError,
} from './media-adapter.js';
import { bindPlaybackEvents, type PlaybackState } from './playback-events.js';

export type { PlaybackState } from './playback-events.js';

type Props = {
  src: string;
  poster?: string;
  title: string;
  initialTime?: number;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
  onPlaybackStateChange?: (state: PlaybackState) => void;
};

const STATUS_LABELS: Record<PlaybackState, string> = {
  ready: '等待播放',
  playing: '正在播放',
  paused: '已暂停',
  buffering: '正在缓冲',
  ended: '播放结束',
  error: '播放遇到问题',
};

const HTML5_ADAPTER = createHtml5Adapter();

export default function PlyrPlayer({
  src,
  poster,
  title,
  initialTime = 0,
  onProgress,
  onPlaybackStateChange,
}: Props) {
  const playerMountRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onPlaybackStateChange);
  const progressCallbackRef = useRef(onProgress);
  const initialTimeRef = useRef(initialTime);
  const [status, setStatus] = useState<PlaybackState>('ready');
  const [error, setError] = useState('');

  useEffect(() => {
    callbackRef.current = onPlaybackStateChange;
  }, [onPlaybackStateChange]);

  useEffect(() => {
    progressCallbackRef.current = onProgress;
  }, [onProgress]);

  initialTimeRef.current = initialTime;

  useEffect(() => {
    const mount = playerMountRef.current;
    if (!mount) return;

    // Plyr wraps and replaces the media node during destroy(). Create a fresh
    // video node per effect setup so React StrictMode can safely replay effects.
    mount.replaceChildren();
    const video = document.createElement('video');
    video.playsInline = true;
    video.controls = true;
    video.crossOrigin = 'anonymous';
    if (poster) video.poster = poster;
    video.title = title;
    mount.append(video);

    setStatus('ready');
    setError('');

    let detachMediaSource = () => {};
    let player: Plyr | null = null;

    const updateStatus = (next: PlaybackState) => {
      setStatus(next);
      callbackRef.current?.(next);
    };

    const unbindPlaybackEvents = bindPlaybackEvents(video, {
      getInitialTime: () => initialTimeRef.current,
      onStatus: updateStatus,
      onProgress: (progress) => progressCallbackRef.current?.(progress),
      onError: () => {
        setError('视频源暂时无法播放。请稍后重试，或返回详情页选择其他内容。');
      },
    });

    const cleanup = () => {
      unbindPlaybackEvents();
      try {
        detachMediaSource();
      } finally {
        try {
          player?.destroy();
        } finally {
          // Plyr restores a cloned native video node; discard it before the next setup.
          mount.replaceChildren();
        }
      }
    };

    try {
      const selected = resolveMediaAdapter(src, { html5: HTML5_ADAPTER });
      detachMediaSource = selected.adapter.attach(video, {
        url: src,
        mimeType: selected.mimeType,
      });

      player = new Plyr(video, {
        autoplay: false,
        // Keep the control strip available in the desktop app instead of auto-hiding it during playback.
        hideControls: false,
        muted: false,
        clickToPlay: true,
        keyboard: { focused: true, global: false },
        tooltips: { controls: true, seek: true },
        controls: [
          'play-large',
          'play',
          'progress',
          'current-time',
          'duration',
          'mute',
          'volume',
          'settings',
          'pip',
          'fullscreen',
        ],
      });
    } catch (cause) {
      updateStatus('error');
      if (cause instanceof UnsupportedMediaAdapterError && cause.adapterId === 'hls') {
        setError('当前版本尚不支持 HLS（.m3u8）播放。');
      } else {
        setError('播放器初始化失败。请重试或返回详情页。');
      }
      return cleanup;
    }

    return cleanup;
  }, [src, poster, title]);

  return (
    <div className="player-shell" aria-label={'播放器：' + title}>
      <div className="player-mount" ref={playerMountRef} />
      <div className="player-status-line" aria-live="polite">
        <span className={'player-status-dot player-status-dot-' + status} />
        {STATUS_LABELS[status]}
      </div>
      {error && <div className="player-error" role="alert">{error}</div>}
    </div>
  );
}
