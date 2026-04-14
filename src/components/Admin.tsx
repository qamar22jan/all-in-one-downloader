import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Server,
  Database,
  HardDrive,
  Cloud,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Activity,
  HardDriveDownload,
  Globe,
  Settings,
  Wrench,
  TestTube2,
  ExternalLink,
} from "lucide-react";
import {
  adminLogin,
  isAdminLoggedIn,
  clearAdminPassword,
  fetchAdminSettings,
  updateAdminSettings,
  testStorageConnection,
  fetchAdminLogs,
  clearAdminLogs,
  fetchAdminStats,
  cleanupDownloads,
  type AdminSettings,
  type AdminStats,
  type DownloadLog,
  type StorageConfig,
} from "../services/adminApi";
import { getBackendUrl, setBackendUrl, resetBackendUrl } from "../services/youtubeApi";

type Tab = "dashboard" | "storage" | "maintenance" | "logs" | "settings";

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(isAdminLoggedIn());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "dashboard", label: "Dashboard", icon: Activity },
    { id: "storage", label: "Storage", icon: Database },
    { id: "maintenance", label: "Maintenance", icon: Wrench },
    { id: "logs", label: "Logs", icon: HardDriveDownload },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  // ── Data loading ──────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, st] = await Promise.all([fetchAdminSettings(), fetchAdminStats()]);
      setSettings(s);
      setStats(st);
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("Unauthorized")) {
        setAuthenticated(false);
        clearAdminPassword();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) loadSettings();
  }, [authenticated, loadSettings]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // ── Login ──────────────────────────────────────────────

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await adminLogin(password);
      if (result.success) {
        setAuthenticated(true);
      } else {
        setLoginError(result.error || "Invalid password");
      }
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminPassword();
    setAuthenticated(false);
    setSettings(null);
    setStats(null);
  };

  // ── Login Screen ──────────────────────────────────────

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
        <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yt-red to-red-700 flex items-center justify-center shadow-lg shadow-red-900/30">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-dark-text mb-2">Admin Panel</h2>
          <p className="text-dark-muted text-center text-sm mb-6">
            Enter the admin password to manage your downloader
          </p>

          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              {loginError}
            </div>
          )}

          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Admin password"
              className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-xl text-dark-text placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-yt-red/50 focus:border-yt-red transition"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark-text transition"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={loginLoading || !password}
            className="w-full py-3 bg-gradient-to-r from-yt-red to-red-700 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
          >
            {loginLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Login
              </>
            )}
          </button>

          <p className="text-dark-muted text-xs text-center mt-4">
            Default password: <code className="bg-dark-surface px-1.5 py-0.5 rounded">admin123</code>
            <br />
            Set via <code className="bg-dark-surface px-1.5 py-0.5 rounded">ADMIN_PASSWORD</code> env variable
          </p>
        </div>
      </div>
    );
  }

  // ── Main Admin Panel ──────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-dark-card/80 backdrop-blur-xl border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-yt-red to-red-700 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-dark-text">Admin Panel</h1>
              <p className="text-xs text-dark-muted">{getBackendUrl()}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm bg-dark-surface border border-dark-border rounded-lg text-dark-muted hover:text-red-400 hover:border-red-500/30 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-300">✕</button>
          </div>
        </div>
      )}
      {successMsg && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-56 shrink-0">
            <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? "bg-yt-red/10 text-yt-red border border-yt-red/20"
                      : "text-dark-muted hover:bg-dark-surface hover:text-dark-text border border-transparent"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {loading && !settings ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-yt-red" />
              </div>
            ) : (
              <>
                {activeTab === "dashboard" && stats && settings && (
                  <DashboardTab stats={stats} settings={settings} onRefresh={loadSettings} />
                )}
                {activeTab === "storage" && settings && (
                  <StorageTab settings={settings} onUpdate={loadSettings} onSuccess={showSuccess} />
                )}
                {activeTab === "maintenance" && settings && (
                  <MaintenanceTab settings={settings} onUpdate={loadSettings} onSuccess={showSuccess} />
                )}
                {activeTab === "logs" && <LogsTab onSuccess={showSuccess} />}
                {activeTab === "settings" && <SettingsTab onSuccess={showSuccess} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Dashboard Tab
// ══════════════════════════════════════════════════════════

function DashboardTab({
  stats,
  settings,
  onRefresh,
}: {
  stats: AdminStats;
  settings: AdminSettings;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-dark-text">Dashboard</h2>
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg bg-dark-surface border border-dark-border text-dark-muted hover:text-dark-text transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total Downloads" value={String(stats.downloads.total)} color="blue" />
        <StatCard
          icon={CheckCircle2}
          label="Success Rate"
          value={stats.downloads.successRate}
          color="green"
        />
        <StatCard icon={XCircle} label="Errors" value={String(stats.downloads.errors)} color="red" />
        <StatCard icon={Database} label="Total Size" value={stats.downloads.totalSize} color="purple" />
      </div>

      {/* Platform breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-dark-muted mb-3">Platform Breakdown</h3>
          <div className="space-y-3">
            <PlatformBar label="YouTube" count={stats.downloads.youtube} total={stats.downloads.total} color="bg-red-500" />
            <PlatformBar label="Instagram" count={stats.downloads.instagram} total={stats.downloads.total} color="bg-pink-500" />
          </div>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-dark-muted mb-3">Disk Usage</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-dark-text">
              <span>Total</span>
              <span>{stats.disk.total}</span>
            </div>
            <div className="flex justify-between text-dark-text">
              <span>Used</span>
              <span>{stats.disk.used} ({stats.disk.percent})</span>
            </div>
            <div className="flex justify-between text-dark-text">
              <span>Free</span>
              <span className="text-green-400">{stats.disk.free}</span>
            </div>
            <div className="w-full bg-dark-surface rounded-full h-2 mt-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all"
                style={{ width: stats.disk.percent }}
              />
            </div>
            <p className="text-dark-muted text-xs mt-1">{stats.disk.filesOnDisk} files on disk</p>
          </div>
        </div>
      </div>

      {/* Backend Info */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-dark-muted mb-3 flex items-center gap-2">
          <Server className="w-4 h-4" /> Backend Info
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <InfoItem label="Version" value={settings.backend.version} />
          <InfoItem label="Environment" value={settings.backend.environment} />
          <InfoItem label="yt-dlp" value={settings.backend.ytDlpVersion} />
          <InfoItem label="FFmpeg" value={settings.backend.ffmpeg ? "✅ Found" : "❌ Not found"} />
          <InfoItem label="FFmpeg Path" value={settings.backend.ffmpegLocation} />
          <InfoItem label="Base URL" value={settings.backend.baseUrl} />
        </div>
      </div>

      {/* Active Storage */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-dark-muted mb-3 flex items-center gap-2">
          <Cloud className="w-4 h-4" /> Active Storage
        </h3>
        <div className="flex gap-3">
          {(["local", "r2", "storj"] as const).map((s) => (
            <div
              key={s}
              className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                stats.storage.active === s
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-dark-surface border-dark-border text-dark-muted"
              }`}
            >
              {stats.storage.active === s ? "● " : "○ "}
              {s === "local" ? "Local Disk" : s === "r2" ? "Cloudflare R2" : "Storj"}
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance Alerts */}
      {(stats.maintenance.global || stats.maintenance.youtube || stats.maintenance.instagram) && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5">
          <h3 className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Active Maintenance Modes
          </h3>
          <div className="space-y-1 text-sm text-yellow-300">
            {stats.maintenance.global && <p>🚫 Global — all downloads disabled</p>}
            {stats.maintenance.youtube && <p>🚫 YouTube — downloads disabled</p>}
            {stats.maintenance.instagram && <p>🚫 Instagram — downloads disabled</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400",
    green: "from-green-500/10 to-green-500/5 border-green-500/20 text-green-400",
    red: "from-red-500/10 to-red-500/5 border-red-500/20 text-red-400",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-400",
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-4`}>
      <Icon className="w-5 h-5 mb-2" />
      <p className="text-2xl font-bold text-dark-text">{value}</p>
      <p className="text-xs text-dark-muted mt-1">{label}</p>
    </div>
  );
}

function PlatformBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-dark-text">{label}</span>
        <span className="text-dark-muted">
          {count} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="w-full bg-dark-surface rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-dark-surface rounded-lg p-3">
      <p className="text-xs text-dark-muted">{label}</p>
      <p className="text-dark-text font-medium truncate" title={value}>{value}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Storage Tab
// ══════════════════════════════════════════════════════════

function StorageTab({
  settings,
  onUpdate,
  onSuccess,
}: {
  settings: AdminSettings;
  onUpdate: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [activeStorage, setActiveStorage] = useState(settings.storage.active);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // R2 form
  const [r2Config, setR2Config] = useState<StorageConfig>(settings.storage.r2);
  // Storj form
  const [storjConfig, setStorjConfig] = useState<StorageConfig>({
    enabled: settings.storage.storj.enabled,
    endpoint: settings.storage.storj.endpoint || "https://gateway.storjshare.io",
    access_key: settings.storage.storj.access_key || "",
    secret_key: settings.storage.storj.secret_key || "",
    bucket: settings.storage.storj.bucket || "video-downloads",
    public_url: settings.storage.storj.public_url || "",
    region: settings.storage.storj.region || "us-east-1",
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAdminSettings({
        active_storage: activeStorage,
        r2_config: r2Config,
        storj_config: storjConfig,
      });
      onSuccess("Storage settings saved!");
      onUpdate();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (type: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      // Send form credentials directly to test endpoint (tests BEFORE saving)
      let configToSend: Record<string, any> | undefined;
      if (type === "storj") {
        configToSend = { ...storjConfig };
      } else if (type === "r2") {
        configToSend = { ...r2Config };
      }
      const result = await testStorageConnection(type, configToSend);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setTesting(false);
    }
  };

  // Auto-enable Storj when user fills in credentials
  const updateStorjField = (field: string, value: string) => {
    const updated = { ...storjConfig, [field]: value };
    // Auto-enable when both access key and secret key are provided
    if (updated.access_key && updated.secret_key && !updated.enabled) {
      updated.enabled = true;
    }
    setStorjConfig(updated);
  };

  // Auto-enable R2 when user fills in credentials
  const updateR2Field = (field: string, value: string) => {
    const updated = { ...r2Config, [field]: value };
    if (updated.access_key && updated.secret_key && (updated as any).account_id && !updated.enabled) {
      updated.enabled = true;
    }
    setR2Config(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-dark-text">Storage Configuration</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yt-red to-red-700 text-white rounded-lg text-sm font-medium hover:from-red-600 hover:to-red-800 disabled:opacity-50 transition shadow-lg shadow-red-900/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save All
        </button>
      </div>

      {/* Active Storage Selector */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-dark-muted mb-3 flex items-center gap-2">
          <Database className="w-4 h-4" /> Active Storage Provider
        </h3>
        <p className="text-xs text-dark-muted mb-3">
          Choose where downloaded files are stored. "Local" stores on server disk. Cloud storage serves files directly to users via CDN.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { id: "local", label: "Local Disk", desc: "Store on server", icon: HardDrive },
            { id: "r2", label: "Cloudflare R2", desc: "S3-compatible CDN", icon: Cloud },
            { id: "storj", label: "Storj", desc: "Decentralized S3", icon: Globe },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setActiveStorage(opt.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeStorage === opt.id
                  ? "bg-yt-red/10 border-yt-red/30 text-yt-red"
                  : "bg-dark-surface border-dark-border text-dark-muted hover:border-dark-muted"
              }`}
            >
              <opt.icon className="w-5 h-5 mb-2" />
              <p className="font-medium text-sm text-dark-text">{opt.label}</p>
              <p className="text-xs">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* R2 Config */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-dark-muted flex items-center gap-2">
            <Cloud className="w-4 h-4" /> Cloudflare R2 Configuration
          </h3>
          <button
            onClick={() => handleTest("r2")}
            disabled={testing}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-dark-surface border border-dark-border rounded-lg text-dark-muted hover:text-dark-text transition"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube2 className="w-3 h-3" />}
            Test
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputField label="Account ID" value={r2Config.account_id || ""} onChange={(v) => updateR2Field("account_id", v)} placeholder="your-cloudflare-account-id" secret={false} />
          <InputField label="Access Key ID" value={r2Config.access_key || ""} onChange={(v) => updateR2Field("access_key", v)} placeholder="R2 access key" secret />
          <InputField label="Secret Access Key" value={r2Config.secret_key || ""} onChange={(v) => updateR2Field("secret_key", v)} placeholder="R2 secret key" secret />
          <InputField label="Bucket Name" value={r2Config.bucket || ""} onChange={(v) => updateR2Field("bucket", v)} placeholder="video-downloads" />
          <div className="md:col-span-2">
            <InputField label="Public URL (CDN)" value={r2Config.public_url || ""} onChange={(v) => updateR2Field("public_url", v)} placeholder="https://cdn.yourdomain.com" />
          </div>
        </div>
      </div>

      {/* Storj Config */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-dark-muted flex items-center gap-2">
            <Globe className="w-4 h-4" /> Storj S3 Configuration
          </h3>
          <div className="flex items-center gap-2">
            {storjConfig.enabled && storjConfig.access_key && (
              <span className="text-xs text-green-400">● Enabled</span>
            )}
            <button
              onClick={() => handleTest("storj")}
              disabled={testing}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-dark-surface border border-dark-border rounded-lg text-dark-muted hover:text-dark-text transition"
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube2 className="w-3 h-3" />}
              Test Connection
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputField label="S3 Endpoint" value={storjConfig.endpoint || ""} onChange={(v) => updateStorjField("endpoint", v)} placeholder="https://gateway.storjshare.io" />
          <InputField label="Region" value={storjConfig.region || ""} onChange={(v) => updateStorjField("region", v)} placeholder="us-east-1" />
          <InputField label="Access Key ID" value={storjConfig.access_key || ""} onChange={(v) => updateStorjField("access_key", v)} placeholder="Storj S3 access key" secret />
          <InputField label="Secret Access Key" value={storjConfig.secret_key || ""} onChange={(v) => updateStorjField("secret_key", v)} placeholder="Storj S3 secret key" secret />
          <InputField label="Bucket Name" value={storjConfig.bucket || ""} onChange={(v) => updateStorjField("bucket", v)} placeholder="video-downloads" />
          <div>
            <InputField label="Public URL (CDN)" value={storjConfig.public_url || ""} onChange={(v) => updateStorjField("public_url", v)} placeholder="https://link.storjshare.io/s/..." />
            <p className="text-xs text-dark-muted/60 mt-1">
              How users access files. Leave empty to auto-generate from endpoint.
            </p>
          </div>
        </div>
      </div>

      {/* Storj Setup Guide */}
      <div className="bg-dark-card border border-blue-500/20 rounded-xl p-5">
        <h3 className="text-sm font-medium text-blue-400 mb-3 flex items-center gap-2">
          📘 Storj Setup Guide — Step by Step
        </h3>
        <div className="space-y-3 text-xs text-dark-muted">
          <div className="flex gap-2">
            <span className="bg-blue-500/20 text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
            <div>
              <p className="text-dark-text font-medium">Create a Storj Account & Project</p>
              <p>Go to{" "}
                <a href="https://storj.io" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                  storj.io <ExternalLink className="w-3 h-3 inline" />
                </a>{" "}
                → Sign up → Create a Project (free tier = 25GB storage + 25GB bandwidth/month)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="bg-blue-500/20 text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
            <div>
              <p className="text-dark-text font-medium">Create a Bucket</p>
              <p>Dashboard → Select your Project → Buckets → <strong>Create Bucket</strong> → Name it <code className="text-blue-400">video-downloads</code></p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="bg-blue-500/20 text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
            <div>
              <p className="text-dark-text font-medium">Generate S3 Credentials (NOT Docker/Uplink)</p>
              <p>Dashboard → Access → <strong>Create Access Grant</strong> → Name it (e.g. "downloader") → Set permissions:
                <span className="text-green-400"> Read</span>, <span className="text-green-400"> Write</span>, <span className="text-green-400"> List</span>
                , <span className="text-green-400"> Delete</span> → Select bucket → Confirm →{" "}
                <strong className="text-yellow-400">Click "S3 Credentials" tab</strong> (NOT Docker, NOT Uplink CLI) → Copy the Access Key & Secret Key
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="bg-blue-500/20 text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</span>
            <div>
              <p className="text-dark-text font-medium">Fill in the Form Above</p>
              <p>
                <strong>Endpoint:</strong> <code className="text-blue-400">https://gateway.storjshare.io</code> (default — don't change)<br/>
                <strong>Region:</strong> <code className="text-blue-400">us-east-1</code> (default — don't change)<br/>
                <strong>Access Key ID:</strong> Paste from Step 3<br/>
                <strong>Secret Access Key:</strong> Paste from Step 3<br/>
                <strong>Bucket Name:</strong> <code className="text-blue-400">video-downloads</code> (same as Step 2)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="bg-blue-500/20 text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">5</span>
            <div>
              <p className="text-dark-text font-medium">Set Public URL (CDN) — What is this?</p>
              <p className="mb-2">
                When a video is uploaded to Storj, users need a URL to download it. The <strong>Public URL</strong> is how files become publicly accessible.
              </p>
              <div className="bg-dark-surface rounded-lg p-3 space-y-2">
                <p className="text-dark-text font-medium">How to get your Public URL:</p>
                <p>Option A: <strong>Storj Shared URL</strong> (easiest, free)</p>
                <p className="pl-3">Dashboard → Buckets → Click your bucket → <strong>Share</strong> → Copy the URL.<br/>
                It looks like: <code className="text-blue-400 break-all">https://link.storjshare.io/s/...your-unique-key.../video-downloads</code></p>
                <p>Option B: <strong>Custom Domain</strong> (for production, requires DNS setup)</p>
                <p className="pl-3">Dashboard → Buckets → Settings → Custom Domain → Point your CDN domain to Storj.<br/>
                Then use: <code className="text-blue-400">https://cdn.yourdomain.com</code></p>
              </div>
              <p className="mt-2">
                <span className="text-yellow-400">⚠️ If left empty:</span> Files will still upload, but download URLs will use the S3 gateway endpoint directly.
                This works but may be slower and has rate limits.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="bg-blue-500/20 text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">6</span>
            <div>
              <p className="text-dark-text font-medium">Test & Save</p>
              <p>Click <strong>Test Connection</strong> → If it shows "✅ Connected" → Click <strong>Save All</strong> → Set <strong>Active Storage = Storj</strong></p>
            </div>
          </div>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`rounded-xl p-5 border ${
          testResult.result?.status === "connected" || testResult.result?.status === "ok"
            ? "bg-green-500/10 border-green-500/30"
            : "bg-red-500/10 border-red-500/30"
        }`}>
          <h4 className={`text-sm font-medium mb-2 flex items-center gap-2 ${
            testResult.result?.status === "connected" || testResult.result?.status === "ok"
              ? "text-green-400"
              : "text-red-400"
          }`}>
            {testResult.result?.status === "connected" || testResult.result?.status === "ok"
              ? <CheckCircle2 className="w-4 h-4" />
              : <XCircle className="w-4 h-4" />}
            {(testResult.type || "").toUpperCase()} Storage Test — {testResult.result?.status || testResult.result?.reason || "Error"}
          </h4>
          {testResult.result?.message && (
            <p className="text-sm text-green-300 mb-2">{testResult.result.message}</p>
          )}
          {testResult.result?.hint && (
            <p className="text-sm text-yellow-300 mb-2">💡 {testResult.result.hint}</p>
          )}
          {testResult.result?.reason && !testResult.result?.hint && (
            <p className="text-sm text-red-300 mb-2">⚠️ {testResult.result.reason}</p>
          )}
          <details className="text-xs text-dark-muted">
            <summary className="cursor-pointer hover:text-dark-text transition">Raw Response</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(testResult.result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Maintenance Tab
// ══════════════════════════════════════════════════════════

function MaintenanceTab({
  settings,
  onUpdate,
  onSuccess,
}: {
  settings: AdminSettings;
  onUpdate: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [modes, setModes] = useState(settings.maintenance);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAdminSettings({ maintenance: modes });
      onSuccess("Maintenance settings saved!");
      onUpdate();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggles = [
    {
      key: "global" as const,
      label: "Global Maintenance",
      desc: "Disable ALL downloads site-wide. Shows 'under maintenance' message to all users.",
      color: "red",
    },
    {
      key: "youtube" as const,
      label: "YouTube Downloader",
      desc: "Disable YouTube downloads only. Instagram still works.",
      color: "red",
    },
    {
      key: "instagram" as const,
      label: "Instagram Downloader",
      desc: "Disable Instagram downloads only. YouTube still works.",
      color: "pink",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-dark-text">Maintenance Mode</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yt-red to-red-700 text-white rounded-lg text-sm font-medium hover:from-red-600 hover:to-red-800 disabled:opacity-50 transition shadow-lg shadow-red-900/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-xl divide-y divide-dark-border">
        {toggles.map((toggle) => (
          <div key={toggle.key} className="p-5 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-dark-text">{toggle.label}</h3>
              <p className="text-xs text-dark-muted mt-0.5">{toggle.desc}</p>
            </div>
            <button
              onClick={() => setModes({ ...modes, [toggle.key]: !modes[toggle.key] })}
              className={`shrink-0 transition-colors ${modes[toggle.key] ? "text-red-400" : "text-dark-muted"}`}
            >
              {modes[toggle.key] ? (
                <ToggleRight className="w-10 h-10" />
              ) : (
                <ToggleLeft className="w-10 h-10" />
              )}
            </button>
          </div>
        ))}
      </div>

      {modes.global && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium text-sm">Global Maintenance is ON</p>
            <p className="text-red-300 text-xs mt-1">
              All download functionality is disabled. Users will see a maintenance message.
            </p>
          </div>
        </div>
      )}

      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-dark-muted mb-3">Manual Cleanup</h3>
        <p className="text-xs text-dark-muted mb-3">
          Remove old download files from the server disk (files older than 1 hour). Auto-cleanup runs every 30 minutes.
        </p>
        <button
          onClick={async () => {
            try {
              const result = await cleanupDownloads();
              onSuccess(`Cleaned up ${result.count} old files`);
            } catch (err: any) {
              alert("Error: " + err.message);
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm text-dark-muted hover:text-dark-text transition"
        >
          <Trash2 className="w-4 h-4" />
          Clean Up Old Files Now
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Logs Tab
// ══════════════════════════════════════════════════════════

function LogsTab({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [logs, setLogs] = useState<DownloadLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const perPage = 30;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminLogs(page, perPage, filterType, search);
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      console.error("Failed to load logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClear = async () => {
    if (!confirm("Clear all download logs? This cannot be undone.")) return;
    try {
      const result = await clearAdminLogs();
      onSuccess(`Cleared ${result.cleared} logs`);
      setPage(1);
      loadLogs();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (status === "error") return <XCircle className="w-4 h-4 text-red-400" />;
    return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-dark-text">
          Download Logs
          <span className="text-sm font-normal text-dark-muted ml-2">({total} total)</span>
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={loadLogs} className="p-2 rounded-lg bg-dark-surface border border-dark-border text-dark-muted hover:text-dark-text transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleClear} className="flex items-center gap-1 px-3 py-2 text-xs bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/20 transition">
            <Trash2 className="w-3 h-3" /> Clear All
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search URLs, filenames..."
            className="w-full pl-10 pr-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-yt-red/50"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-yt-red/50"
        >
          <option value="">All Types</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="success">Success</option>
          <option value="error">Errors</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-surface/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-dark-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-dark-muted">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-dark-muted">URL / Link</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-dark-muted">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-dark-muted">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-yt-red mx-auto" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-dark-muted">
                    No logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-dark-surface/30 transition">
                    <td className="px-4 py-3">{statusIcon(log.status)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.type === "youtube"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-pink-500/10 text-pink-400"
                      }`}>
                        {log.type === "youtube" ? "YT" : "IG"}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {log.status === "success" && log.download_url ? (
                        <a
                          href={log.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline truncate block"
                          title={log.download_url}
                        >
                          {log.filename || log.download_url}
                        </a>
                      ) : (
                        <span className="text-dark-muted truncate block" title={log.error || log.url}>
                          {log.error ? `❌ ${log.error.substring(0, 60)}` : log.url.substring(0, 60)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-dark-muted whitespace-nowrap">
                      {log.size_formatted || "—"}
                    </td>
                    <td className="px-4 py-3 text-dark-muted whitespace-nowrap text-xs">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg bg-dark-surface border border-dark-border text-dark-muted hover:text-dark-text disabled:opacity-30 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-dark-muted px-3">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg bg-dark-surface border border-dark-border text-dark-muted hover:text-dark-text disabled:opacity-30 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Settings Tab
// ══════════════════════════════════════════════════════════

function SettingsTab({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [backendUrl, setBackendUrlState] = useState(getBackendUrl());
  const [newUrl, setNewUrl] = useState(getBackendUrl());

  const handleSave = () => {
    const cleaned = newUrl.trim().replace(/\/+$/, "");
    setBackendUrl(cleaned);
    setBackendUrlState(cleaned);
    onSuccess("Backend URL updated!");
  };

  const handleReset = () => {
    resetBackendUrl();
    setNewUrl(getBackendUrl());
    setBackendUrlState(getBackendUrl());
    onSuccess("Backend URL reset to default!");
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-dark-text">General Settings</h2>

      {/* Backend URL */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-dark-muted mb-3 flex items-center gap-2">
          <Server className="w-4 h-4" /> Backend URL
        </h3>
        <p className="text-xs text-dark-muted mb-3">
          The URL where your Python backend is running. This is used by the frontend to make API calls.
        </p>
        <div className="flex gap-3">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://your-backend.up.railway.app"
            className="flex-1 px-4 py-2.5 bg-dark-surface border border-dark-border rounded-lg text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-yt-red/50"
          />
          <button
            onClick={handleSave}
            className="px-4 py-2.5 bg-gradient-to-r from-yt-red to-red-700 text-white rounded-lg text-sm font-medium hover:from-red-600 hover:to-red-800 transition"
          >
            Save
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 bg-dark-surface border border-dark-border rounded-lg text-sm text-dark-muted hover:text-dark-text transition"
          >
            Reset
          </button>
        </div>
        <p className="text-xs text-dark-muted mt-2">
          Current: <span className="text-blue-400">{backendUrl}</span>
        </p>
      </div>

      {/* Admin Password Info */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-dark-muted mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" /> Admin Password
        </h3>
        <p className="text-xs text-dark-muted">
          The admin password is set via the <code className="bg-dark-surface px-1.5 py-0.5 rounded">ADMIN_PASSWORD</code> environment variable on Railway.
        </p>
        <div className="mt-3 p-3 bg-dark-surface rounded-lg text-xs text-dark-muted space-y-1">
          <p>• Go to your Railway project → Backend service → Variables tab</p>
          <p>• Add or update: <code className="text-blue-400">ADMIN_PASSWORD</code> = your_new_password</p>
          <p>• Redeploy the service for it to take effect</p>
        </div>
      </div>

      {/* Environment Variables Reference */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-dark-muted mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" /> Environment Variables Reference
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-dark-border">
                <th className="text-left py-2 pr-4 text-dark-muted font-medium">Variable</th>
                <th className="text-left py-2 pr-4 text-dark-muted font-medium">Where</th>
                <th className="text-left py-2 text-dark-muted font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border/50">
              {[
                ["ADMIN_PASSWORD", "Backend", "mySecretPass123"],
                ["BASE_URL", "Backend", "https://your-app.up.railway.app"],
                ["ACTIVE_STORAGE", "Backend", "local / r2 / storj"],
                ["APP_ENV", "Backend", "production"],
                ["PORT", "Backend", "3001"],
                ["R2_ENABLED", "Backend", "true"],
                ["R2_ACCOUNT_ID", "Backend", "cloudflare-account-id"],
                ["R2_ACCESS_KEY_ID", "Backend", "r2-access-key"],
                ["R2_SECRET_ACCESS_KEY", "Backend", "r2-secret-key"],
                ["R2_BUCKET_NAME", "Backend", "video-downloads"],
                ["R2_PUBLIC_URL", "Backend", "https://cdn.yourdomain.com"],
                ["STORJ_ENABLED", "Backend", "true"],
                ["STORJ_ENDPOINT", "Backend", "https://gateway.storjshare.io"],
                ["STORJ_ACCESS_KEY_ID", "Backend", "storj-s3-access-key"],
                ["STORJ_SECRET_ACCESS_KEY", "Backend", "storj-s3-secret-key"],
                ["STORJ_BUCKET_NAME", "Backend", "video-downloads"],
                ["STORJ_PUBLIC_URL", "Backend", "https://link.storjshare.io/..."],
              ].map(([variable, where, example]) => (
                <tr key={variable}>
                  <td className="py-1.5 pr-4"><code className="text-blue-400">{variable}</code></td>
                  <td className="py-1.5 pr-4 text-dark-muted">{where}</td>
                  <td className="py-1.5 text-dark-muted">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Shared Input Component
// ══════════════════════════════════════════════════════════

function InputField({
  label,
  value,
  onChange,
  placeholder = "",
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-dark-muted mb-1 block">{label}</label>
      <input
        type={secret && value.includes("****") ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-yt-red/50 transition"
      />
    </div>
  );
}
