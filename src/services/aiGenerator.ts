import type { Lead } from './leadService';

export interface GeneratedMessage {
  subject: string;
  body: string;
}

/**
 * Uses Claude API to generate contextual follow-up messages.
 * Short, direct, human-like, never mentions automation.
 */
export const aiGenerator = {
  async generateFollowUpMessage(
    lead: Lead,
    attempt: number,
    previousMessages?: string[]
  ): Promise<GeneratedMessage> {
    const ANTHROPIC_API_KEY = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Build context from previous messages
    const messageHistory = previousMessages
      ? previousMessages.map((msg, idx) => `Previous attempt ${idx + 1}: ${msg}`).join('\n')
      : '';

    const prompt = `Generate a short, natural follow-up message for a lead.

Lead Name: ${lead.name || 'Friend'}
Lead Email: ${lead.email}
Attempt: ${attempt} of 5
${messageHistory ? `\nPrevious Messages:\n${messageHistory}\n` : ''}

Requirements:
- Keep it under 100 words
- Sound human and conversational
- Use lead's first name if available
- Reference checking in (don't repeat exact previous wording)
- Include a soft call-to-action to book/respond
- Never mention automation, AI, sequences, or that this is a follow-up
- Be direct and friendly

Return ONLY the message text, no subject, no formatting. Just the body text.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Claude API error: ${error.error?.message || 'Unknown error'}`);
      }

      const result: any = await response.json();
      const bodyText = result.content[0]?.text || '';

      // Generate subject based on attempt
      const firstName = lead.name?.split(' ')[0] || '';
      const subjects = [
        `Hi ${firstName} – Quick Question`,
        `Checking in on your inquiry`,
        `${firstName}, one more thing`,
        `Last chance to see what works for you`,
        `${firstName}, let's connect`,
      ];

      return {
        subject: subjects[Math.min(attempt - 1, subjects.length - 1)],
        body: bodyText.trim(),
      };
    } catch (error) {
      console.error('Error generating message with Claude:', error);

      // Fallback message if Claude API fails
      const firstName = lead.name?.split(' ')[0] || 'Friend';
      const fallbackBodies = [
        `Hi ${firstName},\n\nJust reaching out to follow up. Let me know if you'd like to chat!`,
        `${firstName},\n\nChecking back in. Still interested? Happy to answer any questions.`,
        `Hi again ${firstName},\n\nOne more time – would love to help you out. When works best?`,
        `${firstName},\n\nLast check-in. If you're still interested, let's get on a call.`,
        `Final attempt ${firstName} – would be great to connect. Let me know!`,
      ];

      return {
        subject: attempt === 1
          ? `Hi ${firstName} – Quick Question`
          : `${firstName}, checking in`,
        body: fallbackBodies[Math.min(attempt - 1, fallbackBodies.length - 1)],
      };
    }
  },
};
