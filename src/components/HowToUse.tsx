import { Link, Search, Download as DownloadIcon } from "lucide-react";

interface HowToUseProps {
  activePage: string;
}

const stepsYouTube = [
  {
    number: "1",
    icon: <Link size={20} />,
    title: "Copy Link",
    description: "Open YouTube, click Share on any video, then copy the link",
    color: "from-yt-red to-red-700",
    shadowColor: "shadow-red-500/20",
  },
  {
    number: "2",
    icon: <Search size={20} />,
    title: "Paste & Analyze",
    description: "Paste the link into the input above and click Analyze",
    color: "from-yt-red to-red-700",
    shadowColor: "shadow-red-500/20",
  },
  {
    number: "3",
    icon: <DownloadIcon size={20} />,
    title: "Download",
    description: "Choose your preferred quality and format, then click download",
    color: "from-green-500 to-green-600",
    shadowColor: "shadow-green-500/20",
  },
];

const stepsInstagram = [
  {
    number: "1",
    icon: <Link size={20} />,
    title: "Copy Link",
    description: "Open Instagram, tap the three dots (⋯) on a post or reel, then tap Copy link",
    color: "from-ig-purple to-ig-pink",
    shadowColor: "shadow-pink-500/20",
  },
  {
    number: "2",
    icon: <Search size={20} />,
    title: "Paste & Analyze",
    description: "Switch to the Instagram tab, paste the link and click Analyze",
    color: "from-ig-purple to-ig-pink",
    shadowColor: "shadow-pink-500/20",
  },
  {
    number: "3",
    icon: <DownloadIcon size={20} />,
    title: "Download",
    description: "Preview the media, then click Download and Save File to your device",
    color: "from-green-500 to-green-600",
    shadowColor: "shadow-green-500/20",
  },
];

export default function HowToUse({ activePage }: HowToUseProps) {
  const isInstagram = activePage === "instagram";
  const steps = isInstagram ? stepsInstagram : stepsYouTube;
  const title = isInstagram ? "Download Instagram Reels, Posts & Stories" : "How to Use";
  const subtitle = isInstagram
    ? "Three simple steps to download any Instagram media"
    : "Three simple steps to download any YouTube video";

  return (
    <section className="border-t border-dark-border bg-dark-card/30 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-2xl font-bold text-dark-text sm:text-3xl">
            {isInstagram && "How to "}
            <span className={isInstagram ? "gradient-text-ig" : "gradient-text"}>
              {title}
            </span>
          </h2>
          <p className="text-dark-muted">{subtitle}</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="relative text-center">
              {/* Step number background */}
              <div className="absolute -top-2 -right-2 z-10">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${step.color} text-xs font-bold text-white shadow-lg ${step.shadowColor}`}
                >
                  {step.number}
                </div>
              </div>

              {/* Icon */}
              <div
                className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${step.color} text-white shadow-xl ${step.shadowColor}`}
              >
                {step.icon}
              </div>

              <h3 className="mb-2 text-lg font-semibold text-dark-text">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-dark-muted">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
