// ============================================================
// YouTube Video Downloader — Frontend API Service
// ============================================================
// Connects to YOUR Python backend (server-python/)
// Backend uses yt-dlp with SMART format selection
// ============================================================

export interface VideoFormat {
  itag: string;
  quality: string;
  height: number | null;
  format: string;
  container: string;
  size: string;
  type: "video" | "audio";
  hasVideo: boolean;
  hasAudio: boolean;
  isMuxed: boolean;
  codec: string;
  bitrate: number;
  fps: number | null;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  durationSeconds: number;
  author: string;
  views: string;
  videoId: string;
  description: string;
  formats: VideoFormat[];
}

// Download progress state
export interface DownloadState {
  status: "idle" | "downloading" | "complete" | "error";
  progress: number;
  message: string;
  downloadUrl?: string;
  filename?: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  error?: string;
}

// Backend URL management (shared across services)
const STORAGE_KEY = "yt_downloader_backend_url";
const DEFAULT_BACKEND =
  import.meta.env.VITE_API_URL || "https://all-in-one-downloader-production.up.railway.app";

export function getBackendUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

export function setBackendUrl(url: string): void {
  const cleaned = url.trim().replace(/\/+$/, "");
  try {
    localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {}
}

export function resetBackendUrl(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Resolve download/media URLs — fixes localhost URLs from backend
export function resolveBackendUrl(path: string): string {
  if (!path) return "";
  // Fix localhost URLs that backend may return in Docker/Railway
  if (/^https?:\/\/localhost[:/]/i.test(path) || /^https?:\/\/127\.0\.0\.1[:/]/i.test(path)) {
    try {
      const urlObj = new URL(path);
      const backend = getBackendUrl();
      return `${backend}${urlObj.pathname}${urlObj.search}`;
    } catch {
      // URL parse failed — fall through
    }
  }
  // Already absolute URL (R2 CDN, etc.) — return as-is
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  // Relative path — prepend backend URL
  const backend = getBackendUrl();
  return `${backend}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Clean yt-dlp progress messages for display
export function cleanProgressMessage(msg: string): string {
  if (!msg) return "";
  return msg
    .replace(/\x1b\[[0-9;]*m/g, "") // Remove ANSI escape codes
    .replace(/\[download\]\s*/gi, "")
    .replace(/\[Merger\]\s*/gi, "Merging: ")
    .replace(/\[ExtractAudio\]\s*/gi, "Extracting audio: ")
    .replace(/\[Metadata\]\s*/gi, "Metadata: ")
    .replace(/\[Convert\]\s*/gi, "Converting: ")
    .replace(/\[FixupM3u8\]\s*/gi, "Fixing: ")
    .replace(/\[ffmpeg\]\s*/gi, "Processing: ")
    .replace(/Destination:\s*/gi, "")
    .replace(/Deleting original file.*$/gi, "")
    .trim();
}

// YouTube URL validation
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
    /(?:youtube\.com\/v\/)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
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

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("Could not extract video ID. Please enter a valid YouTube URL.");
  }

  const backendUrl = getBackendUrl();
  const apiUrl = `${backendUrl}/api/info?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetchWithTimeout(apiUrl);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Server error (${response.status})`);
    }
    if (!data.title) {
      throw new Error("Invalid response from server — missing video title.");
    }
    return data as VideoInfo;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Request timed out. The video might be too long or the server is busy. Try again."
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

export function startDownload(
  url: string,
  quality: string,
  mode: "video" | "audio",
  onProgress: (status: string, message: string, progress: number) => void,
  onComplete: (downloadUrl: string, filename: string, size: number, sizeFormatted: string) => void,
  onError: (error: string) => void
): () => void {
  const backendUrl = getBackendUrl();
  const params = new URLSearchParams({ url, quality, mode });
  const sseUrl = `${backendUrl}/api/download?${params}`;
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
