const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10">
          Effective Date: February 14, 2026
        </p>

        <p className="mb-6 leading-relaxed">
          R3 Productions LLC, doing business as <strong>Connecta Creators</strong> ("we," "us," or "our"), operates the website{" "}
          <a href="https://connectacreators.com" className="text-primary underline">
            connectacreators.com
          </a>{" "}
          and provides CRM systems, automation tools, appointment booking systems, and SMS/email communication automation for our clients. This Privacy Policy explains how we collect, use, disclose, and safeguard your information.
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
          <p className="mb-3 leading-relaxed">
            We may collect the following personal information when you interact with our services:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
            <li>Name</li>
            <li>Phone number</li>
            <li>Email address</li>
            <li>Appointment information (date, time, service requested)</li>
            <li>Website interaction data (pages visited, clicks, device information)</li>
            <li>Form submission data collected through Facebook Instant Forms, landing pages, and booking systems</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
          <p className="mb-3 leading-relaxed">We use the information we collect to:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
            <li>Schedule and confirm appointments</li>
            <li>Send appointment reminders via SMS and email</li>
            <li>Respond to your inquiries and support requests</li>
            <li>Provide CRM and automation services on behalf of our clients</li>
            <li>Improve our services and overall user experience</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. SMS Communication Disclosure</h2>
          <p className="mb-3 leading-relaxed">
            By submitting a form, booking an appointment, or otherwise providing your phone number through our services, you consent to receive SMS text messages from Connecta Creators and/or our clients. These messages may include appointment confirmations, reminders, follow-ups, and other service-related communications.
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
            <li>Message frequency varies depending on your interaction with our services.</li>
            <li>Message and data rates may apply.</li>
            <li>
              You may opt out at any time by replying <strong>STOP</strong> to any message.
            </li>
            <li>
              For assistance, reply <strong>HELP</strong> to any message or contact us at{" "}
              <a href="mailto:creatorsconnecta@gmail.com" className="text-primary underline">
                creatorsconnecta@gmail.com
              </a>.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Information Sharing</h2>
          <p className="mb-3 leading-relaxed">
            Connecta Creators <strong>does not sell</strong> your personal data to third parties.
          </p>
          <p className="leading-relaxed">
            We may share your information with our clients only when you have directly requested services from those clients (e.g., booking an appointment through a client's form). All data sharing is strictly limited to operational and service-related purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Data Security</h2>
          <p className="leading-relaxed">
            We implement reasonable technical and organizational safeguards designed to protect your personal information from unauthorized access, disclosure, alteration, or destruction. However, no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
          <p className="leading-relaxed">
            You may request access to, correction of, or deletion of your personal data at any time by contacting us. We will respond to your request within a reasonable timeframe and in accordance with applicable laws.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Changes to This Policy</h2>
          <p className="leading-relaxed">
            We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date. We encourage you to review this policy periodically.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">8. Contact Us</h2>
          <p className="leading-relaxed">
            If you have any questions about this Privacy Policy or wish to exercise your rights, please contact us:
          </p>
          <p className="mt-3 text-muted-foreground">
            <strong className="text-foreground">Connecta Creators</strong> (R3 Productions LLC)<br />
            Email:{" "}
            <a href="mailto:creatorsconnecta@gmail.com" className="text-primary underline">
              creatorsconnecta@gmail.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
