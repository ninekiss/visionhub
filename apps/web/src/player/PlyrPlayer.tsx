import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import {
  createHtml5Adapter,
  resolveMediaAdapter,
  UnsupportedMediaAdapterError,
} from './media-adapter.js';
import { createHlsAdapter, HlsPlaybackNotSupportedError } from './hls-adapter.js';
import { bindPlaybackEvents, getPlaybackErrorMessage, type PlaybackState } from './playback-events.js';
import { PLAYBACK_SPEED_OPTIONS, readPlaybackPreferences, writePlaybackPreferences } from './playback-preferences.js';
import type { MediaQualityController, MediaQualityLevel } from './media-adapter.js';

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
const HLS_ADAPTER = createHlsAdapter();
const DEFAULT_SOURCE_ERROR = '视频源暂时无法播放。请稍后重试，或返回详情页选择其他内容。';
const HLS_SOURCE_ERROR = 'HLS 流加载失败。请检查播放源、网络连接或稍后重试。';

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
  const [qualityLevels, setQualityLevels] = useState<MediaQualityLevel[]>([]);
  const [qualityController, setQualityController] = useState<MediaQualityController | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('auto');

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
    setQualityLevels([]);
    setQualityController(null);
    setSelectedQuality('auto');
    const preferences = readPlaybackPreferences();

    let detachMediaSource = () => {};
    let player: Plyr | null = null;
    let sourceErrorMessage = DEFAULT_SOURCE_ERROR;
    const persistPreferences = () => {
      if (!player) return;
      writePlaybackPreferences({ volume: video.volume, playbackRate: video.playbackRate });
    };

    const updateStatus = (next: PlaybackState) => {
      setStatus(next);
      callbackRef.current?.(next);
    };

    const unbindPlaybackEvents = bindPlaybackEvents(video, {
      getInitialTime: () => initialTimeRef.current,
      onStatus: updateStatus,
      onProgress: (progress) => progressCallbackRef.current?.(progress),
      onError: (mediaError) => setError(getPlaybackErrorMessage(mediaError, sourceErrorMessage)),
    });

    const cleanup = () => {
      unbindPlaybackEvents();
      video.removeEventListener('volumechange', persistPreferences);
      video.removeEventListener('ratechange', persistPreferences);
      persistPreferences();
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
      const selected = resolveMediaAdapter(src, {
        html5: HTML5_ADAPTER,
        hls: HLS_ADAPTER,
      });
      if (selected.adapterId === 'hls') sourceErrorMessage = HLS_SOURCE_ERROR;

      detachMediaSource = selected.adapter.attach(video, {
        url: src,
        mimeType: selected.mimeType,
        onFatalError: (failure) => {
          updateStatus('error');
          setError(failure?.kind === 'load-timeout'
            ? '视频加载超时，请检查网络连接或播放源是否有效。'
            : sourceErrorMessage);
        },
        onQualityControlReady: (controller) => setQualityController(controller),
        onQualityLevelsChange: (levels) => {
          setQualityLevels(levels);
          setSelectedQuality((current) =>
            current !== 'auto' && levels.some((level) => String(level.id) === current)
              ? current
              : 'auto',
          );
        },
      });

      player = new Plyr(video, {
        autoplay: false,
        // Keep the control strip available in the desktop app instead of auto-hiding it during playback.
        hideControls: false,
        muted: false,
        volume: preferences.volume,
        speed: {
          selected: preferences.playbackRate,
          options: [...PLAYBACK_SPEED_OPTIONS],
        },
        // VisionHub persists volume/speed under its own versioned key so Web
        // and Electron use the same semantics without duplicate Plyr storage.
        storage: { enabled: false },
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
      player.volume = preferences.volume;
      player.speed = preferences.playbackRate;
      video.addEventListener('volumechange', persistPreferences);
      video.addEventListener('ratechange', persistPreferences);
    } catch (cause) {
      updateStatus('error');
      if (cause instanceof HlsPlaybackNotSupportedError) {
        setError('当前运行环境不支持 HLS 播放（Media Source Extensions）。');
      } else if (cause instanceof UnsupportedMediaAdapterError && cause.adapterId === 'hls') {
        setError('当前版本尚未配置 HLS 适配器。');
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
        <span>{STATUS_LABELS[status]}</span>
        {qualityController && qualityLevels.length > 1 && (
          <label className="player-quality-control">
            <span>画质</span>
            <select
              aria-label="播放画质"
              value={selectedQuality}
              onChange={(event) => {
                const controller = qualityController;
                if (!controller) return;
                const value = event.currentTarget.value;
                controller.setLevel(value === 'auto' ? -1 : Number(value));
                setSelectedQuality(value);
              }}
            >
              <option value="auto">自动</option>
              {qualityLevels.map((level) => (
                <option key={level.id} value={String(level.id)}>{level.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <div className="player-error" role="alert">{error}</div>}
    </div>
  );
}
