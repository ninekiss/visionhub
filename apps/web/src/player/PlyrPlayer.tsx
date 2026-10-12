import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

export type PlaybackState = 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

type Props = {
  src: string;
  poster?: string;
  title: string;
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
  onPlaybackStateChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbackRef = useRef(onPlaybackStateChange);
  const [status, setStatus] = useState<PlaybackState>('ready');
  const [error, setError] = useState('');

  useEffect(() => {
    callbackRef.current = onPlaybackStateChange;
  }, [onPlaybackStateChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setStatus('ready');
    setError('');

    const player = new Plyr(video, {
      autoplay: false,
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
    const handlePlaying = () => updateStatus('playing');
    const handlePause = () => {
      if (!video.ended) updateStatus('paused');
    };
    const handleWaiting = () => updateStatus('buffering');
    const handleEnded = () => updateStatus('ended');
    const handleError = () => {
      updateStatus('error');
      setError('视频源暂时无法播放。请稍后重试，或返回详情页选择其他内容。');
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      player.destroy();
    };
  }, [src, poster, title]);

  return (
    <div className="player-shell" aria-label={`播放器：${title}`}>
      <video
        ref={videoRef}
        playsInline
        controls
        crossOrigin="anonymous"
        poster={poster}
        title={title}
      >
        <source src={src} type="video/mp4" />
        当前浏览器不支持 HTML5 视频播放。
      </video>
      <div className="player-status-line" aria-live="polite">
        <span className={`player-status-dot player-status-dot-${status}`} />
        {STATUS_LABELS[status]}
      </div>
      {error && <div className="player-error" role="alert">{error}</div>}
    </div>
  );
}
