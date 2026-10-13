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
  };
}
