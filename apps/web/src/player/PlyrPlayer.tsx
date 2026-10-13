import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

export type PlaybackState = 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

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
    const sourceElement = document.createElement('source');
    sourceElement.src = src;
    sourceElement.type = 'video/mp4';
    video.append(sourceElement, document.createTextNode('当前浏览器不支持 HTML5 视频播放。'));
    mount.append(video);

    setStatus('ready');
    setError('');

    const player = new Plyr(video, {
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

    const updateStatus = (next: PlaybackState) => {
      setStatus(next);
      callbackRef.current?.(next);
    };
    let lastProgressReportAt = 0;
    const reportProgress = (force = false) => {
      const currentTime = video.currentTime;
      const duration = video.duration;
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;
      const now = Date.now();
      if (!force && now - lastProgressReportAt < 5000) return;
      lastProgressReportAt = now;
      progressCallbackRef.current?.({ currentTime, duration });
    };
    const handleLoadedMetadata = () => {
      const resumeAt = initialTimeRef.current;
      if (Number.isFinite(resumeAt) && resumeAt > 5 && resumeAt < video.duration - 15) {
        try {
          video.currentTime = resumeAt;
        } catch {
          // Browsers may reject a seek before the media timeline is ready.
        }
      }
    };
    let hasStartedPlayback = false;
    const handlePlaying = () => {
      hasStartedPlayback = true;
      updateStatus('playing');
    };
    const handleCanPlay = () => {
      if (video.paused && !video.ended) {
        updateStatus(hasStartedPlayback ? 'paused' : 'ready');
      }
    };
    const handlePause = () => {
      if (!video.ended) updateStatus('paused');
      reportProgress(true);
    };
    const handleTimeUpdate = () => reportProgress();
    const handleWaiting = () => updateStatus('buffering');
    const handleEnded = () => {
      updateStatus('ended');
      reportProgress(true);
    };
    const handleError = () => {
      updateStatus('error');
      setError('视频源暂时无法播放。请稍后重试，或返回详情页选择其他内容。');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      player.destroy();
      // Plyr restores a cloned native video node; discard it before the next setup.
      mount.replaceChildren();
    };
  }, [src, poster, title]);

  return (
    <div className="player-shell" aria-label={`播放器：${title}`}>
      <div className="player-mount" ref={playerMountRef} />
      <div className="player-status-line" aria-live="polite">
        <span className={`player-status-dot player-status-dot-${status}`} />
        {STATUS_LABELS[status]}
      </div>
      {error && <div className="player-error" role="alert">{error}</div>}
    </div>
  );
}
