const TermsAndConditions = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Terms and Conditions</h1>
        <p className="text-muted-foreground mb-10">
          Effective Date: February 14, 2026
        </p>

        <p className="mb-6 leading-relaxed">
          These Terms and Conditions ("Terms") govern your use of the services provided by R3 Productions LLC, doing business as <strong>Connecta Creators</strong> ("we," "us," or "our"), through the website{" "}
          <a href="https://connectacreators.com" className="text-primary underline">
            connectacreators.com
          </a>{" "}
          and any related platforms. By accessing or using our services, you agree to be bound by these Terms.
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Service Description</h2>
          <p className="mb-3 leading-relaxed">
            Connecta Creators provides a suite of digital marketing and business automation tools, including but not limited to:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
            <li>Customer Relationship Management (CRM) software</li>
            <li>Appointment booking and scheduling systems</li>
            <li>SMS and email automation</li>
            <li>Marketing automation tools and workflows</li>
            <li>Lead management and tracking tools</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. SMS Messaging Consent</h2>
          <p className="mb-3 leading-relaxed">
            By submitting a form on our website, booking pages, or Facebook Instant Forms, you expressly consent to receive SMS text messages from Connecta Creators and/or our clients. These messages may include appointment confirmations, reminders, follow-ups, and other service-related communications.
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
          <p className="mt-3 leading-relaxed">
            Consent to receive SMS messages is not a condition of purchasing any goods or services.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. User Responsibilities</h2>
          <p className="leading-relaxed">
            By using our services, you agree to provide accurate and complete information when submitting forms, booking appointments, or interacting with our platform. You agree not to misuse our services, interfere with their operation, or use them for any unlawful purpose.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Opt-Out Policy</h2>
          <p className="leading-relaxed">
            You may opt out of SMS communications at any time by replying <strong>STOP</strong> to any message you receive from us. Upon receipt of your opt-out request, we will promptly cease sending SMS messages to your number. You may also contact us at{" "}
            <a href="mailto:creatorsconnecta@gmail.com" className="text-primary underline">
              creatorsconnecta@gmail.com
            </a>{" "}
            to request removal from our messaging lists.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Limitation of Liability</h2>
          <p className="leading-relaxed">
            Connecta Creators shall not be held liable for any delays, failures, or interruptions in service caused by third-party platforms, telecommunications providers, or circumstances beyond our reasonable control. Our services are provided on an "as is" and "as available" basis without warranties of any kind, express or implied.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
          <p className="leading-relaxed">
            All content, trademarks, and intellectual property associated with Connecta Creators and its platform are the property of R3 Productions LLC. You may not reproduce, distribute, or create derivative works from any of our materials without prior written consent.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Changes to These Terms</h2>
          <p className="leading-relaxed">
            We reserve the right to update or modify these Terms at any time. Any changes will be posted on this page with an updated effective date. Your continued use of our services after any modifications constitutes your acceptance of the revised Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">8. Contact Us</h2>
          <p className="leading-relaxed">
            If you have any questions about these Terms, please contact us:
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

export default TermsAndConditions;
