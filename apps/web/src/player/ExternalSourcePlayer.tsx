import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaybackProvider, PlaybackSource } from '@visionhub/contracts';

type ProviderSource = Extract<PlaybackSource, { kind: 'provider' }>;
type Status = 'loading' | 'ready' | 'error';

type Props = {
  source: ProviderSource;
  provider?: PlaybackProvider;
  title: string;
};

function resolveTemplate(template: string | undefined, contentId: string): string | null {
  if (!template || !template.includes('{contentId}')) return null;
  try {
    const value = template.replaceAll('{contentId}', encodeURIComponent(contentId));
    if (value.includes('{') || value.includes('}')) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function createExternalPlayerRequestId(retryNonce: number): string {
  let random = '';
  try {
    random = window.crypto?.randomUUID?.() ?? '';
  } catch {
    // Some older or restricted Electron renderer contexts may not expose randomUUID.
  }
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(random)) {
    random = `${Date.now().toString(36)}-${retryNonce.toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  return `${retryNonce}:${random}`;
}

function getVisibleBounds(element: HTMLDivElement) {
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  const visible = right > left && bottom > top;
  return {
    x: visible ? left : 0,
    y: visible ? top : 0,
    width: visible ? right - left : 1,
    height: visible ? bottom - top : 1,
    visible,
  };
}

export default function ExternalSourcePlayer({ source, provider, title }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const frameTimeoutRef = useRef<number | undefined>(undefined);
  const requestId = useMemo(
    () => createExternalPlayerRequestId(retryNonce),
    [source.providerId, source.contentId, retryNonce],
  );
  const embedUrl = useMemo(
    () => resolveTemplate(provider?.webEmbedUrlTemplate, source.contentId),
    [provider?.webEmbedUrlTemplate, source.contentId],
  );
  const openUrl = useMemo(
    () => resolveTemplate(provider?.webOpenUrlTemplate, source.contentId),
    [provider?.webOpenUrlTemplate, source.contentId],
  );
  const desktop = window.visionHubDesktop;
  const desktopUnavailable = !desktop && !embedUrl && Boolean(openUrl);
  const browserEmbedFallbackNote = !desktop && embedUrl && status === 'ready'
    ? '如果视频区域为空，源站可能禁止跨站嵌入。'
    : desktopUnavailable
      ? '此源站未提供可供网页内嵌的播放器地址。'
      : '';

  const getBounds = useCallback(() => {
    const root = rootRef.current;
    return root ? getVisibleBounds(root) : { x: 0, y: 0, width: 1, height: 1, visible: false };
  }, []);

  useEffect(() => {
    setStatus('loading');
    setErrorMessage('');

    if (!provider) {
      setStatus('error');
      setErrorMessage('这个源站尚未配置。请检查服务端和桌面端的 configs/playback-sources.yaml。');
      return;
    }

    const desktop = window.visionHubDesktop;
    if (desktop) {
      let cancelled = false;
      const unsubscribe = desktop.onExternalPlayerStatus((event) => {
        if (cancelled || event.providerId !== source.providerId || event.requestId !== requestId) return;
        if (event.status === 'ready') {
          setStatus('ready');
          setErrorMessage('');
        } else if (event.status === 'error') {
          setStatus('error');
          const messages: Record<string, string> = {
            'player-not-ready': '源站页面已打开，但在规定时间内没有找到配置的播放器元素。',
            'navigation-blocked': '源站尝试跳转到未获允许的域名，已阻止本次播放。',
            'load-failed': '源站页面加载失败，请检查网络和源站配置。',
            'renderer-crashed': '源站播放器异常退出，请返回并重新选择播放源。',
          };
          setErrorMessage(messages[event.code ?? ''] ?? '外部播放器打开失败。');
        } else {
          setStatus('loading');
          setErrorMessage('');
        }
      });

      const resize = () => {
        void desktop.resizeExternalPlayer({ providerId: source.providerId, requestId, bounds: getBounds() }).catch(() => {
          // A source may have been closed while a queued resize was in flight.
        });
      };
      const element = rootRef.current;
      const observer = element ? new ResizeObserver(resize) : null;
      if (element && observer) observer.observe(element);
      window.addEventListener('resize', resize);
      window.addEventListener('scroll', resize, true);

      void desktop.openExternalPlayer({
        providerId: source.providerId,
        contentId: source.contentId,
        requestId,
        bounds: getBounds(),
      }).catch((cause: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(cause instanceof Error ? cause.message : '无法启动外部播放器。');
      });

      return () => {
        cancelled = true;
        unsubscribe();
        observer?.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('scroll', resize, true);
        void desktop.closeExternalPlayer({ requestId }).catch(() => {});
      };
    }

    if (!embedUrl) {
      setStatus('error');
      setErrorMessage('此源站没有配置浏览器允许使用的官方嵌入地址；可尝试在新标签页打开源站。');
      return;
    }

    let cancelled = false;
    frameTimeoutRef.current = window.setTimeout(() => {
      if (cancelled) return;
      setStatus('error');
      setErrorMessage('源站嵌入内容未及时载入。如果源站禁止嵌入，请改用新标签页打开。');
    }, 15000);
    return () => {
      cancelled = true;
      if (frameTimeoutRef.current !== undefined) {
        window.clearTimeout(frameTimeoutRef.current);
        frameTimeoutRef.current = undefined;
      }
    };
  }, [provider, source.providerId, source.contentId, embedUrl, getBounds, requestId, retryNonce]);

  return (
    <div className="external-source-player-layout">
    <div className="external-source-player" ref={rootRef} aria-label={'外部源站播放器：' + title}>
      {embedUrl && !window.visionHubDesktop && (
        <iframe
          className="external-source-frame"
          src={embedUrl}
          title={title + ' - ' + (provider?.name ?? '源站')}
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            if (frameTimeoutRef.current !== undefined) {
              window.clearTimeout(frameTimeoutRef.current);
              frameTimeoutRef.current = undefined;
            }
            setStatus('ready');
            setErrorMessage('');
          }}
        />
      )}
      {status === 'loading' && (
        <div className="external-source-state" role="status" aria-live="polite">
          <span className="external-source-spinner" />
          <strong>正在连接源站</strong>
          <small>{provider?.name ?? source.providerId} · 正在准备播放器…</small>
        </div>
      )}
      {status === 'error' && (
        <div className="external-source-state" role="alert">
          <strong>暂时无法播放这个源站</strong>
          <small>{errorMessage || '请稍后重试，或选择其他播放源。'}</small>
          <div className="external-source-actions">
            <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>重试</button>
          </div>
        </div>
      )}
    </div>
      <div className="external-source-footer">
        <span className="external-source-footer-note">{browserEmbedFallbackNote}</span>
        {openUrl && (
          <a className="external-source-open-link" href={openUrl} target="_blank" rel="noopener noreferrer">
            源站无法显示？在新标签页打开
          </a>
        )}
      </div>
    </div>
  );
}
