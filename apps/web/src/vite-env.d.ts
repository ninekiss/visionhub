/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
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
      initialTime?: number;
      bounds: { x: number; y: number; width: number; height: number; visible?: boolean };
    }) => Promise<boolean>;
    resizeExternalPlayer: (request: {
      providerId: string;
      requestId: string;
      bounds: { x: number; y: number; width: number; height: number; visible?: boolean };
    }) => Promise<boolean>;
    closeExternalPlayer: (request: { requestId: string }) => Promise<boolean>;
    onExternalPlayerStatus: (listener: (payload: {
      status: "loading" | "ready" | "error" | "progress";
      providerId: string;
      requestId: string;
      code?: string;
      currentTime?: number;
      duration?: number;
    }) => void) => () => void;
  };
}
