import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

const dot = <span style={{ color: "#22d3ee", marginTop: 6, width: 4, height: 4, borderRadius: "50%", background: "#22d3ee", flexShrink: 0, display: "inline-block" }} />;

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.7 }}>
    {dot}
    <span>{children}</span>
  </li>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>{children}</p>
);

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#000", fontFamily: "inherit" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ top: "-10%", left: "40%", width: 700, height: 600, background: "radial-gradient(circle, rgba(6,182,212,1), transparent 70%)", opacity: 0.05, filter: "blur(140px)" }} />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-2 mb-12 transition-colors duration-200" style={{ fontSize: 13, color: "rgba(34,211,238,0.6)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#22d3ee")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(34,211,238,0.6)")}>
          <ArrowLeft size={14} /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: "rgba(8,145,178,0.12)", border: "1px solid rgba(8,145,178,0.25)" }}>
            <Shield size={18} style={{ color: "#22d3ee" }} />
          </div>
          <h1 className="text-3xl font-light tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>Privacy Policy</h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 48, letterSpacing: "0.04em" }}>
          Effective Date: May 2, 2026 · Last Updated: May 2, 2026
        </p>

        <div className="mb-10" style={{ height: 1, background: "linear-gradient(90deg, rgba(8,145,178,0.3), transparent)" }} />

        <P>
          R3 Productions, doing business as <strong style={{ color: "rgba(255,255,255,0.9)" }}>Connecta Creators</strong> ("we," "us," or "our"), operates the website{" "}
          <a href="https://connectacreators.com" style={{ color: "#22d3ee", textDecoration: "underline" }}>connectacreators.com</a>{" "}
          and provides AI-powered content creation tools, CRM systems, automation tools, appointment booking systems, and SMS/email communication automation. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform. By creating an account or using our services, you acknowledge that you have read, understood, and agree to the practices described in this policy.
        </P>

        <div style={{ height: 32 }} />

        {[
          {
            num: "1",
            title: "Information We Collect",
            content: (
              <>
                <P>We may collect the following personal information when you interact with our services:</P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  {[
                    "Full name and display name",
                    "Email address and phone number",
                    "Billing and payment information (processed securely via Stripe — we do not store full card numbers)",
                    "Appointment and booking data (date, time, service requested)",
                    "Website interaction data (pages visited, device type, IP address, browser type)",
                    "Form submission data collected through landing pages, booking systems, and lead capture forms",
                    "Content and usage data generated through the Connecta Creators platform (scripts, notes, AI conversations, media uploads)",
                    "Profile information you voluntarily provide",
                  ].map((item, i) => <Bullet key={i}>{item}</Bullet>)}
                </ul>
              </>
            ),
          },
          {
            num: "2",
            title: "How We Use Your Information",
            content: (
              <>
                <P>We use the information we collect strictly to operate and improve our services:</P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  {[
                    "To create and manage your account and provide access to the platform",
                    "To process payments and manage your subscription",
                    "To schedule and confirm appointments and send related reminders via SMS or email",
                    "To respond to your support requests and inquiries",
                    "To provide CRM, AI, and automation services on behalf of our subscribers and their clients",
                    "To send platform-related communications, product updates, and service announcements from Connecta Creators only",
                    "To analyze usage patterns and improve the platform's features and performance",
                    "To comply with legal obligations",
                  ].map((item, i) => <Bullet key={i}>{item}</Bullet>)}
                </ul>
              </>
            ),
          },
          {
            num: "3",
            title: "No Sale of Personal Data",
            content: (
              <>
                <div className="mb-4 p-4 rounded-xl" style={{ background: "rgba(8,145,178,0.06)", border: "1px solid rgba(8,145,178,0.2)" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(34,211,238,0.9)", letterSpacing: "0.02em" }}>
                    We do not sell, rent, trade, or otherwise transfer your personal data to any third party for their own marketing or commercial purposes. Period.
                  </p>
                </div>
                <P>
                  Your information is used solely to provide the services you have subscribed to. We may share data with trusted third-party service providers (such as Supabase for database hosting, Stripe for payments, and Twilio for SMS) only to the extent necessary to operate the platform. These providers are contractually obligated to protect your data and may not use it for any other purpose.
                </P>
              </>
            ),
          },
          {
            num: "4",
            title: "Marketing Communications",
            content: (
              <>
                <P>
                  By creating an account on Connecta Creators, you agree to receive platform-related communications from us, including service updates, feature announcements, billing notices, and occasional promotional messages — all sent exclusively by R3 Productions DBA Connecta Creators.
                </P>
                <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
                    <strong style={{ color: "rgba(255,255,255,0.8)" }}>You can unsubscribe at any time.</strong> Every marketing email includes an unsubscribe link. For SMS, reply <strong style={{ color: "rgba(255,255,255,0.8)" }}>STOP</strong> to any message. Opting out of marketing communications will not affect your ability to use the platform or receive transactional messages (such as billing receipts or password resets).
                  </p>
                </div>
              </>
            ),
          },
          {
            num: "5",
            title: "SMS Communication Disclosure",
            content: (
              <>
                <P>
                  By submitting a form, booking an appointment, or providing your phone number through our services, you consent to receive SMS text messages from Connecta Creators and/or the businesses that use our platform. These messages may include appointment confirmations, reminders, follow-ups, and other service-related communications.
                </P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  <Bullet>Message frequency varies depending on your interaction with our services.</Bullet>
                  <Bullet>Message and data rates may apply.</Bullet>
                  <Bullet>You may opt out at any time by replying <strong style={{ color: "rgba(255,255,255,0.8)" }}>STOP</strong> to any message.</Bullet>
                  <Bullet>For assistance, reply <strong style={{ color: "rgba(255,255,255,0.8)" }}>HELP</strong> or contact us at <a href="mailto:creatorsconnecta@gmail.com" style={{ color: "#22d3ee" }}>creatorsconnecta@gmail.com</a>.</Bullet>
                  <Bullet>Consent to receive SMS is not required to purchase any goods or services.</Bullet>
                </ul>
              </>
            ),
          },
          {
            num: "6",
            title: "Data Security",
            content: (
              <>
                <P>
                  We implement reasonable technical and organizational safeguards to protect your personal information from unauthorized access, disclosure, alteration, or destruction. Your data is stored on Supabase infrastructure with row-level security, encrypted connections (TLS/HTTPS), and access controls.
                </P>
                <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.75 }}>
                    <strong style={{ color: "rgba(255,255,255,0.65)" }}>Disclaimer:</strong> No method of electronic transmission or storage is 100% secure. While we strive to protect your data using commercially reasonable means, we cannot guarantee absolute security. In the event of a data breach that affects your personal information, we will notify you as required by applicable law. By using our services, you acknowledge and accept this inherent risk.
                  </p>
                </div>
              </>
            ),
          },
          {
            num: "7",
            title: "Data Retention",
            content: (
              <P>
                We retain your personal data for as long as your account is active or as needed to provide you services. If you close your account, we will delete or anonymize your personal data within 90 days, except where we are required by law to retain it longer (e.g., billing records for tax purposes, which may be retained for up to 7 years).
              </P>
            ),
          },
          {
            num: "8",
            title: "Your Rights",
            content: (
              <>
                <P>You have the right to:</P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  {[
                    "Access the personal data we hold about you",
                    "Request correction of inaccurate or incomplete data",
                    "Request deletion of your personal data (subject to legal retention requirements)",
                    "Withdraw consent to marketing communications at any time",
                    "Request a copy of your data in a portable format",
                  ].map((item, i) => <Bullet key={i}>{item}</Bullet>)}
                </ul>
                <p className="mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  To exercise any of these rights, contact us at <a href="mailto:creatorsconnecta@gmail.com" style={{ color: "#22d3ee" }}>creatorsconnecta@gmail.com</a>. We will respond within 30 days.
                </p>
              </>
            ),
          },
          {
            num: "9",
            title: "Governing Law",
            content: (
              <P>
                This Privacy Policy is governed by and construed in accordance with the laws of the State of <strong style={{ color: "rgba(255,255,255,0.85)" }}>Utah, United States</strong>, without regard to its conflict of law principles.
              </P>
            ),
          },
          {
            num: "10",
            title: "Changes to This Policy",
            content: (
              <P>
                We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. Any changes will be posted on this page with an updated effective date. We encourage you to review this policy periodically. Continued use of our services after any modification constitutes your acceptance of the updated policy.
              </P>
            ),
          },
          {
            num: "11",
            title: "Contact Us",
            content: (
              <>
                <P>If you have any questions about this Privacy Policy or wish to exercise your rights, please contact us:</P>
                <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(8,145,178,0.06)", border: "1px solid rgba(8,145,178,0.18)" }}>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>R3 Productions DBA Connecta Creators</strong><br />
                    State of Incorporation: Utah, USA<br />
                    Email: <a href="mailto:creatorsconnecta@gmail.com" style={{ color: "#22d3ee" }}>creatorsconnecta@gmail.com</a>
                  </p>
                </div>
              </>
            ),
          },
        ].map((section) => (
          <section key={section.num} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(8,145,178,0.5)", letterSpacing: "0.1em", minWidth: 24 }}>{section.num}.</span>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.01em" }}>{section.title}</h2>
            </div>
            <div style={{ paddingLeft: 32 }}>{section.content}</div>
          </section>
        ))}

        <div className="mt-16 pt-8" style={{ borderTop: "1px solid rgba(8,145,178,0.12)" }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>© 2026 Connecta Creators · R3 Productions DBA Connecta Creators · Utah, USA</span>
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
