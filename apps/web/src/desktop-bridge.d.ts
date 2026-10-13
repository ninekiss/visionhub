export {};

type ExternalPlayerBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
};

type ExternalPlayerStatusPayload = {
  status: "loading" | "ready" | "error";
  providerId: string;
  code?: string;
};

declare global {
  interface Window {
    visionHubDesktop?: {
      getAppInfo(): Promise<{
        appVersion: string;
        platform: string;
        arch: string;
        releaseChannel: "packaged" | "development";
      }>;
      openExternalPlayer(request: {
        providerId: string;
        contentId: string;
        bounds: ExternalPlayerBounds;
      }): Promise<boolean>;
      resizeExternalPlayer(request: {
        providerId: string;
        bounds: ExternalPlayerBounds;
      }): Promise<boolean>;
      closeExternalPlayer(): Promise<boolean>;
      onExternalPlayerStatus(listener: (payload: ExternalPlayerStatusPayload) => void): () => void;
    };
  }
}
