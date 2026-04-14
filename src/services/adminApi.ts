// ============================================================
// Admin Panel — Frontend API Service
// ============================================================
// Connects to the admin API endpoints on the Python backend
// ============================================================

import { getBackendUrl } from "./youtubeApi";

// Get admin password from session storage
function getAdminPassword(): string {
  try {
    return sessionStorage.getItem("admin_password") || "";
  } catch {
    return "";
  }
}

export function setAdminPassword(password: string): void {
  try {
    sessionStorage.setItem("admin_password", password);
  } catch {}
}

export function clearAdminPassword(): void {
  try {
    sessionStorage.removeItem("admin_password");
  } catch {}
}

export function isAdminLoggedIn(): boolean {
  return getAdminPassword().length > 0;
}

// Auth headers for admin API calls
function adminHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Admin-Password": getAdminPassword(),
  };
}

// ── Types ──────────────────────────────────────────────────

export interface BackendInfo {
  baseUrl: string;
  version: string;
  environment: string;
  ffmpeg: boolean;
  ffmpegLocation: string;
  ytDlpVersion: string;
  port: string;
}

export interface StorageConfig {
  enabled: boolean;
  account_id?: string;
  endpoint?: string;
  access_key?: string;
  secret_key?: string;
  bucket?: string;
  public_url?: string;
  region?: string;
}

export interface AdminSettings {
  backend: BackendInfo;
  storage: {
    active: string;
    r2: StorageConfig;
    storj: StorageConfig;
  };
  maintenance: {
    global: boolean;
    youtube: boolean;
    instagram: boolean;
  };
  limits: {
    maxLogs: number;
    currentLogs: number;
    cleanupInterval: string;
    fileRetention: string;
  };
}

export interface DownloadLog {
  id: string;
  timestamp: string;
  type: "youtube" | "instagram";
  status: "success" | "error";
  url: string;
  title?: string;
  filename?: string;
  download_url?: string;
  size_bytes?: number;
  size_formatted?: string;
  error?: string;
  quality?: string;
  mode?: string;
  method?: string;
  media_index?: number;
}

export interface LogsResponse {
  logs: DownloadLog[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AdminStats {
  downloads: {
    total: number;
    youtube: number;
    instagram: number;
    success: number;
    errors: number;
    successRate: string;
    totalSize: string;
    totalSizeBytes: number;
  };
  disk: {
    total: string;
    used: string;
    free: string;
    percent: string;
    filesOnDisk: number;
  };
  storage: {
    active: string;
    r2: boolean;
    storj: boolean;
  };
  maintenance: {
    global: boolean;
    youtube: boolean;
    instagram: boolean;
  };
}

// ── API Functions ──────────────────────────────────────────

export async function adminLogin(password: string): Promise<{ success: boolean; error?: string }> {
  const backend = getBackendUrl();
  try {
    const res = await fetch(`${backend}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.success) {
      setAdminPassword(password);
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Connection failed" };
  }
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/admin/settings`, {
    headers: adminHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized — wrong admin password");
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export async function updateAdminSettings(updates: {
  active_storage?: string;
  maintenance?: { global?: boolean; youtube?: boolean; instagram?: boolean };
  r2_config?: StorageConfig;
  storj_config?: StorageConfig;
}): Promise<{ success: boolean; changes: string[] }> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/admin/settings`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export async function testStorageConnection(type: string, config?: Record<string, any>): Promise<any> {
  const backend = getBackendUrl();
  const body: Record<string, any> = { type };
  // Send the form credentials so backend can test BEFORE saving
  if (config) {
    body.config = config;
  }
  const res = await fetch(`${backend}/api/admin/storage/test`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchAdminLogs(
  page = 1,
  perPage = 50,
  type = "",
  search = ""
): Promise<LogsResponse> {
  const backend = getBackendUrl();
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    admin_password: getAdminPassword(),
  });
  if (type) params.set("type", type);
  if (search) params.set("search", search);

  const res = await fetch(`${backend}/api/admin/logs?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function clearAdminLogs(): Promise<{ success: boolean; cleared: number }> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/admin/logs/clear`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const backend = getBackendUrl();
  const params = new URLSearchParams({ admin_password: getAdminPassword() });
  const res = await fetch(`${backend}/api/admin/stats?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function cleanupDownloads(): Promise<{ success: boolean; cleaned: string[]; count: number }> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/admin/downloads/cleanup`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
