import {
  Zap,
  Shield,
  MonitorSmartphone,
  Download,
  Globe,
  Infinity,
} from "lucide-react";

interface FeaturesProps {
  activePage: string;
}

const featuresYouTube = [
  {
    icon: <Zap size={22} className="text-yt-red" />,
    title: "Lightning Fast",
    description: "Server-side yt-dlp engine for the fastest possible downloads with smart format selection.",
  },
  {
    icon: <MonitorSmartphone size={22} className="text-yt-red" />,
    title: "HD Quality",
    description: "Download videos up to 4K resolution. Auto-merges best video + audio streams.",
  },
  {
    icon: <Download size={22} className="text-yt-red" />,
    title: "MP3 Converter",
    description: "Extract audio from any YouTube video and save as high-quality MP3 with metadata.",
  },
  {
    icon: <Shield size={22} className="text-yt-red" />,
    title: "No Sign-Up",
    description: "No registration, no accounts, no tracking. Just paste a link and download.",
  },
  {
    icon: <Globe size={22} className="text-yt-red" />,
    title: "All Formats",
    description: "Supports youtube.com, youtu.be, Shorts, embeds, and live stream replays.",
  },
  {
    icon: <Infinity size={22} className="text-yt-red" />,
    title: "Unlimited",
    description: "No download limits. Download as many videos as you want, completely free.",
  },
];

const featuresInstagram = [
  {
    icon: <Zap size={22} className="text-ig-pink" />,
    title: "Instant Downloads",
    description: "Download Instagram Reels, Posts, and IGTV in seconds with yt-dlp backend.",
  },
  {
    icon: <MonitorSmartphone size={22} className="text-ig-pink" />,
    title: "HD Quality",
    description: "Get the highest quality media available. Original resolution preserved.",
  },
  {
    icon: <Download size={22} className="text-ig-pink" />,
    title: "Carousel Support",
    description: "Download all images and videos from carousel posts with one click.",
  },
  {
    icon: <Shield size={22} className="text-ig-pink" />,
    title: "No Login Required",
    description: "Download public content without logging in. Private accounts need cookies.",
  },
  {
    icon: <Globe size={22} className="text-ig-pink" />,
    title: "All Content Types",
    description: "Supports Reels, Posts, IGTV, and Stories. All Instagram content formats.",
  },
  {
    icon: <Infinity size={22} className="text-ig-pink" />,
    title: "Unlimited",
    description: "No download limits. Download as many media files as you want, completely free.",
  },
];

export default function Features({ activePage }: FeaturesProps) {
  const isInstagram = activePage === "instagram";
  const features = isInstagram ? featuresInstagram : featuresYouTube;

  return (
    <section className="border-t border-dark-border bg-dark-card/30 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-2xl font-bold text-dark-text sm:text-3xl">
            {isInstagram ? (
              <>
                Why Choose Our{" "}
                <span className="gradient-text-ig">Instagram Downloader</span>
              </>
            ) : (
              <>
                Why Choose Our{" "}
                <span className="gradient-text">YouTube Downloader</span>
              </>
            )}
          </h2>
          <p className="text-dark-muted">
            {isInstagram
              ? "The fastest way to save Instagram content to your device"
              : "The most reliable way to download YouTube videos"}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`rounded-xl border border-dark-border bg-dark-card p-6 transition-all ${
                isInstagram ? "card-hover-ig" : "card-hover"
              }`}
            >
              <div
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg ${
                  isInstagram ? "bg-ig-pink/10" : "bg-yt-red/10"
                }`}
              >
                {feature.icon}
              </div>
              <h3 className="mb-2 text-base font-semibold text-dark-text">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-dark-muted">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
