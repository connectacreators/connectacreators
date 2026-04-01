import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#000", fontFamily: "inherit" }}>
      {/* Subtle background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ top: "-10%", right: "40%", width: 700, height: 600, background: "radial-gradient(circle, rgba(132,204,22,1), transparent 70%)", opacity: 0.04, filter: "blur(140px)" }} />
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
            <FileText size={18} style={{ color: "#22d3ee" }} />
          </div>
          <h1 className="text-3xl font-light tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>Terms of Service</h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 48, letterSpacing: "0.04em" }}>
          Effective Date: February 14, 2026
        </p>

        {/* Divider */}
        <div className="mb-10" style={{ height: 1, background: "linear-gradient(90deg, rgba(8,145,178,0.3), transparent)" }} />

        <p className="mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
          These Terms of Service ("Terms") govern your use of the services provided by R3 Productions LLC, doing business as <strong style={{ color: "rgba(255,255,255,0.9)" }}>Connecta Creators</strong> ("we," "us," or "our"), through the website{" "}
          <a href="https://connectacreators.com" style={{ color: "#22d3ee", textDecoration: "underline" }}>
            connectacreators.com
          </a>{" "}
          and any related platforms. By accessing or using our services, you agree to be bound by these Terms.
        </p>

        {[
          {
            num: "1",
            title: "Service Description",
            content: (
              <>
                <p className="mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Connecta Creators provides a suite of AI-powered content creation and business automation tools, including but not limited to:
                </p>
                <ul className="space-y-2" style={{ paddingLeft: 20 }}>
                  {["AI script generation, teleprompter, and video transcription tools", "Customer Relationship Management (CRM) software", "Appointment booking and scheduling systems", "SMS and email automation", "Marketing automation tools and workflows", "Lead management and tracking tools", "Content calendar, editing queue, and viral video research"].map((item, i) => (
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
            title: "SMS Messaging Consent",
            content: (
              <>
                <p className="mb-4 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  By submitting a form on our website, booking pages, or Facebook Instant Forms, you expressly consent to receive SMS text messages from Connecta Creators and/or our clients. These messages may include appointment confirmations, reminders, follow-ups, and other service-related communications.
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
                <p className="mt-4 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  Consent to receive SMS messages is not a condition of purchasing any goods or services.
                </p>
              </>
            ),
          },
          {
            num: "3",
            title: "User Responsibilities",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                By using our services, you agree to provide accurate and complete information when submitting forms, booking appointments, or interacting with our platform. You agree not to misuse our services, interfere with their operation, or use them for any unlawful purpose.
              </p>
            ),
          },
          {
            num: "4",
            title: "Opt-Out Policy",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                You may opt out of SMS communications at any time by replying <strong style={{ color: "rgba(255,255,255,0.85)" }}>STOP</strong> to any message you receive from us. Upon receipt of your opt-out request, we will promptly cease sending SMS messages to your number. You may also contact us at{" "}
                <a href="mailto:creatorsconnecta@gmail.com" style={{ color: "#22d3ee" }}>
                  creatorsconnecta@gmail.com
                </a>{" "}
                to request removal from our messaging lists.
              </p>
            ),
          },
          {
            num: "5",
            title: "Subscription & Billing",
            content: (
              <>
                <p className="mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Connecta Creators offers subscription-based access to its platform. By subscribing, you agree to the following:
                </p>
                <ul className="space-y-2" style={{ paddingLeft: 20 }}>
                  {["Subscriptions are billed on a recurring basis (monthly or annually) as selected at checkout.", "You may cancel your subscription at any time; access continues until the end of the current billing period.", "Refunds are not issued for partial billing periods.", "We reserve the right to modify pricing with 30 days' notice to active subscribers."].map((item, i) => (
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
            num: "6",
            title: "Limitation of Liability",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                Connecta Creators shall not be held liable for any delays, failures, or interruptions in service caused by third-party platforms, telecommunications providers, or circumstances beyond our reasonable control. Our services are provided on an "as is" and "as available" basis without warranties of any kind, express or implied.
              </p>
            ),
          },
          {
            num: "7",
            title: "Intellectual Property",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                All content, trademarks, and intellectual property associated with Connecta Creators and its platform are the property of R3 Productions LLC. You may not reproduce, distribute, or create derivative works from any of our materials without prior written consent.
              </p>
            ),
          },
          {
            num: "8",
            title: "Changes to These Terms",
            content: (
              <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                We reserve the right to update or modify these Terms at any time. Any changes will be posted on this page with an updated effective date. Your continued use of our services after any modifications constitutes your acceptance of the revised Terms.
              </p>
            ),
          },
          {
            num: "9",
            title: "Contact Us",
            content: (
              <>
                <p className="mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  If you have any questions about these Terms, please contact us:
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
              <Link to="/privacy-policy" style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }} className="hover:text-white transition-colors duration-200">Privacy Policy</Link>
              <Link to="/" style={{ fontSize: 12, color: "rgba(34,211,238,0.5)" }} className="hover:text-cyan-400 transition-colors duration-200">← Home</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;
