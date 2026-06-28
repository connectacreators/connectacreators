import { Link } from "react-router-dom";
import logoInk from "@/assets/connecta-logo-black.png";
import "./thank-you.css";

/**
 * Drop the "what to do next" video URL here when ready.
 * - Direct file (Supabase/MP4): set to the .mp4 URL  -> renders a <video> player.
 * - Otherwise leave empty ("") to show the styled placeholder frame.
 */
const VIDEO_URL = "";

/** Edit these three to swap in real client results. Plain text, no emojis. */
const RESULTS = [
  {
    result: "Placeholder result one",
    quote: "Short supporting quote from the client about what changed for them.",
    name: "Client Name",
  },
  {
    result: "Placeholder result two",
    quote: "Short supporting quote from the client about what changed for them.",
    name: "Client Name",
  },
  {
    result: "Placeholder result three",
    quote: "Short supporting quote from the client about what changed for them.",
    name: "Client Name",
  },
];

export default function ThankYou() {
  return (
    <div className="thank-you-page">
      <div className="ty-container">
        <div className="ty-logo-wrap">
          <img className="ty-logo" src={logoInk} alt="Connecta" />
        </div>

        <header className="ty-hero">
          <span className="ty-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>

          <h1 className="ty-h1">
            Congratulations! Your Appointment Has Been Scheduled &amp; Confirmed
          </h1>

          <p className="ty-lede">
            We have sent you confirmation of your call's time and date via email
            and text. Please make sure that you put this in your calendar right
            now.
          </p>

          <p className="ty-watch">Watch this brief video for what to do next.</p>
        </header>

        <div className="ty-video-wrap">
          <div className="ty-video">
            {VIDEO_URL ? (
              <video src={VIDEO_URL} controls playsInline preload="metadata" />
            ) : (
              <>
                <span className="ty-play" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className="ty-video-caption">Video coming soon</span>
              </>
            )}
          </div>
        </div>

        <section className="ty-proof">
          <p className="ty-eyebrow">Real clients, real results</p>
          <h2 className="ty-proof-h2">You're in good company</h2>

          <div className="ty-cards">
            {RESULTS.map((r, i) => (
              <article className="ty-card" key={i}>
                <p className="ty-card-result">{r.result}</p>
                <p className="ty-card-quote">{r.quote}</p>
                <p className="ty-card-name">{r.name}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className="ty-footer">
        <div className="ty-footer-inner">
          <div className="ty-footer-links">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-and-conditions">Terms &amp; Conditions</Link>
          </div>
          <p className="ty-footer-copy">© {new Date().getFullYear()} Connecta</p>
        </div>
      </footer>
    </div>
  );
}
