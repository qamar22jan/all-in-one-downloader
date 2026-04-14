"""
YouTube + Instagram Downloader — Backend Server (yt-dlp)
========================================================
Downloads videos to server disk, then serves files to browser.

Supports:
- YouTube: videos, shorts, playlists
- Instagram: reels, posts, stories, IGTV, carousel

Requirements: Python 3.8+, yt-dlp, flask, flask-cors, ffmpeg

Run:
  pip install -r requirements.txt
  python app.py
"""

from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import yt_dlp
import subprocess
import uuid
import os
import json
import re
import shutil
import threading
import time
import logging
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# ═══════════════════════════════════════════════════════════════
# Version & Config
# ═══════════════════════════════════════════════════════════════
APP_VERSION = os.environ.get("APP_VERSION", "1.0.0")

# BASE_URL is used for download links and API responses
# Set this in Railway: https://your-railway-url.railway.app
# If not set, auto-detected from each request
BASE_URL = os.environ.get("BASE_URL", "").rstrip("/")

# R2 Storage (optional — saves server bandwidth)
from r2_storage import r2
from storj_storage import storj

app = Flask(__name__)
CORS(app)

# ═══════════════════════════════════════════════════════════════
# Admin Settings & Download Logs
# ═══════════════════════════════════════════════════════════════
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

# Storage selection: "local", "r2", "storj"
ACTIVE_STORAGE = os.environ.get("ACTIVE_STORAGE", "local")

# Maintenance mode — toggles via admin API
maintenance = {
    "global": False,
    "youtube": False,
    "instagram": False,
}

# Download logs — stored in memory (max 500 entries)
download_logs = []
MAX_LOGS = 500
_logs_lock = threading.Lock()


def add_download_log(entry: dict):
    """Add a download log entry (thread-safe)."""
    with _logs_lock:
        entry["id"] = uuid.uuid4().hex[:8]
        entry["timestamp"] = datetime.now(timezone.utc).isoformat()
        download_logs.insert(0, entry)
        # Keep only the latest MAX_LOGS entries
        if len(download_logs) > MAX_LOGS:
            del download_logs[MAX_LOGS:]


def get_active_storage():
    """Return the active storage singleton based on ACTIVE_STORAGE setting."""
    global ACTIVE_STORAGE
    active = ACTIVE_STORAGE.lower().strip()
    if active == "r2" and r2.enabled:
        return r2
    elif active == "storj" and storj.enabled:
        return storj
    return None  # local storage (serve from disk)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Download directory
DOWNLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Frontend directory (built by Docker Stage 1)
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


# ═══════════════════════════════════════════════════════════════
# BUG FIX #4 & #6: Auto-detect BASE_URL from request
# ═══════════════════════════════════════════════════════════════
def get_base_url():
    """Get BASE_URL — from env var or auto-detect from proxy headers/request.
    
    Priority:
    1. BASE_URL env var (manually set)
    2. X-Forwarded-Host + X-Forwarded-Proto (Railway, nginx, Cloudflare)
    3. Host header (reverse proxy)
    4. Flask request.host_url (direct access)
    5. Fallback: http://localhost:3001
    """
    if BASE_URL:
        return BASE_URL
    
    try:
        # Check proxy headers FIRST — Railway sets these
        forwarded_host = request.headers.get("X-Forwarded-Host")
        forwarded_proto = request.headers.get("X-Forwarded-Proto")
        host_header = request.headers.get("Host")
        
        if forwarded_host:
            # Railway / Cloudflare / nginx standard proxy headers
            proto = forwarded_proto or "https"
            host = forwarded_host
        elif host_header and not host_header.startswith("localhost") and not host_header.startswith("127.0.0.1"):
            # Host header from reverse proxy (not internal Docker network)
            proto = forwarded_proto or request.scheme
            host = host_header
        else:
            # Direct access — use Flask's built-in detection
            return request.host_url.rstrip("/")
        
        # Clean up host (remove port if it's the standard port for the protocol)
        if ":" in host and not host.startswith("["):
            hostname, port = host.rsplit(":", 1)
            if (proto == "https" and port == "443") or (proto == "http" and port == "80"):
                host = hostname
        
        return f"{proto}://{host}"
    except RuntimeError:
        # No request context (e.g., during tests)
        return "http://localhost:3001"


# ═══════════════════════════════════════════════════════════════
# FFmpeg Auto-Detection
# ═══════════════════════════════════════════════════════════════
FFMPEG_DIR = os.path.dirname(os.path.abspath(__file__))


def find_ffmpeg():
    """Find ffmpeg binary location."""
    # 1. Check FFMPEG_PATH env variable
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path:
        if os.path.isfile(env_path) and os.access(env_path, os.X_OK):
            return os.path.dirname(env_path)
        if os.path.isdir(env_path):
            return env_path

    # 2. Check server-python/ffmpeg/bin/
    ffmpeg_bin_dir = os.path.join(FFMPEG_DIR, "ffmpeg", "bin")
    if os.path.isdir(ffmpeg_bin_dir):
        ffmpeg_exe = os.path.join(ffmpeg_bin_dir, "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
        if os.path.isfile(ffmpeg_exe):
            logger.info(f"Found ffmpeg in local folder: {ffmpeg_bin_dir}")
            return ffmpeg_bin_dir

    # 3. Check server-python/ffmpeg/
    ffmpeg_flat_dir = os.path.join(FFMPEG_DIR, "ffmpeg")
    if os.path.isdir(ffmpeg_flat_dir):
        ffmpeg_exe = os.path.join(ffmpeg_flat_dir, "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
        if os.path.isfile(ffmpeg_exe):
            logger.info(f"Found ffmpeg in local folder: {ffmpeg_flat_dir}")
            return ffmpeg_flat_dir

    # 4. Check system PATH
    if shutil.which("ffmpeg"):
        logger.info("Found ffmpeg in system PATH")
        return None

    return None


FFMPEG_LOCATION = find_ffmpeg()


def get_ffmpeg_args():
    """Return yt-dlp --ffmpeg-location args if needed."""
    if FFMPEG_LOCATION:
        return ["--ffmpeg-location", FFMPEG_LOCATION]
    return []


# ═══════════════════════════════════════════════════════════════
# BUG FIX #5: Cookie Detection — Graceful headless fallback
# ═══════════════════════════════════════════════════════════════
_cookie_source = None  # None=unchecked, False=no cookies, str=browser name
_cookie_checked = False


def detect_cookie_source():
    """Try to find a browser with cookies. Returns None on headless servers."""
    global _cookie_source, _cookie_checked

    if _cookie_checked:
        return _cookie_source if _cookie_source else None

    _cookie_checked = True

    # On headless servers (Railway, Docker, etc.), skip browser cookie detection
    if os.environ.get("APP_ENV") == "production" or not os.environ.get("DISPLAY"):
        logger.info("Production/headless environment detected — skipping browser cookie detection")
        _cookie_source = False
        return None

    for browser in ["chrome", "edge", "brave", "firefox", "opera", "vivaldi"]:
        try:
            opts = {
                "cookiesfrombrowser": (browser,),
                "quiet": True,
                "no_warnings": True,
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.extract_info(
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    download=False,
                )
            _cookie_source = browser
            logger.info(f"Found browser cookies: {browser}")
            return browser
        except Exception as e:
            msg = str(e)[:120]
            logger.info(f"No cookies from {browser}: {msg}")
            continue

    _cookie_source = False
    logger.warning("No browser cookies found. Using iOS fallback.")
    return None


def get_cookie_args():
    """Get subprocess args for cookies."""
    browser = detect_cookie_source()
    if browser:
        return ["--cookies-from-browser", browser]
    return ["--extractor-args", "youtube:player_client=ios,web"]


# ═══════════════════════════════════════════════════════════════
# BUG FIX #1: format_filesize — was missing '>' operator
# ═══════════════════════════════════════════════════════════════
def format_filesize(size):
    if not size:
        return "Unknown"
    try:
        size = int(size)
    except (ValueError, TypeError):
        return "Unknown"
    if size > 1073741824:
        return f"~{size / 1073741824:.1f} GB"
    if size > 1048576:
        return f"~{size / 1048576:.0f} MB"
    if size > 1024:
        return f"~{size / 1024:.0f} KB"
    return f"~{size} B"


def format_duration(secs):
    if not secs:
        return ""
    secs = int(secs)
    m, s = divmod(secs, 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def format_views(views):
    if not views:
        return ""
    if views >= 1_000_000_000:
        return f"{views / 1_000_000_000:.1f}B views"
    if views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M views"
    if views >= 1_000:
        return f"{views / 1_000:.0f}K views"
    return f"{views} views"


def format_number(num):
    """Format a number with K/M/B suffixes."""
    if not num:
        return None
    if num >= 1_000_000_000:
        return f"{num / 1_000_000_000:.1f}B"
    if num >= 1_000_000:
        return f"{num / 1_000_000:.1f}M"
    if num >= 1_000:
        return f"{num / 1_000:.0f}K"
    return str(num)


def sse_event(data_dict):
    """Format a dict as an SSE event string."""
    return f"data: {json.dumps(data_dict)}\n\n"


# ═══════════════════════════════════════════════════════════════
# Root Route
# ═══════════════════════════════════════════════════════════════
@app.route("/")
def index():
    """Serve frontend index.html if it exists, otherwise return API status."""
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(FRONTEND_DIR, "index.html")

    ffmpeg_ok = FFMPEG_LOCATION is not None or shutil.which("ffmpeg") is not None
    browser = detect_cookie_source()
    r2_status = r2.test_connection()
    return jsonify({
        "service": "YouTube + Instagram Downloader",
        "backend": "yt-dlp + Flask",
        "status": "running",
        "message": "Frontend not found. Run: npm run build",
        "appVersion": APP_VERSION,
        "ffmpeg": ffmpeg_ok,
        "r2": r2_status,
    })


@app.route("/api/version")
def version():
    return jsonify({
        "appVersion": APP_VERSION,
        "ytDlpVersion": yt_dlp.version.__version__,
        "baseUrl": get_base_url(),
        "r2Enabled": r2.enabled,
        "environment": os.environ.get("APP_ENV", "development"),
    })


# ═══════════════════════════════════════════════════════════════
# BUG FIX #2: Route paths — removed trailing spaces, added params
# ═══════════════════════════════════════════════════════════════
@app.route("/downloads/<filename>")
def serve_download(filename):
    filepath = os.path.join(DOWNLOADS_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({"error": "File not found or cleaned up"}), 404
    return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)


# ═══════════════════════════════════════════════════════════════
# Health
# ═══════════════════════════════════════════════════════════════
@app.route("/api/health")
def health():
    ffmpeg_ok = FFMPEG_LOCATION is not None or shutil.which("ffmpeg") is not None
    browser = detect_cookie_source()
    return jsonify({
        "status": "ok",
        "service": "yt-dlp",
        "version": yt_dlp.version.__version__,
        "ffmpeg": ffmpeg_ok,
        "ffmpegLocation": FFMPEG_LOCATION or ("system PATH" if shutil.which("ffmpeg") else "not found"),
        "cookies": browser or "none",
        "baseUrl": get_base_url(),
        "storage": ACTIVE_STORAGE,
        "r2": r2.test_connection() if r2.enabled else {"enabled": False},
        "storj": storj.test_connection() if storj.enabled else {"enabled": False},
    })


# ═══════════════════════════════════════════════════════════════
# ADMIN API — Settings, Storage, Maintenance, Logs
# ═══════════════════════════════════════════════════════════════

def check_admin_auth():
    """Check admin password from header or query param."""
    auth = request.headers.get("X-Admin-Password", "") or request.args.get("admin_password", "")
    return auth == ADMIN_PASSWORD


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    """Verify admin password."""
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")
    if password == ADMIN_PASSWORD:
        return jsonify({"success": True, "message": "Authenticated"})
    return jsonify({"success": False, "error": "Invalid password"}), 401


@app.route("/api/admin/settings")
def admin_get_settings():
    """Get all admin settings (requires auth)."""
    if not check_admin_auth():
        return jsonify({"error": "Unauthorized"}), 401

    ffmpeg_ok = FFMPEG_LOCATION is not None or shutil.which("ffmpeg") is not None

    return jsonify({
        "backend": {
            "baseUrl": get_base_url(),
            "version": APP_VERSION,
            "environment": os.environ.get("APP_ENV", "development"),
            "ffmpeg": ffmpeg_ok,
            "ffmpegLocation": FFMPEG_LOCATION or ("system PATH" if shutil.which("ffmpeg") else "not found"),
            "ytDlpVersion": yt_dlp.version.__version__,
            "port": os.environ.get("PORT", "3001"),
        },
        "storage": {
            "active": ACTIVE_STORAGE,
            "r2": r2.get_config() if hasattr(r2, "get_config") else {"enabled": r2.enabled},
            "storj": storj.get_config(),
        },
        "maintenance": maintenance,
        "limits": {
            "maxLogs": MAX_LOGS,
            "currentLogs": len(download_logs),
            "cleanupInterval": "30 minutes",
            "fileRetention": "1 hour",
        },
    })


@app.route("/api/admin/settings", methods=["POST"])
def admin_update_settings():
    """Update admin settings (requires auth)."""
    global ACTIVE_STORAGE, maintenance

    if not check_admin_auth():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    changes = []

    # Update storage selection
    if "active_storage" in data:
        new_storage = data["active_storage"]
        if new_storage in ("local", "r2", "storj"):
            ACTIVE_STORAGE = new_storage
            changes.append(f"Storage → {new_storage}")

    # Update maintenance modes
    if "maintenance" in data:
        for key in ("global", "youtube", "instagram"):
            if key in data["maintenance"]:
                maintenance[key] = bool(data["maintenance"][key])
                changes.append(f"Maintenance {key} → {maintenance[key]}")

    # Update R2 config
    if "r2_config" in data:
        r2_cfg = data["r2_config"]
        if hasattr(r2, "update_config"):
            r2.update_config(r2_cfg)
        changes.append("R2 config updated")

    # Update Storj config
    if "storj_config" in data:
        storj_cfg = data["storj_config"]
        storj.update_config(storj_cfg)
        changes.append("Storj config updated")

    logger.info(f"[Admin] Settings updated: {', '.join(changes) if changes else 'no changes'}")
    return jsonify({"success": True, "changes": changes})


@app.route("/api/admin/storage/test", methods=["POST"])
def admin_test_storage():
    """Test storage connection (requires auth)."""
    if not check_admin_auth():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    storage_type = data.get("type", ACTIVE_STORAGE)

    # Get credentials from the form (for testing before saving)
    form_config = data.get("config", {})

    if storage_type == "r2":
        # Test R2 with provided or current credentials
        test_cfg = form_config if form_config else None
        return jsonify({"type": "r2", "result": r2.test_connection(test_cfg)})
    elif storage_type == "storj":
        # Test Storj with provided form credentials (not saved ones)
        test_cfg = form_config if form_config else None
        return jsonify({"type": "storj", "result": storj.test_connection(test_cfg)})
    else:
        # Test local storage
        test_file = os.path.join(DOWNLOADS_DIR, "__test__.tmp")
        try:
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
            disk_usage = shutil.disk_usage(DOWNLOADS_DIR)
            return jsonify({
                "type": "local",
                "result": {
                    "status": "ok",
                    "path": DOWNLOADS_DIR,
                    "diskTotal": f"{disk_usage.total / 1073741824:.1f} GB",
                    "diskUsed": f"{disk_usage.used / 1073741824:.1f} GB",
                    "diskFree": f"{disk_usage.free / 1073741824:.1f} GB",
                    "diskPercent": f"{(disk_usage.used / disk_usage.total) * 100:.1f}%",
                },
            })
        except Exception as e:
            return jsonify({"type": "local", "result": {"status": "error", "error": str(e)}})


@app.route("/api/admin/logs")
def admin_get_logs():
    """Get download logs (requires auth)."""
    if not check_admin_auth():
        return jsonify({"error": "Unauthorized"}), 401

    page = int(request.args.get("page", "1"))
    per_page = int(request.args.get("per_page", "50"))
    log_type = request.args.get("type", "")  # "youtube", "instagram", "success", "error"
    search = request.args.get("search", "")

    filtered = download_logs
    if log_type:
        filtered = [l for l in filtered if l.get("type") == log_type or l.get("status") == log_type]
    if search:
        search_lower = search.lower()
        filtered = [l for l in filtered if
                    search_lower in l.get("url", "").lower() or
                    search_lower in l.get("filename", "").lower() or
                    search_lower in l.get("title", "").lower()]

    total = len(filtered)
    start = (page - 1) * per_page
    end = start + per_page
    page_logs = filtered[start:end]

    return jsonify({
        "logs": page_logs,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    })


@app.route("/api/admin/logs/clear", methods=["POST"])
def admin_clear_logs():
    """Clear all download logs (requires auth)."""
    if not check_admin_auth():
        return jsonify({"error": "Unauthorized"}), 401

    with _logs_lock:
        count = len(download_logs)
        download_logs.clear()

    logger.info(f"[Admin] Cleared {count} download logs")
    return jsonify({"success": True, "cleared": count})


@app.route("/api/admin/downloads/cleanup", methods=["POST"])
def admin_cleanup_downloads():
    """Manually trigger cleanup of old download files (requires auth)."""
    if not check_admin_auth():
        return jsonify({"error": "Unauthorized"}), 401

    cleaned = []
    try:
        now = time.time()
        for f in os.listdir(DOWNLOADS_DIR):
            filepath = os.path.join(DOWNLOADS_DIR, f)
            if os.path.isfile(filepath) and now - os.path.getmtime(filepath) > 3600:
                os.remove(filepath)
                cleaned.append(f)
                logger.info(f"Cleaned up: {f}")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"success": True, "cleaned": cleaned, "count": len(cleaned)})


@app.route("/api/admin/stats")
def admin_stats():
    """Get download statistics (requires auth)."""
    if not check_admin_auth():
        return jsonify({"error": "Unauthorized"}), 401

    with _logs_lock:
        logs_copy = list(download_logs)

    total = len(logs_copy)
    youtube = sum(1 for l in logs_copy if l.get("type") == "youtube")
    instagram = sum(1 for l in logs_copy if l.get("type") == "instagram")
    success = sum(1 for l in logs_copy if l.get("status") == "success")
    errors = sum(1 for l in logs_copy if l.get("status") == "error")
    total_size = sum(l.get("size_bytes", 0) for l in logs_copy if l.get("status") == "success")

    # Files currently on disk
    files_on_disk = []
    try:
        for f in os.listdir(DOWNLOADS_DIR):
            fp = os.path.join(DOWNLOADS_DIR, f)
            if os.path.isfile(fp):
                files_on_disk.append({
                    "name": f,
                    "size": os.path.getsize(fp),
                    "modified": os.path.getmtime(fp),
                })
    except Exception:
        pass

    disk_usage = shutil.disk_usage(DOWNLOADS_DIR)

    return jsonify({
        "downloads": {
            "total": total,
            "youtube": youtube,
            "instagram": instagram,
            "success": success,
            "errors": errors,
            "successRate": f"{(success / total * 100):.1f}%" if total > 0 else "N/A",
            "totalSize": format_filesize(total_size),
            "totalSizeBytes": total_size,
        },
        "disk": {
            "total": f"{disk_usage.total / 1073741824:.1f} GB",
            "used": f"{disk_usage.used / 1073741824:.1f} GB",
            "free": f"{disk_usage.free / 1073741824:.1f} GB",
            "percent": f"{(disk_usage.used / disk_usage.total) * 100:.1f}%",
            "filesOnDisk": len(files_on_disk),
        },
        "storage": {
            "active": ACTIVE_STORAGE,
            "r2": r2.enabled,
            "storj": storj.enabled,
        },
        "maintenance": maintenance,
    })


# ═══════════════════════════════════════════════════════════════
# YOUTUBE — Video Info
# ═══════════════════════════════════════════════════════════════
@app.route("/api/info")
def get_info():
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "URL is required"}), 400
    if not re.match(r"^(https?://)?(www\.)?(youtube\.com|youtu\.be)/.+", url):
        return jsonify({"error": "Please provide a valid YouTube URL"}), 400

    errors = []

    # Method 1: Browser cookies
    browser = detect_cookie_source()
    if browser:
        try:
            start = time.time()
            opts = {
                "cookiesfrombrowser": (browser,),
                "quiet": True,
                "no_warnings": True,
                "no_color": True,
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                raw = ydl.extract_info(url, download=False)
            if raw:
                elapsed = round(time.time() - start, 1)
                logger.info(f"Info fetched (cookies:{browser}) for '{raw.get('title', '?')}' in {elapsed}s")
                return build_info_response(raw)
        except Exception as e:
            logger.warning(f"Info failed with cookies ({browser}): {e}")
            errors.append(f"cookies({browser}): {str(e)[:100]}")

    # Method 2: iOS player client
    try:
        start = time.time()
        opts = {
            "extractor_args": {"youtube": {"player_client": ["ios", "web"]}},
            "quiet": True,
            "no_warnings": True,
            "no_color": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            raw = ydl.extract_info(url, download=False)
        if raw:
            elapsed = round(time.time() - start, 1)
            logger.info(f"Info fetched (ios) for '{raw.get('title', '?')}' in {elapsed}s")
            return build_info_response(raw)
    except Exception as e:
        logger.warning(f"Info failed with ios: {e}")
        errors.append(f"ios: {str(e)[:100]}")

    # Method 3: Default
    try:
        start = time.time()
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "no_color": True}) as ydl:
            raw = ydl.extract_info(url, download=False)
        if raw:
            elapsed = round(time.time() - start, 1)
            logger.info(f"Info fetched (default) for '{raw.get('title', '?')}' in {elapsed}s")
            return build_info_response(raw)
    except Exception as e:
        logger.error(f"Info failed (default): {e}")
        errors.append(f"default: {str(e)[:100]}")

    return jsonify({
        "error": "Failed to fetch video info after trying all methods.",
        "details": errors,
        "hint": "Make sure yt-dlp is up to date: pip install -U yt-dlp",
    }), 500


def build_info_response(raw):
    """Build the YouTube API response from raw yt-dlp info."""
    formats = []
    seen = set()

    for f in raw.get("formats", []):
        height = f.get("height")
        ext = f.get("ext", "")
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")
        has_video = vcodec != "none"
        has_audio = acodec != "none"
        format_id = f.get("format_id", "")
        format_note = f.get("format_note", "")

        if not has_video and not has_audio:
            continue
        if "storyboard" in (format_note or "").lower():
            continue

        if has_video:
            quality = f"{height}p" if height else (format_note or "Video")
        else:
            abr = f.get("abr")
            quality = f"{int(abr)}kbps" if abr else "Audio"

        dedup_key = f"{quality}-{'video' if has_video else 'audio'}"
        if dedup_key in seen:
            existing_idx = None
            for i, existing in enumerate(formats):
                if f"{existing['quality']}-{existing['type']}" == dedup_key:
                    existing_idx = i
                    break
            if existing_idx is not None:
                existing = formats[existing_idx]
                new_tbr = f.get("tbr") or 0
                old_tbr = existing.get("bitrate", 0) / 1000
                if (has_video and has_audio and not existing.get("isMuxed")) or new_tbr > old_tbr:
                    formats[existing_idx] = build_format_obj(
                        f, raw, format_id, quality, ext,
                        has_video, has_audio, vcodec, acodec, height
                    )
            continue

        seen.add(dedup_key)
        formats.append(build_format_obj(
            f, raw, format_id, quality, ext,
            has_video, has_audio, vcodec, acodec, height
        ))

    formats.sort(key=lambda x: (
        0 if x["type"] == "video" else 1,
        0 if x.get("isMuxed") else 1,
        -(x.get("bitrate") or 0),
    ))

    thumbnail = raw.get("thumbnail", "")
    if not thumbnail and raw.get("thumbnails"):
        thumbnail = raw["thumbnails"][-1].get("url", "")

    return jsonify({
        "title": raw.get("title", "Unknown Title"),
        "author": raw.get("uploader", "") or raw.get("channel", ""),
        "thumbnail": thumbnail,
        "duration": format_duration(raw.get("duration", 0)),
        "durationSeconds": raw.get("duration", 0) or 0,
        "views": format_views(raw.get("view_count")),
        "videoId": raw.get("id", ""),
        "description": (raw.get("description", "") or "")[:200],
        "formats": formats,
    })


def build_format_obj(f, raw, format_id, quality, ext, has_video, has_audio, vcodec, acodec, height):
    """Build a YouTube format object for the API response."""
    filesize = f.get("filesize")
    tbr = f.get("tbr")
    duration = raw.get("duration", 0) or 0

    if filesize and filesize > 0:
        size = format_filesize(filesize)
    elif tbr and duration:
        estimated = (tbr * 1000 * duration) / 8
        size = format_filesize(estimated)
    else:
        size = "Unknown"

    codec = ""
    if has_video:
        codec = vcodec.split(".")[0]
    elif has_audio:
        codec = acodec.split(".")[0]

    if has_video:
        fmt_desc = f"{'MP4' if ext == 'mp4' else ext.upper()} {quality}"
    else:
        fmt_desc = f"{'M4A' if ext in ('m4a', 'mp4') else ext.upper()} Audio"

    return {
        "itag": format_id,
        "quality": quality,
        "height": height,
        "format": fmt_desc,
        "container": ext,
        "size": size,
        "type": "video" if has_video else "audio",
        "hasVideo": has_video,
        "hasAudio": has_audio,
        "isMuxed": has_video and has_audio,
        "codec": codec,
        "bitrate": int((tbr or 0) * 1000),
        "fps": f.get("fps"),
    }


# ═══════════════════════════════════════════════════════════════
# YOUTUBE — Download (SSE)
# ═══════════════════════════════════════════════════════════════
@app.route("/api/download")
def download():
    """
    Downloads YouTube video to server disk using yt-dlp.
    Streams progress via Server-Sent Events (SSE).
    """
    # Maintenance mode check
    if maintenance.get("global") or maintenance.get("youtube"):
        return jsonify({
            "error": "YouTube downloader is temporarily under maintenance. Please try again later.",
            "maintenance": True,
        }), 503

    url = request.args.get("url")
    quality = request.args.get("quality", "best")
    mode = request.args.get("mode", "video")

    if not url:
        return jsonify({"error": "URL is required"}), 400

    task_id = uuid.uuid4().hex[:10]

    def generate():
        download_methods = []
        browser = detect_cookie_source()
        if browser:
            download_methods.append({
                "name": f"cookies ({browser})",
                "extra_args": ["--cookies-from-browser", browser],
            })
        download_methods.append({
            "name": "ios player client",
            "extra_args": ["--extractor-args", "youtube:player_client=ios,web"],
        })
        download_methods.append({
            "name": "default",
            "extra_args": ["--retries", "10", "--fragment-retries", "10"],
        })

        last_error = "Unknown error"

        for method_idx, method in enumerate(download_methods):
            method_name = method["name"]
            extra_args = method["extra_args"]

            logger.info(f"[YouTube] Trying method [{method_idx+1}/{len(download_methods)}]: {method_name}")

            output_template = os.path.join(DOWNLOADS_DIR, f"{task_id}_%(title).50s.%(ext)s")

            cmd = [
                sys.executable, "-m", "yt_dlp",
                "--newline", "--no-warnings", "--no-part",
                "--retries", "5", "--fragment-retries", "5",
            ]
            cmd.extend(get_ffmpeg_args())
            cmd.extend(extra_args)

            if mode == "audio":
                cmd.extend(["-f", "ba/b"])
                cmd.extend(["-x", "--audio-format", "mp3", "--audio-quality", "0"])
            else:
                height_match = re.match(r"(\d+)", quality)
                if height_match:
                    height = int(height_match.group(1))
                    fmt = f"bv*[height<={height}]+ba/b[height<={height}]/bv+ba/b"
                    cmd.extend(["-f", fmt])
                    cmd.extend(["--merge-output-format", "mp4"])
                else:
                    cmd.extend(["-f", "bv*+ba/b"])
                    cmd.extend(["--merge-output-format", "mp4"])

            cmd.extend(["-o", output_template, url])

            yield sse_event({
                "status": "processing",
                "message": f"Connecting via {method_name}...",
                "progress": 1,
            })

            try:
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
            except Exception as e:
                last_error = str(e)
                logger.error(f"Failed to start yt-dlp: {e}")
                continue

            downloaded_file = None

            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                logger.info(f"[yt-dlp] {line}")

                if "[download] Destination:" in line:
                    yield sse_event({
                        "status": "processing",
                        "message": "Resolving download...",
                        "progress": 5,
                    })
                elif "[download]" in line and "%" in line:
                    pct_match = re.search(r"(\d+\.?\d*)%", line)
                    progress = float(pct_match.group(1)) if pct_match else -1
                    yield sse_event({
                        "status": "downloading",
                        "message": line,
                        "progress": min(progress, 99),
                    })
                elif "has already been downloaded" in line:
                    yield sse_event({
                        "status": "downloading",
                        "message": "Reusing cached download...",
                        "progress": 90,
                    })
                elif "Merging" in line or "Remuxing" in line:
                    yield sse_event({
                        "status": "merging",
                        "message": "Merging audio + video...",
                        "progress": 95,
                    })

            process.wait()

            if process.returncode == 0:
                # Find the downloaded file
                for f in os.listdir(DOWNLOADS_DIR):
                    if f.startswith(task_id) and not f.endswith(".part"):
                        downloaded_file = f
                        break

                if downloaded_file:
                    file_size = os.path.getsize(os.path.join(DOWNLOADS_DIR, downloaded_file))
                    size_str = format_filesize(file_size)
                    filepath = os.path.join(DOWNLOADS_DIR, downloaded_file)

                    logger.info(f"Download complete: {downloaded_file} ({size_str}) via {method_name}")

                    # Use get_base_url() for auto-detection
                    base = get_base_url()
                    download_url = f"{base}/downloads/{downloaded_file}"

                    # Upload to active cloud storage
                    cloud = get_active_storage()
                    if cloud:
                        yield sse_event({
                            "status": "uploading",
                            "message": f"Uploading to {ACTIVE_STORAGE}...",
                            "progress": 98,
                        })
                        cloud_result = cloud.upload_file(filepath)
                        if "url" in cloud_result:
                            download_url = cloud_result["url"]
                            try:
                                os.remove(filepath)
                            except Exception:
                                pass
                        logger.info(f"[YouTube] {ACTIVE_STORAGE} uploaded: {download_url}")

                    # Log the download
                    add_download_log({
                        "type": "youtube",
                        "status": "success",
                        "url": url,
                        "title": downloaded_file,
                        "filename": downloaded_file,
                        "download_url": download_url,
                        "size_bytes": file_size,
                        "size_formatted": size_str,
                        "quality": quality,
                        "mode": mode,
                        "method": method_name,
                    })

                    yield sse_event({
                        "status": "complete",
                        "filename": downloaded_file,
                        "downloadUrl": download_url,
                        "size": file_size,
                        "sizeFormatted": size_str,
                        "progress": 100,
                        "method": method_name,
                    })
                    return
                else:
                    last_error = "Download succeeded but file not found on disk"
                    logger.error(last_error)
                    continue
            else:
                last_error = f"yt-dlp exited with code {process.returncode}"
                logger.error(f"Method {method_name}: {last_error}")
                continue

        logger.error(f"All download methods failed. Last error: {last_error}")
        add_download_log({
            "type": "youtube",
            "status": "error",
            "url": url,
            "error": last_error[:200],
            "quality": quality,
            "mode": mode,
        })
        yield sse_event({
            "status": "error",
            "message": f"Download failed after trying all methods. Last error: {last_error}",
            "progress": 0,
        })

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ═══════════════════════════════════════════════════════════════
# INSTAGRAM — Thumbnail Proxy
# ═══════════════════════════════════════════════════════════════
@app.route("/api/instagram/proxy-thumbnail")
def instagram_proxy_thumbnail():
    """Proxy Instagram thumbnail URLs to bypass CORS restrictions."""
    thumb_url = request.args.get("url")
    if not thumb_url:
        return jsonify({"error": "url parameter required"}), 400

    allowed_hosts = [
        "scontent.cdninstagram.com",
        "scontent.xx.fbcdn.net",
        "instagram.fcok1-1.fna.fbcdn.net",
        "fbcdn.net",
    ]
    parsed = urllib.parse.urlparse(thumb_url)
    host_allowed = False
    if parsed.hostname:
        for h in allowed_hosts:
            if parsed.hostname.endswith(h) or h in parsed.hostname:
                host_allowed = True
                break
        if "fbcdn.net" in parsed.hostname or "cdninstagram.com" in parsed.hostname:
            host_allowed = True

    if not host_allowed:
        return jsonify({"error": "Only Instagram CDN URLs are allowed"}), 400

    try:
        req = urllib.request.Request(thumb_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            return Response(data, content_type=content_type, headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
            })
    except Exception as e:
        logger.warning(f"[Instagram] Thumbnail proxy failed: {e}")
        return jsonify({"error": "Failed to fetch thumbnail"}), 500


# ═══════════════════════════════════════════════════════════════
# INSTAGRAM — Media Info
# ═══════════════════════════════════════════════════════════════
@app.route("/api/instagram/info")
def instagram_info():
    """
    Fetch Instagram media info using yt-dlp.
    Supports: reels, posts (image/video/carousel), stories, IGTV
    """
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "URL is required"}), 400

    ig_patterns = [
        r"instagram\.com/p/",
        r"instagram\.com/reel/",
        r"instagram\.com/reels/",
        r"instagram\.com/tv/",
        r"instagram\.com/stories/",
    ]
    if not any(re.search(p, url) for p in ig_patterns):
        return jsonify({"error": "Please provide a valid Instagram URL (reel, post, story, or IGTV)"}), 400

    errors = []

    methods = []
    browser = detect_cookie_source()
    if browser:
        methods.append({
            "name": f"cookies ({browser})",
            "cookie_args": {"cookiesfrombrowser": (browser,)},
        })
    methods.append({
        "name": "no cookies",
        "cookie_args": {},
    })

    for method in methods:
        try:
            start = time.time()
            opts = {
                "quiet": True,
                "no_warnings": True,
                "no_color": True,
                "extract_flat": False,
                "extractor_args": {"instagram": {"media_types": ["video", "image", "story"]}},
                **method["cookie_args"],
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                raw = ydl.extract_info(url, download=False)
            if raw:
                elapsed = round(time.time() - start, 1)
                logger.info(f"[Instagram] Info fetched via {method['name']} in {elapsed}s")
                return build_instagram_info_response(raw, url)
        except Exception as e:
            logger.warning(f"[Instagram] Info failed via {method['name']}: {e}")
            errors.append(f"{method['name']}: {str(e)[:150]}")

    return jsonify({
        "error": "Failed to fetch Instagram media info.",
        "details": errors,
        "hint": "Instagram may require login cookies. Try: pip install -U yt-dlp",
    }), 500


def build_instagram_info_response(raw, url):
    """Build the Instagram API response from raw yt-dlp info."""
    # Detect media type from URL
    if re.search(r"instagram\.com/reel/", url) or re.search(r"instagram\.com/reels/", url):
        media_type = "reel"
    elif re.search(r"instagram\.com/stories/", url):
        media_type = "video"
    elif re.search(r"instagram\.com/tv/", url):
        media_type = "video"
    else:
        entries = raw.get("entries")
        if entries:
            entries = [e for e in entries if e is not None]
        if entries and len(entries) > 1:
            media_type = "carousel"
        elif entries and len(entries) == 1:
            e = entries[0]
            ext = e.get("ext", "")
            if ext in ("mp4", "mov", "webm") or e.get("vcodec", "none") != "none" or e.get("duration"):
                media_type = "video"
            else:
                media_type = "image"
        elif raw.get("ext") in ("mp4", "mov", "webm") or raw.get("vcodec", "none") != "none":
            media_type = "video"
        else:
            media_type = "image"

    # Build media list
    media_list = []
    entries = raw.get("entries")
    if entries:
        real_index = 0
        for entry in entries:
            if entry is None:
                continue
            media_item = _build_media_item(entry, real_index)
            if media_item:
                media_list.append(media_item)
            real_index += 1
    else:
        media_item = _build_media_item(raw, 0)
        if media_item:
            media_list.append(media_item)

    # Fallback: create entry from thumbnails
    if not media_list:
        thumbnail = raw.get("thumbnail", "") or ""
        if raw.get("thumbnails"):
            for t in reversed(raw["thumbnails"]):
                if isinstance(t, dict) and t.get("url"):
                    thumbnail = t["url"]
                    break
                elif isinstance(t, str):
                    thumbnail = t
                    break
        media_list.append({
            "url": thumbnail,
            "type": "image",
            "width": raw.get("width"),
            "height": raw.get("height"),
            "duration": None,
        })

    # Author info
    author = raw.get("uploader", "") or raw.get("channel", "") or raw.get("creator", "") or ""
    author_username = ""
    if raw.get("uploader_id"):
        author_username = str(raw.get("uploader_id", ""))
    elif raw.get("channel_id"):
        author_username = str(raw.get("channel_id", ""))
    elif raw.get("uploader_url"):
        uploader_url = raw.get("uploader_url", "")
        if uploader_url:
            author_username = uploader_url.rstrip("/").split("/")[-1]

    # Thumbnail — proxy through server to bypass CORS
    thumbnail = raw.get("thumbnail", "") or ""
    if not thumbnail and raw.get("thumbnails"):
        for t in reversed(raw["thumbnails"]):
            if isinstance(t, dict) and t.get("url"):
                thumbnail = t["url"]
                break
            elif isinstance(t, str):
                thumbnail = t
                break

    if thumbnail:
        thumbnail = f"/api/instagram/proxy-thumbnail?url={urllib.parse.quote(thumbnail, safe='')}"

    # Duration
    duration = None
    if raw.get("duration"):
        duration = format_duration(raw.get("duration"))

    # Likes
    likes = None
    if raw.get("like_count"):
        likes = format_number(raw.get("like_count"))

    # Title / description
    title = raw.get("title", "") or raw.get("description", "") or ""
    if not title:
        title = f"Instagram {media_type.capitalize()} by {author}" if author else f"Instagram {media_type.capitalize()}"
    description = raw.get("description", "") or ""
    if description and len(description) > 300:
        description = description[:300] + "..."

    author_pic = None

    return jsonify({
        "title": title,
        "description": description,
        "author": author,
        "authorUsername": author_username,
        "authorProfilePic": author_pic,
        "thumbnail": thumbnail,
        "mediaCount": len(media_list),
        "mediaType": media_type,
        "duration": duration,
        "likes": likes,
        "media": media_list,
    })


def _build_media_item(entry, index):
    """Build a single media item from a yt-dlp entry."""
    if not entry:
        return None

    ext = entry.get("ext", "")
    vcodec = entry.get("vcodec", "none")

    if vcodec != "none" or ext in ("mp4", "mov", "webm", "mkv"):
        media_type = "video"
    elif ext in ("jpg", "jpeg", "png", "webp", "gif"):
        media_type = "image"
    elif entry.get("duration"):
        media_type = "video"
    else:
        media_type = "image"

    media_url = entry.get("url", "")

    if not media_url or "blob:" in media_url:
        requested = entry.get("requested_downloads", [])
        if requested:
            for rd in requested:
                if rd.get("url"):
                    media_url = rd["url"]
                    break
                elif rd.get("filepath"):
                    media_url = rd["filepath"]
                    break

    if not media_url or "blob:" in media_url:
        formats = entry.get("formats", [])
        if formats:
            best = formats[-1]
            media_url = best.get("url", "")

    if (not media_url or "blob:" in media_url) and media_type == "image":
        thumbnail = entry.get("thumbnail", "")
        if thumbnail:
            media_url = thumbnail

    if not media_url or "blob:" in media_url:
        thumbnail = entry.get("thumbnail", "")
        if thumbnail:
            media_url = thumbnail
            media_type = "image"

    duration = None
    if entry.get("duration"):
        duration = format_duration(entry.get("duration"))

    return {
        "url": media_url,
        "type": media_type,
        "width": entry.get("width"),
        "height": entry.get("height"),
        "duration": duration,
    }


# ═══════════════════════════════════════════════════════════════
# INSTAGRAM — Download (SSE)
# ═══════════════════════════════════════════════════════════════
@app.route("/api/instagram/download")
def instagram_download():
    """
    Downloads Instagram media to server disk using yt-dlp.
    Streams progress via Server-Sent Events (SSE).
    """
    # Maintenance mode check
    if maintenance.get("global") or maintenance.get("instagram"):
        return jsonify({
            "error": "Instagram downloader is temporarily under maintenance. Please try again later.",
            "maintenance": True,
        }), 503

    url = request.args.get("url")
    media_index = int(request.args.get("index", "0"))

    if not url:
        return jsonify({"error": "URL is required"}), 400

    task_id = uuid.uuid4().hex[:10]

    def generate():
        methods = []
        browser = detect_cookie_source()
        if browser:
            methods.append({
                "name": f"cookies ({browser})",
                "extra_args": ["--cookies-from-browser", browser],
            })
        methods.append({
            "name": "no cookies (direct)",
            "extra_args": [],
        })

        last_error = "Unknown error"

        for method_idx, method in enumerate(methods):
            method_name = method["name"]
            extra_args = method["extra_args"]

            logger.info(f"[Instagram] Trying method [{method_idx+1}/{len(methods)}]: {method_name}")

            output_template = os.path.join(DOWNLOADS_DIR, f"{task_id}_%(title).50s.%(ext)s")

            cmd = [
                sys.executable, "-m", "yt_dlp",
                "--newline", "--no-warnings", "--no-part",
                "--retries", "3", "--fragment-retries", "3",
            ]
            cmd.extend(get_ffmpeg_args())
            cmd.extend(extra_args)

            if media_index > 0:
                cmd.extend(["--playlist-items", str(media_index + 1)])

            cmd.extend(["-f", "bv*+ba/b"])
            cmd.extend(["--merge-output-format", "mp4"])
            cmd.extend(["-o", output_template, url])

            yield sse_event({
                "status": "processing",
                "message": f"Connecting via {method_name}...",
                "progress": 1,
            })

            try:
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
            except Exception as e:
                last_error = str(e)
                logger.error(f"[Instagram] Failed to start yt-dlp: {e}")
                continue

            error_lines = []
            should_retry = False

            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                logger.info(f"[ig-dlp] {line}")

                if "403" in line and "forbidden" in line.lower():
                    error_lines.append(line)
                    should_retry = True
                    process.terminate()
                    process.wait()
                    break
                if "login" in line.lower() and ("required" in line.lower() or "age" in line.lower()):
                    error_lines.append(line)
                    should_retry = True
                    process.terminate()
                    process.wait()
                    break

                pct_match = re.search(r"(\d+\.?\d*)%", line)
                progress = float(pct_match.group(1)) if pct_match else -1

                if "[download]" in line and "%" in line:
                    yield sse_event({
                        "status": "downloading",
                        "message": line,
                        "progress": min(progress, 99),
                    })
                elif "has already been downloaded" in line:
                    yield sse_event({
                        "status": "downloading",
                        "message": "Reusing cached download...",
                        "progress": 90,
                    })
                elif "[download] Destination:" in line:
                    yield sse_event({
                        "status": "processing",
                        "message": "Downloading media...",
                        "progress": 5,
                    })
                elif "Merging" in line or "Remuxing" in line:
                    yield sse_event({
                        "status": "merging",
                        "message": "Processing media...",
                        "progress": 95,
                    })
                elif "[instagram]" in line:
                    yield sse_event({
                        "status": "processing",
                        "message": line.replace("[instagram] ", ""),
                        "progress": 2,
                    })
                elif "[info]" in line:
                    yield sse_event({
                        "status": "processing",
                        "message": line,
                        "progress": 3,
                    })
                elif "Downloading item" in line or "Downloading " in line:
                    yield sse_event({
                        "status": "downloading",
                        "message": "Downloading from Instagram...",
                        "progress": 10,
                    })

            if not should_retry:
                process.wait()

            if should_retry:
                last_error = "; ".join(error_lines[-2:]) if error_lines else "Access denied"
                logger.warning(f"[Instagram] Method {method_name} failed: {last_error}. Trying next...")
                yield sse_event({
                    "status": "processing",
                    "message": "Method failed, trying next approach...",
                    "progress": 2,
                })
                continue

            if process.returncode == 0:
                downloaded_files = []
                for f in os.listdir(DOWNLOADS_DIR):
                    if f.startswith(task_id) and not f.endswith(".part"):
                        filepath = os.path.join(DOWNLOADS_DIR, f)
                        if os.path.getsize(filepath) > 0:
                            downloaded_files.append(f)

                if downloaded_files:
                    downloaded_file = downloaded_files[0]
                    file_size = os.path.getsize(os.path.join(DOWNLOADS_DIR, downloaded_file))
                    size_str = format_filesize(file_size)
                    filepath = os.path.join(DOWNLOADS_DIR, downloaded_file)

                    logger.info(f"[Instagram] Download complete: {downloaded_file} ({size_str}) via {method_name}")

                    # BUG FIX: Use get_base_url() for auto-detection
                    base = get_base_url()
                    download_url = f"{base}/downloads/{downloaded_file}"

                    # Upload to active cloud storage
                    cloud = get_active_storage()
                    if cloud:
                        yield sse_event({
                            "status": "uploading",
                            "message": f"Uploading to {ACTIVE_STORAGE}...",
                            "progress": 98,
                        })
                        cloud_result = cloud.upload_file(filepath)
                        if "url" in cloud_result:
                            download_url = cloud_result["url"]
                            try:
                                os.remove(filepath)
                            except Exception:
                                pass
                        logger.info(f"[Instagram] {ACTIVE_STORAGE} uploaded: {download_url}")

                    # Log the download
                    add_download_log({
                        "type": "instagram",
                        "status": "success",
                        "url": url,
                        "title": downloaded_file,
                        "filename": downloaded_file,
                        "download_url": download_url,
                        "size_bytes": file_size,
                        "size_formatted": size_str,
                        "media_index": media_index,
                        "method": method_name,
                    })

                    yield sse_event({
                        "status": "complete",
                        "filename": downloaded_file,
                        "downloadUrl": download_url,
                        "size": file_size,
                        "sizeFormatted": size_str,
                        "progress": 100,
                        "method": method_name,
                    })
                    return
                else:
                    last_error = "Download succeeded but file not found on disk"
                    logger.error(f"[Instagram] {last_error}")
                    continue
            else:
                last_error = f"yt-dlp exited with code {process.returncode}"
                logger.error(f"[Instagram] Method {method_name}: {last_error}")
                continue

        logger.error(f"[Instagram] All download methods failed. Last error: {last_error}")
        add_download_log({
            "type": "instagram",
            "status": "error",
            "url": url,
            "error": last_error[:200],
            "media_index": media_index,
        })
        yield sse_event({
            "status": "error",
            "message": f"Download failed: {last_error}",
            "progress": 0,
        })

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ═══════════════════════════════════════════════════════════════
# Auto-Cleanup
# ═══════════════════════════════════════════════════════════════
def cleanup_old_files():
    """Remove download files older than 1 hour."""
    while True:
        time.sleep(1800)
        try:
            now = time.time()
            for f in os.listdir(DOWNLOADS_DIR):
                filepath = os.path.join(DOWNLOADS_DIR, f)
                if os.path.isfile(filepath) and now - os.path.getmtime(filepath) > 3600:
                    os.remove(filepath)
                    logger.info(f"Cleaned up old file: {f}")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")


cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()


# ═══════════════════════════════════════════════════════════════
# BUG FIX #2: Serve Frontend — fixed route path
# ═══════════════════════════════════════════════════════════════
@app.route("/<path:path>")
def serve_static(path):
    """Serve static files (JS, CSS, etc.) from the frontend build."""
    if path and path != "index.html":
        file_path = os.path.join(FRONTEND_DIR, path)
        # Security: ensure the path is within FRONTEND_DIR
        if os.path.abspath(file_path).startswith(os.path.abspath(FRONTEND_DIR)):
            if os.path.isfile(file_path):
                return send_from_directory(FRONTEND_DIR, path)

    # Fallback: serve index.html for SPA routing
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(FRONTEND_DIR, "index.html")

    return jsonify({
        "error": "Frontend not found",
        "message": "Please rebuild the application",
    }), 404


# ═══════════════════════════════════════════════════════════════
# BUG FIX #3: Fixed garbled print in __main__
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    ffmpeg_ok = FFMPEG_LOCATION is not None or shutil.which("ffmpeg") is not None
    print()
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║  🎬 YouTube + Instagram Downloader Server       ║")
    print(f"  ║  Version: {APP_VERSION:<38s}║")
    print(f"  ║  FFmpeg:  {'✅ Found' if ffmpeg_ok else '❌ Not found':<38s}║")
    print(f"  ║  R2:      {'✅ Enabled' if r2.enabled else '⬚ Disabled':<38s}║")
    print("  ╚══════════════════════════════════════════════════╝")
    print()
    print("  Endpoints:")
    print("    GET /api/health              — Health check")
    print("    GET /api/info?url=<URL>      — YouTube video info")
    print("    GET /api/download?url=<URL>  — Download YouTube video")
    print("    GET /api/instagram/info?url=<URL>  — Instagram media info")
    print("    GET /api/instagram/download?url=<URL> — Download Instagram media")
    print("    GET /downloads/<filename>    — Serve downloaded file")
    print()

    if os.environ.get("APP_ENV") == "production":
        print("  🚀 Production mode — use gunicorn:")
        print(f"    gunicorn -w 4 -b 0.0.0.0:${{PORT:-3001}} app:app --timeout 300")
        app.run(host="0.0.0.0", port=3001, debug=False, threaded=True)
    else:
        print("  🔧 Development mode — Flask dev server")
        app.run(host="0.0.0.0", port=3001, debug=True, threaded=True)
