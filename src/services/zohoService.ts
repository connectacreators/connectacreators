/**
 * Zoho Mail SMTP Service
 *
 * Sends emails via Zoho Mail using SMTP.
 * In production, replace this with API-based approach if needed.
 *
 * Configuration:
 * ZOHO_SMTP_HOST=smtp.zoho.com
 * ZOHO_SMTP_PORT=465 (SSL) or 587 (TLS)
 * ZOHO_EMAIL=your-email@zoho.com
 * ZOHO_PASSWORD=app-specific-password (not regular password)
 */

import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let transporter: any = null;

/**
 * Initialize Zoho SMTP transporter (lazy loaded)
 */
function getTransporter() {
  if (transporter) return transporter;

  const ZOHO_EMAIL = process.env.ZOHO_EMAIL;
  const ZOHO_PASSWORD = process.env.ZOHO_PASSWORD;
  const ZOHO_SMTP_HOST = process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com';
  const ZOHO_SMTP_PORT = parseInt(process.env.ZOHO_SMTP_PORT || '465');

  if (!ZOHO_EMAIL || !ZOHO_PASSWORD) {
    throw new Error('Zoho credentials not configured (ZOHO_EMAIL, ZOHO_PASSWORD)');
  }

  // Note: In a browser context, this won't work directly.
  // For production, this should be called from a Supabase Edge Function instead.
  // But we provide the implementation here for reference.

  try {
    transporter = nodemailer.createTransport({
      host: ZOHO_SMTP_HOST,
      port: ZOHO_SMTP_PORT,
      secure: ZOHO_SMTP_PORT === 465,
      auth: {
        user: ZOHO_EMAIL,
        pass: ZOHO_PASSWORD,
      },
    });
  } catch (error) {
    console.error('Error creating Zoho transporter:', error);
    throw error;
  }

  return transporter;
}

/**
 * Send email via Zoho SMTP
 *
 * NOTE: This function should typically be called from a Supabase Edge Function,
 * not directly from the client. Use via a backend/edge function wrapper.
 */
export const zohoService = {
  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    try {
      const transporter = getTransporter();
      const ZOHO_EMAIL = process.env.ZOHO_EMAIL;

      if (!ZOHO_EMAIL) {
        return {
          success: false,
          error: 'Zoho email not configured',
        };
      }

      const info = await transporter.sendMail({
        from: options.fromName
          ? `${options.fromName} <${ZOHO_EMAIL}>`
          : ZOHO_EMAIL,
        to: options.to,
        subject: options.subject,
        text: options.body,
        replyTo: options.replyTo || ZOHO_EMAIL,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Error sending email via Zoho:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /**
   * Verify SMTP connection
   */
  async verify(): Promise<boolean> {
    try {
      const transporter = getTransporter();
      await transporter.verify();
      console.log('Zoho SMTP connection verified');
      return true;
    } catch (error) {
      console.error('Zoho SMTP verification failed:', error);
      return false;
    }
  },
};
