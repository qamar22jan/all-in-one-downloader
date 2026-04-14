// ============================================================
// Instagram Downloader — Frontend API Service
// ============================================================
// Connects to YOUR Python backend (server-python/)
// Backend uses yt-dlp which natively supports Instagram
// ============================================================

export interface InstagramMedia {
  url: string;
  type: "video" | "image";
  width: number | null;
  height: number | null;
  duration?: string;
}

export interface InstagramInfo {
  title: string;
  description: string;
  author: string;
  authorUsername: string;
  authorProfilePic: string | null;
  thumbnail: string;
  mediaCount: number;
  mediaType: "video" | "image" | "carousel" | "reel";
  duration: string | null;
  likes: string | null;
  media: InstagramMedia[];
}

export interface InstagramDownloadState {
  status: "idle" | "downloading" | "complete" | "error";
  progress: number;
  message: string;
  downloadUrl?: string;
  filename?: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  error?: string;
}

// Import shared utilities from youtubeApi (Bug Fix #3: shared backend URL management)
import {
  getBackendUrl,
  setBackendUrl,
  resolveBackendUrl,
  cleanProgressMessage,
} from "./youtubeApi";

// Re-export for convenience
export { getBackendUrl, setBackendUrl, resolveBackendUrl, cleanProgressMessage };

// Instagram URL validation
export function isValidInstagramUrl(url: string): boolean {
  const patterns = [
    /instagram\.com\/p\//,
    /instagram\.com\/reel\//,
    /instagram\.com\/reels\//,
    /instagram\.com\/tv\//,
    /instagram\.com\/stories\//,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

export function getInstagramMediaType(url: string): string {
  if (/instagram\.com\/reel\//i.test(url) || /instagram\.com\/reels\//i.test(url)) return "Reel";
  if (/instagram\.com\/stories\//i.test(url)) return "Story";
  if (/instagram\.com\/tv\//i.test(url)) return "IGTV";
  if (/instagram\.com\/p\//i.test(url)) return "Post";
  return "Post";
}

// Fetch with timeout
const FETCH_TIMEOUT = 30000;
const HEALTH_TIMEOUT = 5000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// ============================================================
// API Functions
// ============================================================

export async function checkBackendHealth(): Promise<{
  ok: boolean;
  version?: string;
  ffmpeg?: boolean;
  cookies?: string;
  error?: string;
}> {
  try {
    const response = await fetchWithTimeout(
      `${getBackendUrl()}/api/health`,
      {},
      HEALTH_TIMEOUT
    );
    if (!response.ok) {
      return { ok: false, error: `Server returned ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: true,
      version: data.version,
      ffmpeg: data.ffmpeg,
      cookies: data.cookies,
    };
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? "Connection timed out"
        : err instanceof TypeError
        ? "Cannot connect to server"
        : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function fetchInstagramInfo(url: string): Promise<InstagramInfo> {
  const backendUrl = getBackendUrl();
  const apiUrl = `${backendUrl}/api/instagram/info?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetchWithTimeout(apiUrl);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Server error (${response.status})`);
    }
    return data as InstagramInfo;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Request timed out. The media might be unavailable or the server is busy."
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        `Cannot connect to backend at ${backendUrl}. Make sure the Python server is running:\n\ncd server-python\npip install -r requirements.txt\npython app.py`
      );
    }
    throw err;
  }
}

export function startInstagramDownload(
  url: string,
  mediaIndex: number = 0,
  onProgress: (status: string, message: string, progress: number) => void,
  onComplete: (downloadUrl: string, filename: string, size: number, sizeFormatted: string) => void,
  onError: (error: string) => void
): () => void {
  const backendUrl = getBackendUrl();
  const params = new URLSearchParams({
    url,
    index: String(mediaIndex),
  });
  const sseUrl = `${backendUrl}/api/instagram/download?${params}`;
  const eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.status === "complete" && data.filename) {
        // Use R2/cloud URL if provided by backend, otherwise construct local URL
        const downloadUrl =
          data.downloadUrl || `${backendUrl}/downloads/${encodeURIComponent(data.filename)}`;
        onComplete(downloadUrl, data.filename, data.size || 0, data.sizeFormatted || "");
        eventSource.close();
      } else if (data.status === "error") {
        onError(data.message || "Download failed");
        eventSource.close();
      } else {
        onProgress(data.status, data.message, data.progress || 0);
      }
    } catch {
      onError("Failed to parse server response");
      eventSource.close();
    }
  };

  eventSource.onerror = () => {
    onError("Connection to server lost. The download may have been interrupted.");
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}
