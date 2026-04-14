import { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  Save,
  AlertCircle,
  Wifi,
  WifiOff,
  Loader2,
  Settings,
  X,
  Image,
  Film,
  Layers,
  Heart,
  User,
  Clock,
  CheckCircle2,
  Info,
  Clipboard,
  Camera,
  Play,
} from "lucide-react";
import {
  type InstagramInfo,
  type InstagramMedia,
  type InstagramDownloadState,
  getBackendUrl,
  setBackendUrl,
  isValidInstagramUrl,
  getInstagramMediaType,
  checkBackendHealth,
  fetchInstagramInfo,
  startInstagramDownload,
  cleanProgressMessage,
  resolveBackendUrl,
} from "../services/instagramApi";

export default function InstagramDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mediaInfo, setMediaInfo] = useState<InstagramInfo | null>(null);
  const [downloadStates, setDownloadStates] = useState<Record<number, InstagramDownloadState>>({});
  const cleanupFns = useRef<Record<number, () => void>>({});

  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "disconnected">("checking");
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
  }, []);

  const saveConfig = useCallback(() => {
    if (configUrl.trim()) {
      setBackendUrl(configUrl.trim().replace(/\/+$/, ""));
      setShowConfig(false);
      checkBackend();
    }
  }, [configUrl, checkBackend]);

  const handleAnalyze = useCallback(async () => {
    setError("");
    setMediaInfo(null);
    setDownloadStates({});

    if (!url.trim()) {
      setError("Please paste an Instagram URL");
      return;
    }

    if (!isValidInstagramUrl(url.trim())) {
      setError("Please enter a valid Instagram URL (instagram.com/p/..., /reel/..., /stories/...)");
      return;
    }

    if (backendStatus !== "connected") {
      setError("Backend server is not connected. Please start the Python server first.");
      return;
    }

    setLoading(true);

    try {
      const info = await fetchInstagramInfo(url.trim());
      setMediaInfo(info);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch media information. Please try again.";
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
    (mediaIndex: number) => {
      if (downloadStates[mediaIndex]?.status === "downloading") return;

      setDownloadStates((prev) => ({
        ...prev,
        [mediaIndex]: { status: "downloading", progress: 0, message: "Connecting to server..." },
      }));

      const cleanup = startInstagramDownload(
        url.trim(),
        mediaIndex,
        (_status, message, progress) => {
          setDownloadStates((prev) => ({
            ...prev,
            [mediaIndex]: {
              status: "downloading",
              progress,
              message: cleanProgressMessage(message),
            },
          }));
        },
        (downloadUrl, filename, size, sizeFormatted) => {
          setDownloadStates((prev) => ({
            ...prev,
            [mediaIndex]: {
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
            [mediaIndex]: {
              status: "error",
              progress: 0,
              message: "",
              error: errMsg,
            },
          }));
        }
      );

      cleanupFns.current[mediaIndex] = cleanup;
    },
    [url, downloadStates]
  );

  const handleDownloadAll = useCallback(() => {
    if (!mediaInfo) return;
    mediaInfo.media.forEach((_, index) => {
      if (
        downloadStates[index]?.status !== "complete" &&
        downloadStates[index]?.status !== "downloading"
      ) {
        handleDownload(index);
      }
    });
  }, [mediaInfo, downloadStates, handleDownload]);

  const handleSaveFile = useCallback((downloadUrl: string) => {
    const resolvedUrl = resolveBackendUrl(downloadUrl);
    window.open(resolvedUrl, "_blank");
  }, []);

  const detectedType = url ? getInstagramMediaType(url) : null;

  const badges = [
    { icon: <Film size={14} />, label: "Reels & Videos" },
    { icon: <Image size={14} />, label: "Photos & Posts" },
    { icon: <Layers size={14} />, label: "Carousel" },
    { icon: <Camera size={14} />, label: "Stories" },
  ];

  return (
    <section className="hero-gradient-ig relative overflow-hidden py-10 sm:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Hero Header */}
        <div className="mb-8 text-center animate-fade-in-up">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-dark-border bg-dark-card/50 px-3 py-1.5 text-xs text-dark-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-ig-pink animate-pulse" />
            Instagram Downloader
          </div>
          <h1 className="mb-3 text-3xl font-extrabold text-dark-text sm:text-4xl lg:text-5xl">
            Instagram Downloader
          </h1>
          <p className="text-base text-dark-muted sm:text-lg">
            <span className="font-semibold text-dark-text">Download Reels, Posts & Stories</span>{" "}
            Free, Fast & HD Quality
          </p>
          <p className="mt-2 text-sm text-dark-muted/70 max-w-lg mx-auto">
            Paste an Instagram link — download Reels, Videos, Photos, and Carousel posts directly to your device using yt-dlp.
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
          </div>
        </div>

        {/* Setup Instructions */}
        {showSetup && backendStatus !== "connected" && (
          <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
            <h3 className="mb-2 text-sm font-semibold text-yellow-400">🚀 Quick Setup</h3>
            <p className="mb-3 text-xs text-dark-muted">
              This downloader uses your own Python server with yt-dlp which natively supports Instagram. Run:
            </p>
            <pre className="mb-3 rounded-lg bg-dark-bg p-3 text-xs text-dark-muted font-mono overflow-x-auto">
              $ cd server-python{"\n"}
              $ pip install -r requirements.txt{"\n"}
              $ python app.py
            </pre>
            <div className="text-xs text-dark-muted/70 space-y-1">
              <p>📷 Instagram Support: yt-dlp supports Reels, Posts, IGTV, and Stories (Stories requires login cookies).</p>
              <p>⚠️ Private accounts: Only public content can be downloaded. For private accounts, you need to provide login cookies.</p>
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
                className="flex-1 rounded-xl border border-dark-border bg-dark-surface px-4 py-2.5 text-sm text-dark-text placeholder:text-dark-muted/50 focus:outline-none focus:border-ig-pink/50"
              />
              <button
                onClick={saveConfig}
                className="rounded-xl bg-ig-pink px-4 py-2.5 text-sm font-medium text-white hover:bg-ig-pink/80 transition-colors"
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
        <div className="input-glow-ig mb-4 flex items-center gap-2 rounded-2xl border border-dark-border bg-dark-card px-4 py-3 transition-all animate-fade-in-up-delay-2">
          <Camera size={18} className="text-dark-muted flex-shrink-0" />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="Paste Instagram Reel / Post / Story URL here..."
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
            className="flex-shrink-0 rounded-xl bg-gradient-to-r from-ig-purple to-ig-pink px-5 py-2 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-pink-500/25 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Analyze"}
          </button>
        </div>

        {/* Detected type indicator */}
        {detectedType && !error && !mediaInfo && (
          <div className="mb-4 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ig-pink/10 px-3 py-1 text-xs text-ig-pink">
              Detected: {detectedType}
            </span>
          </div>
        )}

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
            <Loader2 size={32} className="animate-spin text-ig-pink" />
            <p className="text-sm font-medium text-dark-text">Fetching Instagram media information...</p>
            <p className="text-xs text-dark-muted">yt-dlp is extracting media data from Instagram</p>
          </div>
        )}

        {/* Media Info & Downloads */}
        {mediaInfo && !loading && (
          <div className="animate-fade-in-up space-y-4">
            {/* Media Preview Card */}
            <div className="rounded-2xl border border-dark-border bg-dark-card overflow-hidden">
              {/* Header with author info */}
              <div className="flex items-center gap-3 border-b border-dark-border p-4">
                <div className="flex-shrink-0">
                  {mediaInfo.authorProfilePic ? (
                    <img
                      src={resolveBackendUrl(mediaInfo.authorProfilePic)}
                      alt={mediaInfo.author}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ig-pink/20">
                      <User size={18} className="text-ig-pink" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-dark-text truncate">{mediaInfo.author}</p>
                  <p className="text-xs text-dark-muted">@{mediaInfo.authorUsername}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-ig-pink/10 px-2.5 py-0.5 text-xs font-medium text-ig-pink capitalize">
                    {mediaInfo.mediaType}
                  </span>
                  {mediaInfo.mediaCount > 1 && (
                    <span className="rounded-full bg-dark-surface px-2.5 py-0.5 text-xs text-dark-muted">
                      {mediaInfo.mediaCount} files
                    </span>
                  )}
                </div>
              </div>

              {/* Thumbnail & Description */}
              <div className="flex flex-col sm:flex-row gap-4 p-4">
                <div className="relative flex-shrink-0 w-full sm:w-56">
                  <img
                    src={resolveBackendUrl(mediaInfo.thumbnail)}
                    alt={mediaInfo.title || "Instagram media"}
                    className="w-full rounded-xl object-cover aspect-square"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect fill='%231a1a2e' width='200' height='200'/%3E%3Ctext x='100' y='105' text-anchor='middle' fill='%23666' font-size='14'%3ENo thumbnail%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  {mediaInfo.mediaType === "video" || mediaInfo.mediaType === "reel" ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50">
                        <Play size={20} className="text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  ) : null}
                  {mediaInfo.duration && (
                    <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 text-xs text-white">
                      <Clock size={10} />
                      {mediaInfo.duration}
                    </span>
                  )}
                </div>
                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <h3 className="mb-2 text-base font-semibold text-dark-text line-clamp-2">
                    {mediaInfo.title || mediaInfo.description || "Instagram Media"}
                  </h3>
                  {mediaInfo.description && mediaInfo.title !== mediaInfo.description && (
                    <p className="mb-3 text-sm text-dark-muted line-clamp-3">{mediaInfo.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-dark-muted">
                    {mediaInfo.likes && (
                      <span className="flex items-center gap-1">
                        <Heart size={12} className="text-ig-pink" />
                        {mediaInfo.likes}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Layers size={12} />
                      {mediaInfo.mediaCount} {mediaInfo.mediaCount === 1 ? "file" : "files"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span className="text-xs text-green-400">Ready to download</span>
                  </div>
                </div>
              </div>

              {/* Info Banner */}
              <div className="flex items-center gap-2 border-t border-dark-border bg-dark-surface/50 px-4 py-2.5">
                <Info size={14} className="text-dark-muted flex-shrink-0" />
                <span className="text-xs text-dark-muted">
                  {mediaInfo.mediaType === "carousel"
                    ? "This is a carousel post with multiple media files. Click Download All or download individual files."
                    : "Click Download → yt-dlp fetches the media → click Save File to save to your device."}
                </span>
              </div>

              {/* Download All Button */}
              {mediaInfo.mediaCount > 1 && (
                <div className="border-t border-dark-border p-4">
                  <button
                    onClick={handleDownloadAll}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ig-purple to-ig-pink px-4 py-2.5 text-sm font-semibold text-white hover:shadow-lg hover:shadow-pink-500/25 transition-all"
                  >
                    <Download size={16} />
                    Download All ({mediaInfo.mediaCount} files)
                  </button>
                </div>
              )}

              {/* Media Items */}
              <div className="border-t border-dark-border p-4 space-y-2 max-h-96 overflow-y-auto">
                {mediaInfo.media.map((media, index) => {
                  const state = downloadStates[index];
                  return (
                    <MediaItemRow
                      key={index}
                      media={media}
                      index={index}
                      state={state}
                      onDownload={() => handleDownload(index)}
                      onSave={() => state?.downloadUrl && handleSaveFile(state.downloadUrl)}
                    />
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-dark-border bg-dark-surface/30 px-4 py-3">
                <span className="text-xs text-dark-muted">Source: yt-dlp Backend</span>
                <button
                  onClick={() => {
                    setMediaInfo(null);
                    setDownloadStates({});
                    setError("");
                  }}
                  className="text-xs text-dark-muted hover:text-ig-pink transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-center text-xs text-dark-muted/50">
              Server-side download: Media is downloaded to your server first using yt-dlp, then served to your browser. Only public content is supported.
            </p>
          </div>
        )}

        {/* SEO text */}
        {!mediaInfo && !loading && (
          <div className="mt-8 text-center">
            <p className="text-xs text-dark-muted/40">
              Self-hosted Instagram downloader using Python + yt-dlp. Supports Instagram Reels, Posts, IGTV, and Stories.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// Media Item Row Component
function MediaItemRow({
  media,
  index,
  state,
  onDownload,
  onSave,
}: {
  media: InstagramMedia;
  index: number;
  state: InstagramDownloadState | undefined;
  onDownload: () => void;
  onSave: () => void;
}) {
  const Icon = media.type === "video" ? Film : Image;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dark-border bg-dark-surface/50 px-4 py-3">
      <Icon size={16} className="text-ig-pink flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dark-text capitalize">{media.type}</span>
          {media.width && media.height && (
            <span className="text-xs text-dark-muted">
              {media.width}×{media.height}
            </span>
          )}
          {media.duration && (
            <span className="text-xs text-dark-muted">• {media.duration}</span>
          )}
          <span className="text-xs text-dark-muted">• File {index + 1}</span>
        </div>
        {state?.status === "downloading" && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-xs text-dark-muted mb-1">
              <span>{state.message}</span>
              <span>{Math.round(state.progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-dark-border overflow-hidden">
              <div
                className="h-full rounded-full bg-ig-pink transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        )}
        {state?.status === "complete" && state.fileSizeFormatted && (
          <p className="mt-1 text-xs text-dark-muted">{state.fileSizeFormatted}</p>
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
            <Loader2 size={14} className="animate-spin text-ig-pink" />
            <span className="text-xs text-dark-muted">{Math.round(state.progress)}%</span>
          </div>
        ) : (
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 rounded-lg bg-ig-pink/10 px-3 py-1.5 text-xs font-medium text-ig-pink hover:bg-ig-pink/20 transition-colors"
          >
            <Download size={14} />
            Download
          </button>
        )}
      </div>
    </div>
  );
}
