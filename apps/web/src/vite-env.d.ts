/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** Opens the external source webview DevTools in development when set to "1". */
  readonly VITE_DEBUG_EXTERNAL_WEBVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css' {}

interface Window {
  /**
   * Narrow, typed bridge exposed by the Electron preload.
   * It is absent in a normal browser session.
   */
  visionHubDesktop?: {
    getAppInfo: () => Promise<{
      appVersion: string;
      platform: string;
      arch: string;
      releaseChannel: "packaged" | "development";
    }>;
    openExternalPlayer: (request: {
      providerId: string;
      contentId: string;
      requestId: string;
    }) => Promise<{ url: string }>;
    closeExternalPlayer: (request: { requestId: string }) => Promise<boolean>;
    onExternalPlayerStatus: (listener: (payload: {
      status: "loading" | "ready" | "error";
      providerId: string;
      requestId: string;
      code?: string;
    }) => void) => () => void;
  };
}
