import { useState } from "react";
import { Menu, X } from "lucide-react";

interface HeaderProps {
  activePage: string;
  onPageChange: (page: string) => void;
}

export default function Header({ activePage, onPageChange }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "YouTube", page: "youtube", icon: "▶" },
    { label: "Instagram", page: "instagram", icon: "📷" },
    { label: "Admin", page: "admin", icon: "⚙️" },
  ];

  const handleNav = (page: string) => {
    onPageChange(page);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-dark-border bg-dark-bg/80 glass-effect">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <button
          onClick={() => handleNav("youtube")}
          className="flex items-center gap-2 group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-yt-red to-red-700 shadow-lg shadow-red-900/30 transition-transform group-hover:scale-105">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-white">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-dark-text">
            Video<span className="text-yt-red">Downloader</span>
          </span>
        </button>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <button
              key={link.page}
              onClick={() => handleNav(link.page)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
                activePage === link.page
                  ? link.page === "instagram"
                    ? "bg-ig-pink/10 text-ig-pink"
                    : "bg-yt-red/10 text-yt-red"
                  : "text-dark-muted hover:bg-dark-surface hover:text-dark-text"
              }`}
            >
              <span>{link.icon}</span>
              {link.label}
              {link.page === "instagram" && (
                <span className="rounded-full bg-ig-pink/20 px-1.5 py-0.5 text-[10px] font-bold text-ig-pink">
                  NEW
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-dark-muted hover:bg-dark-surface md:hidden"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="border-t border-dark-border bg-dark-card px-4 py-3 md:hidden">
          {navLinks.map((link) => (
            <button
              key={link.page}
              onClick={() => handleNav(link.page)}
              className={`w-full text-left rounded-lg px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 ${
                activePage === link.page
                  ? link.page === "instagram"
                    ? "bg-ig-pink/10 text-ig-pink"
                    : "bg-yt-red/10 text-yt-red"
                  : "text-dark-muted hover:bg-dark-surface hover:text-dark-text"
              }`}
            >
              <span>{link.icon}</span>
              {link.label}
              {link.page === "instagram" && (
                <span className="rounded-full bg-ig-pink/20 px-1.5 py-0.5 text-[10px] font-bold text-ig-pink">
                  NEW
                </span>
              )}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
