import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQProps {
  activePage: string;
}

const faqsYouTube = [
  {
    question: "Is this YouTube downloader free?",
    answer:
      "Yes, completely free! This is a self-hosted tool using yt-dlp. You run your own backend server, so there are no hidden costs or subscriptions.",
  },
  {
    question: "What video qualities are supported?",
    answer:
      "We support all qualities from 360p up to 4K (2160p). The backend automatically selects the best available quality and merges video + audio using ffmpeg.",
  },
  {
    question: "Can I download as MP3?",
    answer:
      "Yes! Switch to the Audio tab after analyzing a video. You can extract audio as MP3 with various bitrate options. ffmpeg is required on the server for MP3 conversion.",
  },
  {
    question: "Why is the backend server needed?",
    answer:
      "YouTube blocks direct downloads from browsers. Our Python backend uses yt-dlp to handle YouTube's protections, downloads the video server-side, then serves it to your browser.",
  },
  {
    question: "What about YouTube Shorts?",
    answer:
      "YouTube Shorts URLs (youtube.com/shorts/) are fully supported. Just paste the Shorts link and it works the same as regular videos.",
  },
  {
    question: "Where are downloaded files stored?",
    answer:
      "Files are temporarily stored on the backend server and auto-deleted after 1 hour. You save the file to your own device by clicking 'Save File'.",
  },
];

const faqsInstagram = [
  {
    question: "Is this Instagram downloader free?",
    answer:
      "Yes, completely free! This is a self-hosted tool using yt-dlp which natively supports Instagram. You run your own backend server.",
  },
  {
    question: "Can I download Instagram Reels?",
    answer:
      "Yes! Reels are fully supported. Just paste the Reel URL and click Analyze. The video will be downloaded in the highest available quality.",
  },
  {
    question: "Can I download carousel posts?",
    answer:
      "Yes! Carousel posts with multiple images and/or videos are fully supported. You can download all files at once or individually.",
  },
  {
    question: "Can I download from private accounts?",
    answer:
      "Only public content can be downloaded by default. For private accounts, you need to provide login cookies to the yt-dlp backend.",
  },
  {
    question: "What about Instagram Stories?",
    answer:
      "Stories are supported but require login cookies since they are only visible to logged-in users. Regular posts and reels work without login.",
  },
  {
    question: "Where are downloaded files stored?",
    answer:
      "Files are temporarily stored on the backend server and auto-deleted after 1 hour. You save the file to your own device by clicking 'Save File'.",
  },
];

export default function FAQ({ activePage }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isInstagram = activePage === "instagram";
  const faqs = isInstagram ? faqsInstagram : faqsYouTube;

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="border-t border-dark-border bg-dark-bg py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-2xl font-bold text-dark-text sm:text-3xl">
            {isInstagram ? (
              <>
                <span className="gradient-text-ig">Instagram</span> FAQ
              </>
            ) : (
              <>
                Frequently Asked{" "}
                <span className="gradient-text">Questions</span>
              </>
            )}
          </h2>
          <p className="text-dark-muted">
            Everything you need to know about downloading{" "}
            {isInstagram ? "Instagram" : "YouTube"} content
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className={`rounded-xl border transition-colors ${
                openIndex === index
                  ? isInstagram
                    ? "border-ig-pink/30 bg-ig-pink/5"
                    : "border-yt-red/30 bg-yt-red/5"
                  : "border-dark-border bg-dark-card"
              }`}
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-medium text-dark-text sm:text-base">
                  {faq.question}
                </span>
                <ChevronDown
                  size={18}
                  className={`text-dark-muted transition-transform flex-shrink-0 ml-3 ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-5 pb-4">
                  <p className="text-sm leading-relaxed text-dark-muted">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
