import { Heart, Globe, Share2 } from "lucide-react";

interface FooterProps {
  onPageChange: (page: string) => void;
}

const footerLinks = [
  {
    title: "Downloaders",
    links: [
      { label: "YouTube Downloader", page: "youtube" },
      { label: "Instagram Downloader", page: "instagram" },
    ],
  },
  {
    title: "YouTube Formats",
    links: [
      { label: "MP4 Download", page: "youtube" },
      { label: "MP3 Converter", page: "youtube" },
      { label: "4K Download", page: "youtube" },
      { label: "1080p Download", page: "youtube" },
    ],
  },
  {
    title: "Instagram",
    links: [
      { label: "Reels Download", page: "instagram" },
      { label: "Post Download", page: "instagram" },
      { label: "Story Download", page: "instagram" },
      { label: "IGTV Download", page: "instagram" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "FAQ", page: "" },
      { label: "Contact Us", page: "" },
      { label: "Privacy Policy", page: "" },
      { label: "Terms of Service", page: "" },
    ],
  },
];

export default function Footer({ onPageChange }: FooterProps) {
  const handleLinkClick = (page: string) => {
    if (page) {
      onPageChange(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <footer className="border-t border-dark-border bg-dark-card/50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <button onClick={() => handleLinkClick("youtube")} className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-yt-red to-red-700">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <span className="text-base font-bold text-dark-text">
                Video<span className="text-yt-red">Downloader</span>
              </span>
            </button>
            <p className="mb-4 text-sm leading-relaxed text-dark-muted">
              Free online tool to download YouTube & Instagram content in high quality. Fast, reliable, and no registration required.
            </p>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-dark-border bg-dark-surface text-dark-muted">
                <Globe size={16} />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-dark-border bg-dark-surface text-dark-muted">
                <Share2 size={16} />
              </span>
            </div>
          </div>

          {/* Links */}
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="mb-3 text-sm font-semibold text-dark-text">{group.title}</h4>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => handleLinkClick(link.page)}
                      className="text-sm text-dark-muted transition-colors hover:text-yt-red"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-dark-border pt-6 sm:flex-row">
          <p className="text-xs text-dark-muted/60">
            © {new Date().getFullYear()} VideoDownloader. All rights reserved.
          </p>
          <p className="flex items-center gap-1 text-xs text-dark-muted/60">
            Made with <Heart size={12} className="text-yt-red" fill="currentColor" /> for video lovers
          </p>
        </div>
      </div>
    </footer>
  );
}
