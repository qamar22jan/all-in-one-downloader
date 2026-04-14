import { useState } from "react";
import Header from "./components/Header";
import HeroDownloader from "./components/HeroDownloader";
import InstagramDownloader from "./components/InstagramDownloader";
import Admin from "./components/Admin";
import HowToUse from "./components/HowToUse";
import Features from "./components/Features";
import FAQ from "./components/FAQ";
import Footer from "./components/Footer";

export default function App() {
  const [activePage, setActivePage] = useState("youtube");

  if (activePage === "admin") {
    return (
      <div className="min-h-screen bg-dark-bg text-dark-text">
        <Header activePage={activePage} onPageChange={setActivePage} />
        <Admin />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text">
      <Header activePage={activePage} onPageChange={setActivePage} />

      {/* Page Content */}
      {activePage === "youtube" ? <HeroDownloader /> : <InstagramDownloader />}

      <HowToUse activePage={activePage} />
      <Features activePage={activePage} />
      <FAQ activePage={activePage} />
      <Footer onPageChange={setActivePage} />
    </div>
  );
}
