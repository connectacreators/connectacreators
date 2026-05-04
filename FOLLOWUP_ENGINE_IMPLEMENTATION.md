# Follow-Up Automation Engine - Implementation Guide

## 🎯 Overview

Rebuilt follow-up automation system that starts AFTER a Facebook lead is received. Uses Claude API to generate human-like follow-up messages and Zoho SMTP to send emails.

**Status**: Core services created, ready for integration and deployment.

---

## 📋 Schema Analysis & Mapping

### Leads Table (Existing - CONFIRMED)

The `leads` table already has all required fields:

```typescript
id                    // Lead unique ID
client_id            // Client/organization
name                 // Lead name
email                // Lead email (nullable)
phone                // Lead phone (nullable)
source               // Lead source (e.g., "facebook")
status               // Status string (e.g., "new", "contacted", etc.)
follow_up_step       // 🔑 ATTEMPT COUNTER (0-5, initialized to 0)
last_contacted_at    // Last contact timestamp
next_follow_up_at    // 🔑 NEXT ATTEMPT TIMESTAMP (used for scheduling)
booked               // 🔑 STOP: appointment confirmed
stopped              // 🔑 STOP: lead opted out / dead
replied              // 🔑 STOP: lead responded
created_at           // Lead created timestamp
```

### Messages Table (To Create)

Required for logging all inbound/outbound communications:

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, -- 'inbound' | 'outbound'
  channel TEXT NOT NULL,   -- 'email' | 'sms' | 'whatsapp'
  subject TEXT,            -- For email only
  body TEXT NOT NULL,      -- Message content
  sent_at TIMESTAMPTZ,     -- When actually sent
  read_at TIMESTAMPTZ,     -- When recipient read (future use)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_lead_id ON messages(lead_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

### State Storage Strategy

**Follow-up State**: Stored entirely in the `leads` table using existing fields:

| Field | Purpose | Type |
|-------|---------|------|
| `follow_up_step` | Attempt counter (1-5) | Integer |
| `next_follow_up_at` | When to send next attempt | Timestamp |
| `last_contacted_at` | When was contact last made | Timestamp |

**Stop Conditions** (also in `leads` table):
- `booked = true` → Lead booked appointment
- `replied = true` → Lead replied
- `stopped = true` → Lead opted out / marked dead
- `follow_up_step >= 5` → Max attempts reached

---

## 📁 Files Created

### 1. `/src/services/aiGenerator.ts` (145 lines)

Uses Claude API to generate contextual follow-up messages.

**Key Features:**
- ✅ Generates short, natural, human-like messages
- ✅ Uses lead name when available
- ✅ References previous attempts (no repetition)
- ✅ Soft CTA to book/respond
- ✅ Never mentions automation/AI
- ✅ Fallback messages if Claude API fails

**Constraints:**
- Max 100 words
- No mention of automation/sequences
- Friendly and conversational tone
- Returns `{ subject, body }`

**Exported:**
```typescript
export const aiGenerator = {
  async generateFollowUpMessage(
    lead: Lead,
    attempt: number,
    previousMessages?: string[]
  ): Promise<GeneratedMessage>
}
```

---

### 2. `/src/services/zohoService.ts` (95 lines)

Sends emails via Zoho SMTP.

**Configuration (env vars):**
```
ZOHO_EMAIL=your-email@zoho.com
ZOHO_PASSWORD=app-specific-password (NOT regular password)
ZOHO_SMTP_HOST=smtp.zoho.com (default)
ZOHO_SMTP_PORT=465 (SSL) or 587 (TLS)
```

**⚠️ Important Note:**
This uses `nodemailer` which runs server-side. For production:
- Option A: Wrap via Supabase Edge Function (RECOMMENDED)
- Option B: Use Zoho Mail API instead of SMTP
- Option C: Replace with SendGrid/Mailgun

**Exported:**
```typescript
export const zohoService = {
  async sendEmail(options: SendEmailOptions): Promise<EmailResult>,
  async verify(): Promise<boolean>
}
```

---

### 3. `/src/services/messageService.ts` (165 lines)

Abstraction layer for sending messages across channels.

**Key Features:**
- ✅ Logs all inbound/outbound messages to `messages` table
- ✅ Consistent interface for email/SMS/WhatsApp (SMS not configured yet)
- ✅ Retrieves message history for AI context
- ✅ Fetches last outbound message for follow-up context

**Exported:**
```typescript
export const messageService = {
  async logMessage(input: CreateMessageInput): Promise<Message>,
  async getMessageHistory(leadId: string, limit?: number): Promise<Message[]>,
  async sendMessage(options: SendMessageOptions): Promise<{ success: boolean }>,
  async getLastOutboundMessage(leadId: string): Promise<string | null>
}
```

**Channels Available:**
- `'email'` ← Implemented (via Zoho SMTP)
- `'sms'` ← Stubbed (ready for Twilio/Telnyx)
- `'whatsapp'` ← Stubbed (ready for Twilio)

---

### 4. `/src/services/followupEngine.ts` (310 lines)

Main orchestration engine - handles all follow-up logic.

**Follow-Up Schedule:**
```
Attempt 1: Immediate (via startFollowUp)
Attempt 2: +10 minutes
Attempt 3: +1 day
Attempt 4: +2 days
Attempt 5: +3 days
After 5:  Mark as stopped
```

**Stop Conditions (Checked Before Each Attempt):**
- `lead.booked === true`
- `lead.stopped === true`
- `lead.replied === true`
- `lead.follow_up_step >= 5`

**Exported:**
```typescript
export const followupEngine = {
  async startFollowUp(leadId: string): Promise<FollowUpResult>,
  async processFollowUp(leadId: string): Promise<FollowUpResult>,
  async getLeadsForFollowUp(): Promise<Lead[]>
}
```

**Flow:**

**startFollowUp()** (Attempt 1 - Immediate):
1. Load lead
2. Check stop conditions
3. Generate message via Claude (attempt 1)
4. Send email via Zoho
5. Log message to `messages` table
6. Update lead: `follow_up_step = 1`, `next_follow_up_at = now + 10 min`

**processFollowUp()** (Attempts 2-5):
1. Load lead
2. Check stop conditions
3. Get message history (for context)
4. Generate message via Claude (with previous context)
5. Send email via Zoho
6. Log message to `messages` table
7. Update lead: increment `follow_up_step`, set `next_follow_up_at`
8. If `follow_up_step >= 5`: set `stopped = true`

---

### 5. `/src/workers/followupWorker.ts` (235 lines)

Worker that runs every 5 minutes to process queued follow-ups.

**How It Works:**

Finds all leads where:
- `next_follow_up_at <= NOW()`
- `booked = false`
- `stopped = false`
- `replied = false`
- `follow_up_step < 5`

Then calls `followupEngine.processFollowUp()` for each.

**Exported:**
```typescript
export const followupWorker = {
  async processQueuedFollowUps(): Promise<WorkerStats>,
  async triggerImmediateFollowUp(leadId: string): Promise<boolean>,
  async getWorkerHealth(): Promise<{ leadsPending, nextLeads }>
}
```

**Deployment Options:**

1. **Supabase Edge Function with Cron** (RECOMMENDED):
   ```sql
   -- In Supabase Dashboard, create a cron job:
   select cron.schedule('process-followups', '*/5 * * * *',
     'select graphql_public.graphql($1)'::text,
     jsonb_build_object(
       'query', 'mutation { triggerFollowupWorker }'
     )
   );
   ```

2. **Client-Side Polling** (Development):
   ```typescript
   // In App.tsx
   useEffect(() => {
     const interval = setInterval(() => {
       followupWorker.processQueuedFollowUps();
     }, 5 * 60 * 1000);
     return () => clearInterval(interval);
   }, []);
   ```

3. **External Cron Service** (Node.js):
   ```typescript
   // Call worker.processQueuedFollowUps() every 5 minutes
   // via node-cron, Heroku scheduler, or AWS Lambda
   ```

---

## 🚀 Integration Checklist

### Phase 1: Database

- [ ] Create `messages` table (SQL above)
- [ ] Verify `leads` table has all fields (confirmed ✅)
- [ ] Test direct Supabase queries

### Phase 2: Environment Setup

- [ ] Add Zoho SMTP credentials:
  - `ZOHO_EMAIL`
  - `ZOHO_PASSWORD` (app-specific password, not regular)
  - `ZOHO_SMTP_HOST` (default: smtp.zoho.com)
  - `ZOHO_SMTP_PORT` (default: 465)

- [ ] Verify Claude API key:
  - `ANTHROPIC_API_KEY` (or `VITE_ANTHROPIC_API_KEY`)

### Phase 3: Integration Points

**After Facebook Lead Created** (in webhook handler):
```typescript
import { followupWorker } from '@/workers/followupWorker';

// In facebook-webhook-receiver edge function:
await followupWorker.triggerImmediateFollowUp(leadId);
```

**Every 5 Minutes** (set up cron or polling):
```typescript
import { followupWorker } from '@/workers/followupWorker';

// Call this every 5 minutes:
const stats = await followupWorker.processQueuedFollowUps();
console.log(`Processed ${stats.successful}/${stats.processed} leads`);
```

### Phase 4: Deployment

1. **Deploy `messages` table migration**
   - Run SQL in Supabase dashboard

2. **Deploy 5 new services/worker files**
   - No changes to other files needed
   - Services are self-contained

3. **Set up worker execution**
   - Choose: Edge Function Cron OR Client Polling OR External Job

4. **Wire up Facebook webhook**
   - Ensure webhook calls `followupWorker.triggerImmediateFollowUp(leadId)`

5. **Test end-to-end**
   - Create a test lead via Facebook form
   - Watch console logs in `/src/workers/followupWorker.ts`
   - Verify email received and logged in `messages` table

---

## 🧪 Testing

### Manual Test Flow

```typescript
// 1. Test AI message generation
import { aiGenerator } from '@/services/aiGenerator';
const msg = await aiGenerator.generateFollowUpMessage(lead, 1);
console.log(msg); // { subject, body }

// 2. Test follow-up engine
import { followupEngine } from '@/services/followupEngine';
const result = await followupEngine.startFollowUp(leadId);
console.log(result); // { success, leadId, attempt, messageId }

// 3. Test worker
import { followupWorker } from '@/workers/followupWorker';
const stats = await followupWorker.processQueuedFollowUps();
console.log(stats); // { processed, successful, failed, errors }

// 4. Check worker health
const health = await followupWorker.getWorkerHealth();
console.log(health); // { leadsPending, nextLeads }
```

### Verify in Supabase Dashboard

1. **Check `leads` table**:
   - `follow_up_step` = 1
   - `next_follow_up_at` = timestamp ~10 min from now
   - `last_contacted_at` = now

2. **Check `messages` table**:
   - New row with `direction = 'outbound'`, `channel = 'email'`
   - Contains generated subject and body

3. **Check logs**:
   - Console logs show message generation and sending

---

## 🔄 Data Flow Summary

```
Facebook Webhook
      ↓
Create Lead in DB (follow_up_step = 0)
      ↓
[IMMEDIATE] followupWorker.triggerImmediateFollowUp()
      ↓
followupEngine.startFollowUp()
      ├─ Generate message (Claude)
      ├─ Send email (Zoho)
      ├─ Log message
      └─ Update lead (attempt 1, next +10 min)
      ↓
[EVERY 5 MIN] followupWorker.processQueuedFollowUps()
      ↓
Find leads with next_follow_up_at <= NOW()
      ↓
For each due lead:
  ├─ followupEngine.processFollowUp()
  ├─ Generate message with context
  ├─ Send email
  ├─ Log message
  └─ Schedule next attempt (or mark stopped if >= 5)
      ↓
[IF BOOKED/REPLIED/STOPPED] Stop automatically
```

---

## ⚙️ Configuration

### Environment Variables Required

```
# Claude API
ANTHROPIC_API_KEY=sk-ant-...
VITE_ANTHROPIC_API_KEY=sk-ant-...

# Zoho SMTP
ZOHO_EMAIL=your-email@zoho.com
ZOHO_PASSWORD=<app-specific-password>
ZOHO_SMTP_HOST=smtp.zoho.com
ZOHO_SMTP_PORT=465
```

### Supabase Configuration

- RLS Policies: Ensure services can read/write `leads` and `messages` tables
- Schema: Create `messages` table per SQL above

---

## 📊 Monitoring & Debugging

### Worker Health Check

```typescript
const health = await followupWorker.getWorkerHealth();
// Returns:
// {
//   leadsPending: 5,
//   nextLeads: [
//     { id: 'xxx', name: 'John Doe', dueAt: '2026-02-27T15:30:00Z' },
//     ...
//   ]
// }
```

### Console Logs (Grep Pattern)

```bash
# In browser DevTools or server logs:
[FollowUp]       - Main engine logs
[FollowUpWorker] - Worker cycle logs
[MessageService] - Message sending logs
```

### Error Handling

- All functions return structured results with `success` boolean
- Errors are logged but don't crash the system
- Failed attempts are retried in next 5-min cycle

---

## 🎓 Future Enhancements

1. **SMS Channel**: Add Twilio/Telnyx via same `messageService` abstraction
2. **WhatsApp**: Add Twilio WhatsApp API
3. **Webhook Inbound**: Process replies/bounces from email platform
4. **Template System**: Replace hardcoded fallback messages with templates
5. **A/B Testing**: Track open rates, reply rates, booking rates
6. **Personalization**: Use Notion data or customer history in messages
7. **Manual Intervention**: UI to pause/resume/skip leads

---

## 📝 Summary

| Component | Status | Purpose |
|-----------|--------|---------|
| aiGenerator.ts | ✅ Ready | Claude-powered message generation |
| zohoService.ts | ⚠️ Needs Setup | Zoho SMTP email delivery |
| messageService.ts | ✅ Ready | Message logging & abstraction |
| followupEngine.ts | ✅ Ready | Follow-up orchestration |
| followupWorker.ts | ✅ Ready | Scheduled processing |
| messages table | 📋 To Create | Communication log |

**Zero changes** to existing files. New system is completely decoupled.

