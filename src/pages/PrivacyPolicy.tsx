import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#000", fontFamily: "inherit" }}>
      {/* Subtle background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ top: "-10%", left: "40%", width: 700, height: 600, background: "radial-gradient(circle, rgba(6,182,212,1), transparent 70%)", opacity: 0.05, filter: "blur(140px)" }} />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 mb-12 transition-colors duration-200"
          style={{ fontSize: 13, color: "rgba(34,211,238,0.6)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#22d3ee")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(34,211,238,0.6)")}
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: "rgba(8,145,178,0.12)", border: "1px solid rgba(8,145,178,0.25)" }}>
            <Shield size={18} style={{ color: "#22d3ee" }} />
          </div>
          <h1 className="text-3xl font-light tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>Privacy Policy</h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 48, letterSpacing: "0.04em" }}>
          Effective Date: February 14, 2026
        </p>

        {/* Divider */}
        <div className="mb-10" style={{ height: 1, background: "linear-gradient(90deg, rgba(8,145,178,0.3), transparent)" }} />

        <p className="mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
          R3 Productions LLC, doing business as <strong style={{ color: "rgba(255,255,255,0.9)" }}>Connecta Creators</strong> ("we," "us," or "our"), operates the website{" "}
          <a href="https://connectacreators.com" style={{ color: "#22d3ee", textDecoration: "underline" }}>
            connectacreators.com
          </a>{" "}
          and provides AI-powered content creation tools, CRM systems, automation tools, appointment booking systems, and SMS/email communication automation for our clients. This Privacy Policy explains how we collect, use, disclose, and safeguard your information.
        </p>

        {[
          {
            num: "1",
            title: "Information We Collect",
            content: (
              <>
                <p className="mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>We may collect the following personal information when you interact with our services:</p>
                <ul className="space-y-2" style={{ paddingLeft: 20 }}>
                  {["Name", "Phone number", "Email address", "Appointment information (date, time, service requested)", "Website interaction data (pages visited, clicks, device information)", "Form submission data collected through Facebook Instant Forms, landing pages, and booking systems", "Content and usage data generated through the Connecta Creators platform"].map((item, i) => (
                    <li key={i} className="flex items-start gap-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.7 }}>
                      <span style={{ color: "#22d3ee", marginTop: 6, width: 4, height: 4, borderRadius: "50%", background: "#22d3ee", flexShrink: 0, display: "inline-block" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ),
          },
          {
            num: "2",
            title: "How We Use Your Information",
            content: (
              <>
                <p className="mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>We use the information we collect to:</p>
                <ul className="space-y-2" style={{ paddingLeft: 20 }}>
                  {["Schedule and confirm appointments", "Send appointment reminders via SMS and email", "Respond to your inquiries and support requests", "Provide CRM and automation services on behalf of our clients", "Power AI script generation, content calendar, and creator tools", "Improve our services and overall user experience"].map((item, i) => (
                    <li key={i} className="flex items-start gap-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.7 }}>
                      <span style={{ color: "#22d3ee", marginTop: 6, width: 4, height: 4, borderRadius: "50%", background: "#22d3ee", flexShrink: 0, display: "inline-block" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ),
          },
          {
            num: "3",
            title: "SMS Communication Disclosure",
            content: (
              <>
                <p className="mb-4 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  By submitting a form, booking an appointment, or otherwise providing your phone number through our services, you consent to receive SMS text messages from Connecta Creators and/or our clients. These messages may include appointment confirmations, reminders, follow-ups, and other service-related communications.
                </p>
                <ul className="space-y-2" style={{ paddingLeft: 20 }}>
                  {[
                    "Message frequency varies depending on your interaction with our services.",
                    "Message and data rates may apply.",
                    <span>You may opt out at any time by replying <strong style={{ color: "rgba(255,255,255,0.8)" }}>STOP</strong> to any message.</span>,
                    <span>For assistance, reply <strong style={{ color: "rgba(255,255,255,0.8)" }}>HELP</strong> to any message or contact us at <a href="mailto:creatorsconnecta@gmail.com" style={{ color: "#22d3ee" }}>creatorsconnecta@gmail.com</a>.</span>,
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.7 }}>
                      <span style={{ color: "#22d3ee", marginTop: 6, width: 4, height: 4, borderRadius: "50%", background: "#22d3ee", flexShrink: 0, display: "inline-block" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ),
          },
          {
            num: "4",
            title: "Information Sharing",
            content: (
              <>
                <p className="mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Connecta Creators <strong style={{ color: "rgba(255,255,255,0.85)" }}>does not sell</strong> your personal data to third parties.
                </p>
                <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  We may share your information with our clients only when you have directly requested services from those clients (e.g., booking an appointment through a client's form). All data sharing is strictly limited to operational and service-related purposes.
                </p>
              </>
            ),
          },
          {
            num: "5",
            title: "Data Security",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                We implement reasonable technical and organizational safeguards designed to protect your personal information from unauthorized access, disclosure, alteration, or destruction. Your data is stored securely via Supabase with row-level security. However, no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
              </p>
            ),
          },
          {
            num: "6",
            title: "Your Rights",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                You may request access to, correction of, or deletion of your personal data at any time by contacting us. We will respond to your request within a reasonable timeframe and in accordance with applicable laws.
              </p>
            ),
          },
          {
            num: "7",
            title: "Changes to This Policy",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date. We encourage you to review this policy periodically.
              </p>
            ),
          },
          {
            num: "8",
            title: "Contact Us",
            content: (
              <>
                <p className="mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  If you have any questions about this Privacy Policy or wish to exercise your rights, please contact us:
                </p>
                <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(8,145,178,0.06)", border: "1px solid rgba(8,145,178,0.18)" }}>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>Connecta Creators</strong> (R3 Productions LLC)<br />
                    Email:{" "}
                    <a href="mailto:creatorsconnecta@gmail.com" style={{ color: "#22d3ee" }}>
                      creatorsconnecta@gmail.com
                    </a>
                  </p>
                </div>
              </>
            ),
          },
        ].map((section) => (
          <section key={section.num} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(8,145,178,0.5)", letterSpacing: "0.1em", minWidth: 20 }}>{section.num}.</span>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.01em" }}>{section.title}</h2>
            </div>
            <div style={{ paddingLeft: 32 }}>
              {section.content}
            </div>
          </section>
        ))}

        {/* Footer divider */}
        <div className="mt-16 pt-8" style={{ borderTop: "1px solid rgba(8,145,178,0.12)" }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>© 2026 ConnectaCreators · R3 Productions LLC</span>
            <div className="flex items-center gap-6">
              <Link to="/terms-and-conditions" style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }} className="hover:text-white transition-colors duration-200">Terms of Service</Link>
              <Link to="/" style={{ fontSize: 12, color: "rgba(34,211,238,0.5)" }} className="hover:text-cyan-400 transition-colors duration-200">← Home</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
