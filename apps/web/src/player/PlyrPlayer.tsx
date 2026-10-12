import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

type Props = {
  src: string;
  poster?: string;
  title: string;
};

export default function PlyrPlayer({ src, poster, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const player = new Plyr(videoRef.current, {
      autoplay: false,
      muted: false,
      clickToPlay: true,
      keyboard: { focused: true, global: false },
      tooltips: { controls: true, seek: true },
      controls: [
        'play-large', 'play', 'progress', 'current-time', 'duration',
        'mute', 'volume', 'settings', 'pip', 'fullscreen',
      ],
    });
    return () => player.destroy();
  }, [src]);

  return (
    <div className="player-shell" aria-label={`播放器：${title}`}>
      <video ref={videoRef} playsInline controls crossOrigin="anonymous" poster={poster}>
        <source src={src} type="video/mp4" />
        当前浏览器不支持 HTML5 视频播放。
      </video>
    </div>
  );
}
