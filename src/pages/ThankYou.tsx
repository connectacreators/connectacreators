import { Link } from "react-router-dom";
import logoInk from "@/assets/connecta-logo-black.png";
import VSLPlayer from "@/components/VSLPlayer";
import "./thank-you.css";

const ASSETS = "https://hxojqrilwhhrvloiwmfo.supabase.co/storage/v1/object/public/landing-assets";

const VIDEO_URL = `${ASSETS}/thank-you-video.mp4`;
const VIDEO_POSTER = `${ASSETS}/thank-you-video-poster.jpg`;

const TESTIMONIALS = [
  {
    name: "Dr. Calvin",
    video: `${ASSETS}/testimonial-dr-calvin.mp4`,
    poster: `${ASSETS}/testimonial-dr-calvin-poster.jpg`,
  },
  {
    name: "Dr. Jaromy Bell",
    video: `${ASSETS}/testimonial-saratoga.mp4`,
    poster: `${ASSETS}/testimonial-saratoga-poster.jpg`,
  },
];

export default function ThankYou() {
  return (
    <div className="thank-you-page">
      <div className="ty-container">
        <header className="ty-hero">
          <h1 className="ty-h1">
            Congratulations! Your Appointment
            <br />
            Has Been Scheduled &amp; Confirmed
          </h1>

          <p className="ty-lede">
            We have sent you confirmation of your call's time and date via email
            and text. Please make sure that you put this in your calendar right
            now.
          </p>

          <p className="ty-watch">Watch this brief video for what to do next.</p>
        </header>

        <div className="ty-video-wrap">
          <VSLPlayer src={VIDEO_URL} poster={VIDEO_POSTER} accent="#2E9E6B" />
        </div>

        <section className="ty-proof">
          <p className="ty-eyebrow">Real clients, real results</p>
          <h2 className="ty-proof-h2">You're in good company</h2>

          <div className="ty-cards ty-cards--testimonials">
            {TESTIMONIALS.map((t) => (
              <article className="ty-card ty-card--testimonial" key={t.name}>
                <VSLPlayer src={t.video} poster={t.poster} accent="#2E9E6B" autoPlay={false} />
                <p className="ty-card-name">{t.name}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className="ty-footer">
        <div className="ty-footer-inner">
          <img className="ty-footer-logo" src={logoInk} alt="Connecta" />
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
