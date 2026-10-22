import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaybackProvider, PlaybackSource } from '@visionhub/contracts';

type ProviderSource = Extract<PlaybackSource, { kind: 'provider' }>;
type Status = 'loading' | 'ready' | 'error';

type SourceProgress = { currentTime: number; duration: number };

type Props = {
  source: ProviderSource;
  provider?: PlaybackProvider;
  title: string;
  initialTime?: number;
  onProgress?: (progress: SourceProgress) => void;
};

const SOURCE_PROGRESS_CHANNEL = 'visionhub-source-progress-v1';
const EXTENSION_CONNECTION_TIMEOUT_MS = 1800;
const DEFAULT_PLAYER_READY_TIMEOUT_MS = 60000;

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
  const visible = rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight;
  // Keep the native view at the element's full size. The parent content view
  // clips the portion outside the renderer viewport; shrinking to the visible
  // intersection makes the video itself scale down while the page scrolls.
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    visible,
  };
}

export default function ExternalSourcePlayer({ source, provider, title, initialTime = 0, onProgress }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const [readinessFallback, setReadinessFallback] = useState(false);
  const frameTimeoutRef = useRef<number | undefined>(undefined);
  const connectionTimeoutRef = useRef<number | undefined>(undefined);
  const readinessTimeoutRef = useRef<number | undefined>(undefined);
  const extensionConnectedRef = useRef(false);
  const extensionReadyRef = useRef(false);
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
  const embedOrigin = useMemo(() => {
    if (!embedUrl) return null;
    try {
      return new URL(embedUrl).origin;
    } catch {
      return null;
    }
  }, [embedUrl]);
  const bridgeToken = useMemo(() => {
    try {
      const token = window.crypto?.randomUUID?.();
      if (token) return token;
    } catch {
      // Fall through to a per-instance nonce in restricted browser contexts.
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' +
      Math.random().toString(36).slice(2);
  }, [source.providerId, source.contentId, retryNonce]);
  const initialTimeRef = useRef(initialTime);
  const progressCallbackRef = useRef(onProgress);
  const playerReadyTimeoutMs = provider?.timeoutMs ?? DEFAULT_PLAYER_READY_TIMEOUT_MS;
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
    progressCallbackRef.current = onProgress;
  }, [onProgress]);

  const postProgressBridgeInit = useCallback(() => {
    const frame = frameRef.current;
    if (!frame?.contentWindow || !embedOrigin || !bridgeToken || window.visionHubDesktop) return;
    frame.contentWindow.postMessage({
      channel: SOURCE_PROGRESS_CHANNEL,
      type: 'initialize',
      token: bridgeToken,
      topOrigin: window.location.origin,
      initialTime: initialTimeRef.current,
    }, embedOrigin);
  }, [bridgeToken, embedOrigin]);

  useEffect(() => {
    if (!embedUrl || !embedOrigin || !bridgeToken || window.visionHubDesktop) return;
    let active = true;
    let attempts = 0;
    const retryHandle = window.setInterval(() => {
      attempts += 1;
      postProgressBridgeInit();
      if (attempts >= 20) window.clearInterval(retryHandle);
    }, 500);

    const onBridgeMessage = (event: MessageEvent<unknown>) => {
      if (!active || event.source !== frameRef.current?.contentWindow || event.origin !== embedOrigin) return;
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as {
        channel?: unknown;
        type?: unknown;
        token?: unknown;
        currentTime?: unknown;
        duration?: unknown;
      };
      if (message.channel !== SOURCE_PROGRESS_CHANNEL || message.token !== bridgeToken) return;
      if (message.type === 'connected') {
        setExtensionConnected(true);
        extensionConnectedRef.current = true;
        if (connectionTimeoutRef.current !== undefined) {
          window.clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = undefined;
        }
        return;
      }
      if (message.type === 'ready') {
        setExtensionConnected(true);
        setExtensionReady(true);
        setReadinessFallback(false);
        extensionConnectedRef.current = true;
        extensionReadyRef.current = true;
        setStatus('ready');
        setErrorMessage('');
        if (connectionTimeoutRef.current !== undefined) {
          window.clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = undefined;
        }
        if (readinessTimeoutRef.current !== undefined) {
          window.clearTimeout(readinessTimeoutRef.current);
          readinessTimeoutRef.current = undefined;
        }
        window.clearInterval(retryHandle);
        return;
      }
      if (message.type !== 'progress') return;
      if (
        typeof message.currentTime !== 'number' ||
        !Number.isFinite(message.currentTime) ||
        message.currentTime < 0 ||
        typeof message.duration !== 'number' ||
        !Number.isFinite(message.duration) ||
        message.duration <= 0
      ) return;
      progressCallbackRef.current?.({
        currentTime: message.currentTime,
        duration: message.duration,
      });
    };

    window.addEventListener('message', onBridgeMessage);
    postProgressBridgeInit();
    return () => {
      active = false;
      window.clearInterval(retryHandle);
      window.removeEventListener('message', onBridgeMessage);
    };
  }, [bridgeToken, embedOrigin, embedUrl, postProgressBridgeInit]);

  useEffect(() => {
    setStatus('loading');
    setErrorMessage('');
    setExtensionConnected(false);
    setExtensionReady(false);
    setReadinessFallback(false);
    extensionConnectedRef.current = false;
    extensionReadyRef.current = false;
    if (connectionTimeoutRef.current !== undefined) {
      window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = undefined;
    }
    if (readinessTimeoutRef.current !== undefined) {
      window.clearTimeout(readinessTimeoutRef.current);
      readinessTimeoutRef.current = undefined;
    }

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
        if (event.status === 'progress') {
          if (
            typeof event.currentTime === 'number' && Number.isFinite(event.currentTime) &&
            event.currentTime >= 0 &&
            typeof event.duration === 'number' && Number.isFinite(event.duration) &&
            event.duration > 0
          ) {
            progressCallbackRef.current?.({
              currentTime: Math.min(event.currentTime, event.duration),
              duration: event.duration,
            });
          }
          return;
        }
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
        initialTime: initialTimeRef.current,
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
    }, playerReadyTimeoutMs);
    return () => {
      cancelled = true;
      if (frameTimeoutRef.current !== undefined) {
        window.clearTimeout(frameTimeoutRef.current);
        frameTimeoutRef.current = undefined;
      }
      if (connectionTimeoutRef.current !== undefined) {
        window.clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = undefined;
      }
      if (readinessTimeoutRef.current !== undefined) {
        window.clearTimeout(readinessTimeoutRef.current);
        readinessTimeoutRef.current = undefined;
      }
    };
  }, [provider, source.providerId, source.contentId, embedUrl, getBounds, requestId, retryNonce]);

  return (
    <div className="external-source-player-layout">
      <div className="external-source-player" ref={rootRef} aria-label={'外部源站播放器：' + title}>
        {embedUrl && !window.visionHubDesktop && (
          <iframe
            className={`external-source-frame${status === 'ready' ? '' : ' external-source-frame-pending'}`}
            aria-hidden={status !== 'ready'}
            tabIndex={status === 'ready' ? 0 : -1}
            ref={frameRef}
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
              if (extensionReadyRef.current) {
                setStatus('ready');
                postProgressBridgeInit();
                return;
              }

              setStatus('loading');
              setErrorMessage('');
              setReadinessFallback(false);
              if (connectionTimeoutRef.current !== undefined) {
                window.clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = undefined;
              }
              if (!extensionConnectedRef.current) {
                connectionTimeoutRef.current = window.setTimeout(() => {
                  if (extensionReadyRef.current || extensionConnectedRef.current) return;
                  setReadinessFallback(true);
                  setStatus('ready');
                  setErrorMessage('');
                }, EXTENSION_CONNECTION_TIMEOUT_MS);
              }
              if (readinessTimeoutRef.current !== undefined) {
                window.clearTimeout(readinessTimeoutRef.current);
              }
              readinessTimeoutRef.current = window.setTimeout(() => {
                if (extensionReadyRef.current) return;
                setReadinessFallback(true);
                setStatus('ready');
                setErrorMessage('');
              }, playerReadyTimeoutMs);
              postProgressBridgeInit();
            }}
          />
        )}
        {status === 'loading' && (
          <div className="external-source-state" role="status" aria-live="polite">
            <span className="external-source-spinner" />
            <strong>正在加载源站视频</strong>
            <small>{provider?.name ?? source.providerId} · 正在等待可播放画面…</small>
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
        <span className="external-source-footer-note">
          {browserEmbedFallbackNote}
          {!window.visionHubDesktop && embedUrl && (
            <span>{browserEmbedFallbackNote ? ' ' : ''}{extensionReady
              ? '源站播放器已就绪，播放进度同步已连接'
              : readinessFallback
                ? extensionConnected
                  ? '未检测到可用的视频就绪信号，已显示源站页面'
                  : '未检测到扩展，就绪检查已跳过'
                : extensionConnected
                  ? '扩展已连接，正在等待源站播放器就绪…'
                  : '正在等待扩展确认源站播放器就绪…'}</span>
          )}
        </span>
        {openUrl && (
          <a className="external-source-open-link" href={openUrl} target="_blank" rel="noopener noreferrer">
            源站无法显示？在新标签页打开
          </a>
        )}
      </div>
    </div>
  );
}
