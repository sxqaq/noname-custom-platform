export interface PlatformBridge {
  kind: "web" | "capacitor" | "tauri";
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  shareText(text: string): Promise<void>;
  saveFile(name: string, data: Blob): Promise<void>;
}

export const webPlatform: PlatformBridge = {
  kind: "web",
  storage: { get: (key) => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value) },
  async shareText(text) { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); },
  async saveFile(name, data) { const url = URL.createObjectURL(data); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); },
};

// Capacitor/Tauri 后续只需实现此接口，游戏和创作业务不依赖原生 API。
export const platform: PlatformBridge = webPlatform;
