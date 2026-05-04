import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";

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

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#000", fontFamily: "inherit" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ top: "-10%", right: "40%", width: 700, height: 600, background: "radial-gradient(circle, rgba(132,204,22,1), transparent 70%)", opacity: 0.04, filter: "blur(140px)" }} />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-2 mb-12 transition-colors duration-200" style={{ fontSize: 13, color: "rgba(34,211,238,0.6)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#22d3ee")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(34,211,238,0.6)")}>
          <ArrowLeft size={14} /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: "rgba(8,145,178,0.12)", border: "1px solid rgba(8,145,178,0.25)" }}>
            <FileText size={18} style={{ color: "#22d3ee" }} />
          </div>
          <h1 className="text-3xl font-light tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>Terms of Service</h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 48, letterSpacing: "0.04em" }}>
          Effective Date: May 2, 2026 · Last Updated: May 2, 2026
        </p>

        <div className="mb-10" style={{ height: 1, background: "linear-gradient(90deg, rgba(8,145,178,0.3), transparent)" }} />

        <P>
          These Terms of Service ("Terms") constitute a legally binding agreement between you ("User," "Subscriber," or "you") and <strong style={{ color: "rgba(255,255,255,0.9)" }}>R3 Productions DBA Connecta Creators</strong> ("we," "us," or "our"), a business registered in the State of Utah, governing your access to and use of{" "}
          <a href="https://connectacreators.com" style={{ color: "#22d3ee", textDecoration: "underline" }}>connectacreators.com</a>{" "}
          and all related tools and services. By creating an account, checking the agreement box at signup, or otherwise using our services, you agree to be bound by these Terms. If you do not agree, do not use the platform.
        </P>

        <div style={{ height: 32 }} />

        {[
          {
            num: "1",
            title: "Service Description",
            content: (
              <>
                <P>Connecta Creators provides a subscription-based suite of AI-powered tools and business automation software, including but not limited to:</P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  {[
                    "AI script generation, teleprompter, and video transcription tools",
                    "Customer Relationship Management (CRM) software",
                    "Appointment booking and scheduling systems",
                    "SMS and email automation and follow-up sequences",
                    "Lead management, tracking, and calendar tools",
                    "Content calendar, editing queue, and viral video research",
                    "Super Planning Canvas and AI assistant tools",
                    "Custom landing page builder and booking page tools",
                  ].map((item, i) => <Bullet key={i}>{item}</Bullet>)}
                </ul>
                <p className="mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  We reserve the right to modify, add, or discontinue any feature of the platform at any time with or without notice.
                </p>
              </>
            ),
          },
          {
            num: "2",
            title: "No Guarantee of Results",
            content: (
              <>
                <div className="mb-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", lineHeight: 1.75, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
                  </p>
                </div>
                <P>
                  Connecta Creators makes no representations or warranties that use of the platform will result in any specific business outcomes, revenue, follower growth, content virality, lead generation, or other results. The effectiveness of any content, script, automation, or strategy generated through the platform depends entirely on factors outside our control, including but not limited to market conditions, platform algorithm changes, user implementation, and audience response.
                </P>
                <p className="mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  We disclaim all implied warranties including merchantability, fitness for a particular purpose, and non-infringement.
                </p>
              </>
            ),
          },
          {
            num: "3",
            title: "Limitation of Liability",
            content: (
              <>
                <div className="mb-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", lineHeight: 1.75, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, R3 PRODUCTIONS DBA CONNECTA CREATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES.
                  </p>
                </div>
                <P>
                  This includes but is not limited to: loss of revenue, loss of profits, loss of data, loss of business opportunities, business interruption, or any other commercial or economic loss — even if we have been advised of the possibility of such damages.
                </P>
                <p className="mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  In no event shall our total aggregate liability to you for all claims arising from or related to the use of the platform exceed the total subscription fees you paid to us in the <strong style={{ color: "rgba(255,255,255,0.7)" }}>twelve (12) months immediately preceding the claim</strong>. This limitation applies regardless of the form of action, whether in contract, tort, strict liability, or otherwise.
                </p>
              </>
            ),
          },
          {
            num: "4",
            title: "Indemnification",
            content: (
              <P>
                You agree to indemnify, defend, and hold harmless R3 Productions DBA Connecta Creators, its officers, directors, employees, agents, and contractors from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the platform; (b) your violation of these Terms; (c) content you submit, upload, or generate through the platform; (d) your violation of any applicable law or third-party rights; or (e) any claim by a third party related to services you provide using our platform.
              </P>
            ),
          },
          {
            num: "5",
            title: "Data & Privacy",
            content: (
              <>
                <P>
                  Your use of the platform is also governed by our <Link to="/privacy-policy" style={{ color: "#22d3ee", textDecoration: "underline" }}>Privacy Policy</Link>, which is incorporated by reference into these Terms. Key commitments:
                </P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  <Bullet><strong style={{ color: "rgba(255,255,255,0.8)" }}>We do not sell your personal data</strong> to any third party for marketing or commercial purposes.</Bullet>
                  <Bullet>Marketing communications will only come from Connecta Creators. You may unsubscribe at any time.</Bullet>
                  <Bullet>We implement commercially reasonable security measures. However, no system is 100% secure and we cannot guarantee that your data will never be compromised by unauthorized access. By using the platform, you acknowledge and accept this risk and agree that Connecta Creators shall not be liable for unauthorized access to your data resulting from circumstances beyond our reasonable control.</Bullet>
                </ul>
              </>
            ),
          },
          {
            num: "6",
            title: "Subscription & Billing",
            content: (
              <>
                <P>By subscribing, you agree to the following:</P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  {[
                    "Subscriptions are billed on a recurring basis (monthly or annually) as selected at checkout.",
                    "You authorize us to charge your payment method automatically at the start of each billing cycle.",
                    "You may cancel your subscription at any time through your account settings; access continues until the end of the current paid billing period.",
                    "Refunds are not issued for partial billing periods or unused time remaining on a subscription.",
                    "We reserve the right to modify pricing with 30 days' advance notice to active subscribers.",
                    "Failure to maintain a valid payment method may result in suspension or termination of access.",
                  ].map((item, i) => <Bullet key={i}>{item}</Bullet>)}
                </ul>
              </>
            ),
          },
          {
            num: "7",
            title: "SMS Messaging Consent",
            content: (
              <>
                <P>
                  By submitting a form, booking an appointment, or providing your phone number through our services, you expressly consent to receive SMS text messages from Connecta Creators and/or the businesses that use our platform. These messages may include appointment confirmations, reminders, follow-ups, and other service-related communications.
                </P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  <Bullet>Message frequency varies depending on your interaction with our services.</Bullet>
                  <Bullet>Message and data rates may apply.</Bullet>
                  <Bullet>You may opt out at any time by replying <strong style={{ color: "rgba(255,255,255,0.8)" }}>STOP</strong> to any message.</Bullet>
                  <Bullet>For assistance, reply <strong style={{ color: "rgba(255,255,255,0.8)" }}>HELP</strong> or contact <a href="mailto:creatorsconnecta@gmail.com" style={{ color: "#22d3ee" }}>creatorsconnecta@gmail.com</a>.</Bullet>
                  <Bullet>Consent to receive SMS is not required to purchase any goods or services.</Bullet>
                </ul>
              </>
            ),
          },
          {
            num: "8",
            title: "Acceptable Use",
            content: (
              <>
                <P>You agree not to use the platform to:</P>
                <ul className="space-y-2 mt-3" style={{ paddingLeft: 20 }}>
                  {[
                    "Upload, generate, or distribute unlawful, harmful, defamatory, or fraudulent content",
                    "Violate the intellectual property rights of any third party",
                    "Send unsolicited commercial messages (spam) to individuals who have not consented",
                    "Attempt to reverse engineer, hack, or disrupt the platform or its infrastructure",
                    "Use the platform in any manner that violates applicable local, state, federal, or international law",
                    "Impersonate any person or entity or misrepresent your affiliation with any person or entity",
                  ].map((item, i) => <Bullet key={i}>{item}</Bullet>)}
                </ul>
                <p className="mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  We reserve the right to suspend or terminate your account immediately and without notice for any violation of this section.
                </p>
              </>
            ),
          },
          {
            num: "9",
            title: "Intellectual Property",
            content: (
              <>
                <P>
                  All content, trademarks, trade names, logos, and intellectual property associated with Connecta Creators and its platform are the exclusive property of R3 Productions DBA Connecta Creators. You may not reproduce, distribute, modify, or create derivative works from any of our proprietary materials without prior written consent.
                </P>
                <p className="mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  Content you create using the platform (scripts, notes, uploads) remains your intellectual property. By using the platform, you grant us a limited, non-exclusive license to store and process that content solely for the purpose of delivering the service to you.
                </p>
              </>
            ),
          },
          {
            num: "10",
            title: "Suspension & Termination",
            content: (
              <P>
                We reserve the right to suspend or terminate your access to the platform at any time, with or without cause, and with or without notice, including for violation of these Terms, non-payment, or conduct we determine to be harmful to other users or to the platform. Upon termination, your right to access the platform ceases immediately. We are not liable to you or any third party for any termination of your account.
              </P>
            ),
          },
          {
            num: "11",
            title: "Force Majeure",
            content: (
              <P>
                Connecta Creators shall not be liable for any failure or delay in performance resulting from causes beyond our reasonable control, including but not limited to acts of God, natural disasters, pandemics, war, terrorism, government actions, power outages, internet infrastructure failures, cyberattacks, third-party platform outages (including but not limited to Supabase, Stripe, Twilio, or AI providers), or any other cause outside our direct control.
              </P>
            ),
          },
          {
            num: "12",
            title: "Dispute Resolution & Governing Law",
            content: (
              <>
                <P>
                  These Terms are governed by and construed in accordance with the laws of the State of <strong style={{ color: "rgba(255,255,255,0.85)" }}>Utah, United States</strong>, without regard to its conflict of law provisions.
                </P>
                <p className="mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                  Any dispute arising out of or relating to these Terms or the platform shall first be attempted to be resolved through good-faith negotiation. If unresolved, disputes shall be settled by binding arbitration in the State of Utah under the rules of the American Arbitration Association, rather than in court. <strong style={{ color: "rgba(255,255,255,0.7)" }}>You waive any right to participate in a class action lawsuit or class-wide arbitration against Connecta Creators.</strong>
                </p>
              </>
            ),
          },
          {
            num: "13",
            title: "Changes to These Terms",
            content: (
              <P>
                We reserve the right to update or modify these Terms at any time. Changes will be posted on this page with an updated effective date. Your continued use of the platform after any modification constitutes your acceptance of the revised Terms. It is your responsibility to review these Terms periodically.
              </P>
            ),
          },
          {
            num: "14",
            title: "Contact Us",
            content: (
              <>
                <P>If you have any questions about these Terms, please contact us:</P>
                <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(8,145,178,0.06)", border: "1px solid rgba(8,145,178,0.18)" }}>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>R3 Productions DBA Connecta Creators</strong><br />
                    State of Registration: Utah, USA<br />
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
