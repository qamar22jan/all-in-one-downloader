import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Download,
  Save,
  AlertCircle,
  Wifi,
  WifiOff,
  Loader2,
  Settings,
  X,
  Music,
  Video,
  CheckCircle2,
  FileVideo,
  FileAudio,
  Info,
  Server,
  Clipboard,
} from "lucide-react";
import {
  type VideoInfo,
  type VideoFormat,
  type DownloadState,
  getBackendUrl,
  setBackendUrl,
  isValidYouTubeUrl,
  checkBackendHealth,
  fetchVideoInfo,
  startDownload,
  cleanProgressMessage,
  resolveBackendUrl,
} from "../services/youtubeApi";

export default function HeroDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"video" | "audio">("video");
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const cleanupFns = useRef<Record<string, () => void>>({});

  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [backendFfmpeg, setBackendFfmpeg] = useState(true);
  const [_backendCookies, setBackendCookies] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [configUrl, setConfigUrl] = useState(getBackendUrl());
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    return () => {
      Object.values(cleanupFns.current).forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    checkBackend();
  }, []);

  const checkBackend = useCallback(async () => {
    setBackendStatus("checking");
    const result = await checkBackendHealth();
    setBackendStatus(result.ok ? "connected" : "disconnected");
    if (result.ffmpeg !== undefined) setBackendFfmpeg(result.ffmpeg);
    if (result.cookies !== undefined) setBackendCookies(result.cookies);
  }, []);

  const saveConfig = useCallback(() => {
    if (configUrl.trim()) {
      setBackendUrl(configUrl.trim());
      setShowConfig(false);
      checkBackend();
    }
  }, [configUrl, checkBackend]);

  const handleAnalyze = useCallback(async () => {
    setError("");
    setVideoInfo(null);
    setDownloadStates({});

    if (!url.trim()) {
      setError("Please paste a YouTube URL");
      return;
    }

    if (!isValidYouTubeUrl(url.trim())) {
      setError("Please enter a valid YouTube URL (youtube.com/watch?v=..., youtu.be/..., or shorts)");
      return;
    }

    if (backendStatus !== "connected") {
      setError("Backend server is not connected. Please start the Python server first.");
      return;
    }

    setLoading(true);

    try {
      const info = await fetchVideoInfo(url.trim());
      setVideoInfo(info);
      const hasVideo = info.formats.some((f) => f.type === "video");
      const hasAudio = info.formats.some((f) => f.type === "audio");
      setActiveTab(hasVideo ? "video" : hasAudio ? "audio" : "video");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch video information. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [url, backendStatus]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError("");
    } catch {
      setError("Could not read clipboard. Please paste manually.");
    }
  }, []);

  const handleDownload = useCallback(
    (format: VideoFormat) => {
      const key = format.quality;
      if (downloadStates[key]?.status === "downloading") return;

      setDownloadStates((prev) => ({
        ...prev,
        [key]: { status: "downloading", progress: 0, message: "Connecting to server..." },
      }));

      const mode: "video" | "audio" = format.type;

      const cleanup = startDownload(
        url.trim(),
        format.quality,
        mode,
        (_status, message, progress) => {
          setDownloadStates((prev) => ({
            ...prev,
            [key]: {
              status: "downloading",
              progress,
              message: cleanProgressMessage(message),
            },
          }));
        },
        (downloadUrl, filename, size, sizeFormatted) => {
          setDownloadStates((prev) => ({
            ...prev,
            [key]: {
              status: "complete",
              progress: 100,
              message: "Ready to save!",
              downloadUrl,
              filename,
              fileSize: size,
              fileSizeFormatted: sizeFormatted,
            },
          }));
        },
        (errMsg) => {
          setDownloadStates((prev) => ({
            ...prev,
            [key]: {
              status: "error",
              progress: 0,
              message: "",
              error: errMsg,
            },
          }));
        }
      );

      cleanupFns.current[key] = cleanup;
    },
    [url, downloadStates]
  );

  const handleSaveFile = useCallback((downloadUrl: string) => {
    const resolvedUrl = resolveBackendUrl(downloadUrl);
    window.open(resolvedUrl, "_blank");
  }, []);

  const filteredFormats = videoInfo?.formats.filter((f) => f.type === activeTab) || [];
  const muxedFormats = filteredFormats.filter((f) => f.isMuxed);
  const videoOnlyFormats = filteredFormats.filter((f) => f.hasVideo && !f.hasAudio);
  const audioFormats = filteredFormats.filter((f) => !f.hasVideo);

  const badges = [
    { icon: <Video size={14} />, label: "HD Quality" },
    { icon: <FileVideo size={14} />, label: "MP4 / Audio" },
    { icon: <CheckCircle2 size={14} />, label: "No Sign-Up" },
    { icon: <Server size={14} />, label: "Free & Fast" },
  ];

  return (
    <section className="hero-gradient relative overflow-hidden py-10 sm:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Hero Header */}
        <div className="mb-8 text-center animate-fade-in-up">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-dark-border bg-dark-card/50 px-3 py-1.5 text-xs text-dark-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-yt-red animate-pulse" />
            YouTube Downloader
          </div>
          <h1 className="mb-3 text-3xl font-extrabold text-dark-text sm:text-4xl lg:text-5xl">
            YouTube Video Downloader
          </h1>
          <p className="text-base text-dark-muted sm:text-lg">
            <span className="font-semibold text-dark-text">Download YouTube Videos</span>{" "}
            Free, Fast & HD Quality
          </p>
          <p className="mt-2 text-sm text-dark-muted/70 max-w-lg mx-auto">
            Paste a YouTube link — your server downloads the video using yt-dlp, then you save the file directly to your device.
          </p>
        </div>

        {/* Backend Status Bar */}
        <div className="mb-4 flex items-center justify-between gap-3 text-xs">
          <button
            onClick={() => setShowSetup(!showSetup)}
            className="flex items-center gap-1.5 text-dark-muted hover:text-dark-text transition-colors"
          >
            {backendStatus === "connected" ? (
              <Wifi size={14} className="text-green-400" />
            ) : backendStatus === "checking" ? (
              <Loader2 size={14} className="animate-spin text-yellow-400" />
            ) : (
              <WifiOff size={14} className="text-red-400" />
            )}
            <span>
              {backendStatus === "connected"
                ? "Backend Connected"
                : backendStatus === "checking"
                ? "Checking Backend..."
                : "Backend Offline"}
            </span>
            {backendFfmpeg && backendStatus === "connected" && (
              <span className="text-green-400/70">• ffmpeg ✓</span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setConfigUrl(getBackendUrl());
                setShowConfig(true);
              }}
              className="rounded-lg p-1.5 text-dark-muted hover:bg-dark-surface hover:text-dark-text transition-colors"
              title="Configure backend URL"
            >
              <Settings size={14} />
            </button>
            <button
              onClick={() => checkBackend()}
              className="rounded-lg p-1.5 text-dark-muted hover:bg-dark-surface hover:text-dark-text transition-colors"
              title="Refresh connection"
            >
              <Server size={14} />
            </button>
          </div>
        </div>

        {/* Setup Instructions */}
        {showSetup && backendStatus !== "connected" && (
          <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
            <h3 className="mb-2 text-sm font-semibold text-yellow-400">🚀 Quick Setup</h3>
            <p className="mb-3 text-xs text-dark-muted">
              This downloader uses your own Python server with yt-dlp. Run these commands:
            </p>
            <pre className="mb-3 rounded-lg bg-dark-bg p-3 text-xs text-dark-muted font-mono overflow-x-auto">
              $ cd server-python{"\n"}
              $ pip install -r requirements.txt{"\n"}
              $ python app.py
            </pre>
            <div className="text-xs text-dark-muted/70 space-y-1">
              <p>🍪 Browser Cookies: The server auto-detects your browser cookies to bypass YouTube's 403 errors.</p>
              <p>⚠️ ffmpeg recommended: Install ffmpeg for merging video+audio and MP3 conversion.</p>
            </div>
          </div>
        )}

        {/* Config Modal */}
        {showConfig && (
          <div className="mb-4 rounded-xl border border-dark-border bg-dark-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-dark-text">Backend URL</h3>
              <button onClick={() => setShowConfig(false)} className="text-dark-muted hover:text-dark-text">
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-xs text-dark-muted">
              Enter the URL where your Python backend server is running.
            </p>
            <div className="flex gap-2">
              <input
                value={configUrl}
                onChange={(e) => setConfigUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="flex-1 rounded-xl border border-dark-border bg-dark-surface px-4 py-2.5 text-sm text-dark-text placeholder:text-dark-muted/50 focus:outline-none focus:border-yt-red/50"
              />
              <button
                onClick={saveConfig}
                className="rounded-xl bg-yt-red px-4 py-2.5 text-sm font-medium text-white hover:bg-yt-red-dark transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2 animate-fade-in-up-delay-1">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className="flex items-center gap-1.5 rounded-full border border-dark-border bg-dark-card/50 px-3 py-1 text-xs text-dark-muted"
            >
              {badge.icon}
              {badge.label}
            </span>
          ))}
        </div>

        {/* URL Input */}
        <div className="input-glow mb-4 flex items-center gap-2 rounded-2xl border border-dark-border bg-dark-card px-4 py-3 transition-all animate-fade-in-up-delay-2">
          <Search size={18} className="text-dark-muted flex-shrink-0" />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="Paste YouTube video URL here..."
            className="w-full bg-transparent text-sm text-dark-text placeholder:text-dark-muted/50 focus:outline-none sm:text-base"
          />
          {url && (
            <button onClick={() => { setUrl(""); setError(""); }} className="text-dark-muted hover:text-dark-text flex-shrink-0">
              <X size={16} />
            </button>
          )}
          <button
            onClick={handlePaste}
            className="text-dark-muted hover:text-dark-text flex-shrink-0"
            title="Paste from clipboard"
          >
            <Clipboard size={16} />
          </button>
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex-shrink-0 rounded-xl bg-gradient-to-r from-yt-red to-red-700 px-5 py-2 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-red-500/25 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Analyze"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-4 flex flex-col items-center gap-3 rounded-xl border border-dark-border bg-dark-card p-8">
            <Loader2 size={32} className="animate-spin text-yt-red" />
            <p className="text-sm font-medium text-dark-text">Fetching video information...</p>
            <p className="text-xs text-dark-muted">yt-dlp is extracting video data from YouTube</p>
          </div>
        )}

        {/* Video Info & Downloads */}
        {videoInfo && !loading && (
          <div className="animate-fade-in-up space-y-4">
            {/* Video Preview Card */}
            <div className="rounded-2xl border border-dark-border bg-dark-card overflow-hidden">
              {/* Thumbnail & Info */}
              <div className="flex flex-col sm:flex-row gap-4 p-4">
                <div className="relative flex-shrink-0 w-full sm:w-64">
                  <img
                    src={resolveBackendUrl(videoInfo.thumbnail)}
                    alt={videoInfo.title}
                    className="w-full rounded-xl object-cover aspect-video"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${videoInfo.videoId}/hqdefault.jpg`;
                    }}
                  />
                  {videoInfo.duration && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-0.5 text-xs text-white">
                      {videoInfo.duration}
                    </span>
                  )}
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <h3 className="mb-1 text-base font-semibold text-dark-text line-clamp-2">{videoInfo.title}</h3>
                  <p className="mb-2 text-sm text-dark-muted">{videoInfo.author}</p>
                  <div className="flex items-center gap-3 text-xs text-dark-muted">
                    <span>{videoInfo.views} views</span>
                    {videoInfo.duration && <span>• {videoInfo.duration}</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span className="text-xs text-green-400">Ready to download</span>
                    <span className="text-xs text-dark-muted">• {videoInfo.formats.length} formats</span>
                  </div>
                </div>
              </div>

              {/* Format Tabs */}
              <div className="flex border-t border-dark-border">
                <button
                  onClick={() => setActiveTab("video")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === "video"
                      ? "text-yt-red border-b-2 border-yt-red bg-yt-red/5"
                      : "text-dark-muted hover:text-dark-text"
                  }`}
                >
                  <Video size={16} />
                  Video
                </button>
                <button
                  onClick={() => setActiveTab("audio")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === "audio"
                      ? "text-yt-red border-b-2 border-yt-red bg-yt-red/5"
                      : "text-dark-muted hover:text-dark-text"
                  }`}
                >
                  <Music size={16} />
                  Audio
                </button>
              </div>

              {/* Info Banner */}
              <div className="flex items-center gap-2 border-t border-dark-border bg-dark-surface/50 px-4 py-2.5">
                <Info size={14} className="text-dark-muted flex-shrink-0" />
                <span className="text-xs text-dark-muted">
                  Click Download → yt-dlp picks the best format → merges video + audio → click Save File.
                </span>
              </div>

              {/* Format List */}
              <div className="border-t border-dark-border p-4 space-y-2 max-h-96 overflow-y-auto">
                {filteredFormats.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-dark-muted">
                    <AlertCircle size={24} />
                    <span className="text-sm">No {activeTab} formats available for this video.</span>
                  </div>
                ) : (
                  <>
                    {activeTab === "video" && muxedFormats.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-dark-muted/70 uppercase tracking-wider mb-2">
                          Video + Audio (Recommended)
                        </p>
                        {muxedFormats.map((format) => {
                          const state = downloadStates[format.quality];
                          return (
                            <FormatRow
                              key={format.itag}
                              format={format}
                              state={state}
                              onDownload={() => handleDownload(format)}
                              onSave={() => state?.downloadUrl && handleSaveFile(state.downloadUrl)}
                            />
                          );
                        })}
                        {videoOnlyFormats.length > 0 && (
                          <p className="text-xs font-semibold text-dark-muted/70 uppercase tracking-wider mt-4 mb-2">
                            Video Only — auto-merge audio (needs ffmpeg)
                          </p>
                        )}
                        {videoOnlyFormats.map((format) => {
                          const state = downloadStates[format.quality];
                          return (
                            <FormatRow
                              key={format.itag}
                              format={format}
                              state={state}
                              onDownload={() => handleDownload(format)}
                              onSave={() => state?.downloadUrl && handleSaveFile(state.downloadUrl)}
                            />
                          );
                        })}
                      </>
                    )}
                    {activeTab === "video" && muxedFormats.length === 0 && videoOnlyFormats.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-dark-muted/70 uppercase tracking-wider mb-2">
                          Video Only — auto-merge audio (needs ffmpeg)
                        </p>
                        {videoOnlyFormats.map((format) => {
                          const state = downloadStates[format.quality];
                          return (
                            <FormatRow
                              key={format.itag}
                              format={format}
                              state={state}
                              onDownload={() => handleDownload(format)}
                              onSave={() => state?.downloadUrl && handleSaveFile(state.downloadUrl)}
                            />
                          );
                        })}
                      </>
                    )}
                    {activeTab === "audio" &&
                      audioFormats.map((format) => {
                        const state = downloadStates[format.quality];
                        return (
                          <FormatRow
                            key={format.itag}
                            format={format}
                            state={state}
                            onDownload={() => handleDownload(format)}
                            onSave={() => state?.downloadUrl && handleSaveFile(state.downloadUrl)}
                          />
                        );
                      })}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-dark-border bg-dark-surface/30 px-4 py-3">
                <span className="text-xs text-dark-muted">Source: yt-dlp Backend</span>
                <button
                  onClick={() => {
                    setVideoInfo(null);
                    setDownloadStates({});
                    setError("");
                  }}
                  className="text-xs text-dark-muted hover:text-yt-red transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-center text-xs text-dark-muted/50">
              Server-side download: Videos are downloaded to your server first using yt-dlp, then served to your browser. Files are auto-deleted after 1 hour.
            </p>
          </div>
        )}

        {/* SEO text */}
        {!videoInfo && !loading && (
          <p className="mt-8 text-center text-xs text-dark-muted/40">
            Self-hosted YouTube video downloader using Python + yt-dlp. Supports YouTube videos, Shorts, youtu.be links.
          </p>
        )}
      </div>
    </section>
  );
}

// Format Row Component
function FormatRow({
  format,
  state,
  onDownload,
  onSave,
}: {
  format: VideoFormat;
  state: DownloadState | undefined;
  onDownload: () => void;
  onSave: () => void;
}) {
  const Icon = format.type === "video" ? FileVideo : FileAudio;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dark-border bg-dark-surface/50 px-4 py-3">
      <Icon size={16} className="text-dark-muted flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dark-text">{format.quality}</span>
          <span className="text-xs text-dark-muted">{format.container}</span>
          {format.size && <span className="text-xs text-dark-muted">• {format.size}</span>}
        </div>
        {state?.status === "downloading" && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-xs text-dark-muted mb-1">
              <span>{state.message}</span>
              <span>{Math.round(state.progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-dark-border overflow-hidden">
              <div
                className="h-full rounded-full bg-yt-red transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        )}
        {state?.status === "error" && (
          <p className="mt-1 text-xs text-red-400">{state.error}</p>
        )}
      </div>

      <div className="flex-shrink-0">
        {state?.status === "complete" ? (
          <button
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
          >
            <Save size={14} />
            Save File
          </button>
        ) : state?.status === "downloading" ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <Loader2 size={14} className="animate-spin text-yt-red" />
            <span className="text-xs text-dark-muted">{Math.round(state.progress)}%</span>
          </div>
        ) : (
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 rounded-lg bg-yt-red/10 px-3 py-1.5 text-xs font-medium text-yt-red hover:bg-yt-red/20 transition-colors"
          >
            <Download size={14} />
            Download
          </button>
        )}
      </div>
    </div>
  );
}
