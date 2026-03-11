/**
 * send-followup
 *
 * Generates an AI email and sends it to a lead via the client's SMTP credentials.
 * Logs the message to the messages table and advances the lead's follow_up_step.
 *
 * POST body: { lead_id: string, client_id?: string }
 * Returns: { success: boolean, attempt: number, error?: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Follow-up schedule: step → delay in milliseconds added to now
// Step 0: immediately (set to now so queue picks it up right away)
// Steps 1-4: subsequent delays
const STEP_DELAYS_MS = [
  0,                           // step 0 → immediate (already sent, next is step 1)
  1 * 24 * 60 * 60 * 1000,   // step 1 → +1 day
  3 * 24 * 60 * 60 * 1000,   // step 2 → +3 days
  7 * 24 * 60 * 60 * 1000,   // step 3 → +7 days
  14 * 24 * 60 * 60 * 1000,  // step 4 → +14 days
];

const SUBJECTS = [
  'Quick question for you',
  'Following up — still interested?',
  'One more thing...',
  'Last follow-up from us',
  'Closing your file soon',
];

function getSmtpConfig(email: string): { host: string; port: number; secure: boolean } {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  if (domain.includes('gmail') || domain.includes('googlemail')) {
    return { host: 'smtp.gmail.com', port: 587, secure: false };
  }
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live') || domain.includes('msn')) {
    return { host: 'smtp-mail.outlook.com', port: 587, secure: false };
  }
  if (domain.includes('yahoo')) {
    return { host: 'smtp.mail.yahoo.com', port: 587, secure: false };
  }
  if (domain.includes('icloud') || domain.includes('me.com') || domain.includes('mac.com')) {
    return { host: 'smtp.mail.me.com', port: 587, secure: false };
  }
  // Generic fallback — try port 587 STARTTLS
  return { host: `smtp.${domain}`, port: 587, secure: false };
}

async function generateEmailBody(
  lead: { name: string; email: string; source?: string },
  clientName: string,
  attempt: number,
  anthropicKey: string
): Promise<string> {
  const attemptDescriptions = [
    'first outreach email — warm, friendly, brief introduction',
    'second follow-up — gently checking if they saw the first email',
    'third follow-up — adds a small piece of value or insight',
    'fourth follow-up — creates mild urgency without pressure',
    'final follow-up — brief, respectful sign-off',
  ];

  const prompt = `Write a short, personalized follow-up email body for a marketing agency called "${clientName}".

Lead name: ${lead.name}
Lead source: ${lead.source || 'Online'}
Email attempt: ${attempt + 1} of 5 (${attemptDescriptions[attempt] || 'follow-up'})

Rules:
- 2-4 short paragraphs maximum
- Conversational and human tone, not salesy
- Do NOT include subject line, greeting salutation, or sign-off — just the body paragraphs
- Do NOT use placeholders like [Your Name] or [Company]
- Reference their name naturally once
- Keep it under 150 words`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || getFallbackBody(lead.name, clientName, attempt);
  } catch (err) {
    console.error('[send-followup] AI generation failed, using fallback:', err);
    return getFallbackBody(lead.name, clientName, attempt);
  }
}

function getFallbackBody(leadName: string, clientName: string, attempt: number): string {
  const bodies = [
    `Hi ${leadName},\n\nI noticed you recently showed interest in what we're doing at ${clientName}. I'd love to connect and learn more about what you're looking for.\n\nWould you have 15 minutes this week for a quick call?`,
    `Hi ${leadName},\n\nJust wanted to make sure my previous message didn't get lost in your inbox. We help businesses like yours achieve real results — and I think there's a fit here.\n\nLet me know if you'd like to chat.`,
    `Hi ${leadName},\n\nI'll keep this short — I genuinely think we can help you. Many of our clients see results within the first 30 days.\n\nWould a brief call make sense this week?`,
    `Hi ${leadName},\n\nI don't want to keep filling your inbox, but I wanted to reach out one more time. If the timing isn't right, no worries at all — just let me know.\n\nEither way, I hope things are going well for you.`,
    `Hi ${leadName},\n\nI'll leave this as my final note. If you ever decide you'd like to explore how ${clientName} can help, my door is always open.\n\nWishing you all the best.`,
  ];
  return bodies[attempt] || bodies[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ success: false, error: 'lead_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch the lead
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, name, email, phone, source, client_id, follow_up_step, booked, stopped, replied')
      .eq('id', lead_id)
      .single();

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ success: false, error: 'Lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = lead.client_id;
    const step = lead.follow_up_step || 0;

    // 2. Check stop conditions
    if (lead.booked || lead.stopped || lead.replied || step >= 5) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Lead is booked/stopped/replied or max attempts reached' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lead.email) {
      return new Response(JSON.stringify({ success: false, error: 'Lead has no email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch the client's email settings
    const { data: emailSettings, error: settingsErr } = await supabase
      .from('client_email_settings')
      .select('smtp_email, smtp_password, from_name')
      .eq('client_id', clientId)
      .maybeSingle();

    if (settingsErr || !emailSettings) {
      return new Response(
        JSON.stringify({ success: false, error: 'Client email settings not configured. Please add SMTP credentials in the Follow-Up Automation settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Fetch client name for AI context
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle();

    const clientName = client?.name || 'Our Company';

    // 5. Generate AI email body
    const subject = SUBJECTS[step] || `Following up`;
    const body = await generateEmailBody(lead, clientName, step, anthropicKey);

    // 6. Send via SMTP (nodemailer)
    const smtpConfig = getSmtpConfig(emailSettings.smtp_email);
    const fromName = emailSettings.from_name || clientName;
    const fromAddress = `${fromName} <${emailSettings.smtp_email}>`;

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: emailSettings.smtp_email,
        pass: emailSettings.smtp_password,
      },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: fromAddress,
      to: lead.email,
      subject,
      text: body,
      html: body.split('\n\n').map((p: string) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''),
    });

    // 7. Log message to messages table
    await supabase.from('messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      channel: 'email',
      subject,
      body,
      sent_at: new Date().toISOString(),
    });

    // 8. Advance lead state
    const nextStep = step + 1;
    let nextFollowUpAt: string | null = null;

    if (nextStep < 5) {
      const delayMs = STEP_DELAYS_MS[nextStep] || STEP_DELAYS_MS[STEP_DELAYS_MS.length - 1];
      nextFollowUpAt = new Date(Date.now() + delayMs).toISOString();
    }

    await supabase.from('leads').update({
      follow_up_step: nextStep,
      last_contacted_at: new Date().toISOString(),
      next_follow_up_at: nextFollowUpAt,
    }).eq('id', lead.id);

    console.log(`[send-followup] ✓ Sent attempt ${step + 1}/5 to ${lead.email} for lead ${lead_id}`);

    return new Response(
      JSON.stringify({ success: true, attempt: step + 1, next_step: nextStep, scheduled_at: nextFollowUpAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[send-followup] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
