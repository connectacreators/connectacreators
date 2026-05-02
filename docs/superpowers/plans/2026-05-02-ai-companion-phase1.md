# AI Companion Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a named AI companion with a floating bubble on every page, a dedicated Command Center page, a first-login naming modal, a task-generation edge function, and a chat edge function — all bilingual (EN/ES).

**Architecture:** `CompanionContext` holds global state (name, tasks, open/close). `CompanionBubble` renders at the App root as a floating overlay. `NamingModal` fires once on first login. Two new Supabase edge functions (`get-companion-tasks`, `companion-chat`) power the intelligence layer. The Command Center is a new page at `/ai`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Supabase (DB + edge functions), Claude API (Haiku 4.5), Lucide icons, existing `tr()` / `useLanguage()` i18n system

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260502_companion.sql` | companion_state + companion_messages tables |
| Create | `src/contexts/CompanionContext.tsx` | Global companion state, tasks, open/close |
| Create | `src/components/NamingModal.tsx` | First-login AI naming popup |
| Create | `supabase/functions/get-companion-tasks/index.ts` | Reads DB state → returns task list |
| Create | `supabase/functions/companion-chat/index.ts` | Claude chat with brand context |
| Create | `src/components/CompanionBubble.tsx` | Floating bubble + compact panel |
| Create | `src/pages/CommandCenter.tsx` | Full `/ai` Command Center page |
| Modify | `src/App.tsx` | Add provider, bubble, modal, `/ai` route |
| Modify | `src/components/DashboardSidebar.tsx` | Add bot nav icon with badge |

---

### Task 1: DB Migration — companion tables

**Files:**
- Create: `supabase/migrations/20260502_companion.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- companion_state: one row per client, stores name + setup flag + workflow context
CREATE TABLE IF NOT EXISTS companion_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  companion_name text NOT NULL DEFAULT 'AI',
  companion_setup_done boolean NOT NULL DEFAULT false,
  workflow_context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- companion_messages: chat history per client
CREATE TABLE IF NOT EXISTS companion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companion_messages_client_created
  ON companion_messages(client_id, created_at DESC);

-- RLS
ALTER TABLE companion_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companion_state_owner" ON companion_state FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM subscriber_clients WHERE subscriber_user_id = auth.uid()
  )
);

CREATE POLICY "companion_messages_owner" ON companion_messages FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM subscriber_clients WHERE subscriber_user_id = auth.uid()
  )
);
```

- [ ] **Step 2: Apply the migration**

```bash
cd /Users/admin/Documents/connectacreators
npx supabase db push 2>&1 | tail -10
```

Expected: `Applying migration 20260502_companion.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502_companion.sql
git commit -m "feat(companion): add companion_state and companion_messages tables"
```

---

### Task 2: CompanionContext — global state

**Files:**
- Create: `src/contexts/CompanionContext.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CompanionTask {
  id: string;
  titleEn: string;
  titleEs: string;
  subtitleEn: string;
  subtitleEs: string;
  priority: "red" | "amber" | "blue";
  actionLabelEn: string;
  actionLabelEs: string;
  skipLabelEn: string;
  skipLabelEs: string;
  actionPath: string;
}

interface CompanionContextType {
  companionName: string;
  setCompanionName: (name: string) => void;
  setupDone: boolean;
  setSetupDone: (done: boolean) => void;
  tasks: CompanionTask[];
  refreshTasks: () => Promise<void>;
  clientId: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  loadingTasks: boolean;
}

const CompanionContext = createContext<CompanionContextType | null>(null);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companionName, setCompanionName] = useState("AI");
  const [setupDone, setSetupDone] = useState(true);
  const [tasks, setTasks] = useState<CompanionTask[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Resolve primary client ID
  useEffect(() => {
    if (!user) { setClientId(null); return; }
    supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setClientId(data.id); });
  }, [user]);

  // Load companion state once client is known
  useEffect(() => {
    if (!clientId) return;
    supabase.from("companion_state").select("companion_name, companion_setup_done")
      .eq("client_id", clientId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCompanionName(data.companion_name);
          setSetupDone(data.companion_setup_done);
        } else {
          setSetupDone(false);
        }
      });
  }, [clientId]);

  const refreshTasks = useCallback(async () => {
    if (!clientId) return;
    setLoadingTasks(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.functions.invoke("get-companion-tasks", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (data?.tasks) setTasks(data.tasks);
    } finally {
      setLoadingTasks(false);
    }
  }, [clientId]);

  useEffect(() => { if (clientId) refreshTasks(); }, [clientId, refreshTasks]);

  return (
    <CompanionContext.Provider value={{
      companionName, setCompanionName,
      setupDone, setSetupDone,
      tasks, refreshTasks,
      clientId,
      isOpen, setIsOpen,
      loadingTasks,
    }}>
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCompanion must be used within CompanionProvider");
  return ctx;
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/admin/Documents/connectacreators && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/CompanionContext.tsx
git commit -m "feat(companion): add CompanionContext with task list and state management"
```

---

### Task 3: NamingModal — first-login popup

**Files:**
- Create: `src/components/NamingModal.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from "react";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";

const SUGGESTIONS = ["Max", "Luna", "Nova", "Ace", "Rio", "Zara"];

export default function NamingModal() {
  const { setupDone, setSetupDone, setCompanionName, clientId } = useCompanion();
  const { language } = useLanguage();
  const en = language === "en";
  const [name, setName] = useState("Max");
  const [saving, setSaving] = useState(false);

  if (setupDone || !clientId) return null;

  const saveAndClose = async (chosenName: string) => {
    setSaving(true);
    const finalName = chosenName.trim() || "AI";
    await supabase.from("companion_state").upsert(
      { client_id: clientId, companion_name: finalName, companion_setup_done: true },
      { onConflict: "client_id" }
    );
    setCompanionName(finalName);
    setSetupDone(true);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(6px)", background: "rgba(6,10,15,0.75)" }}
    >
      <div
        className="w-[300px] overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: "#111827", border: "1px solid rgba(8,145,178,0.25)" }}
      >
        {/* Header */}
        <div
          className="px-6 pt-8 pb-6 text-center"
          style={{ background: "linear-gradient(160deg,#0c1a2e,#0f2040)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)", boxShadow: "0 0 30px rgba(8,145,178,0.4)" }}
          >
            <Bot className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">
            {en ? "Welcome to Connecta" : "Bienvenido a Connecta"}
          </h2>
          <p className="text-sm text-white/40 leading-relaxed">
            {en
              ? "Your AI assistant is ready. What should we call it?"
              : "Tu asistente de IA está listo. ¿Cómo lo llamamos?"}
          </p>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-2">
            {en ? "Name your assistant" : "Nombra a tu asistente"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="w-full text-center text-sm font-semibold text-white rounded-xl px-4 py-3 outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1.5px solid rgba(8,145,178,0.3)",
              boxShadow: "0 0 0 3px rgba(8,145,178,0.08)",
            }}
          />
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setName(s)}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors hover:text-[#22d3ee]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            disabled={saving || !name.trim()}
            onClick={() => saveAndClose(name)}
            className="mt-4 w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all hover:brightness-110"
            style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)", boxShadow: "0 4px 20px rgba(8,145,178,0.35)" }}
          >
            {en ? `Start with ${name || "AI"} →` : `Empezar con ${name || "AI"} →`}
          </button>
          <button
            onClick={() => saveAndClose("AI")}
            className="w-full text-center text-[11px] text-white/25 mt-3 hover:text-white/40 transition-colors"
          >
            {en ? "Skip, I'll name it later" : "Saltar, lo nombraré después"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/NamingModal.tsx
git commit -m "feat(companion): add NamingModal for first-login AI naming flow"
```

---

### Task 4: get-companion-tasks edge function

**Files:**
- Create: `supabase/functions/get-companion-tasks/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Get client record
    const { data: client } = await adminClient
      .from("clients")
      .select("id, onboarding_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ tasks: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = client.id;
    const tasks = [];

    // 1. Onboarding incomplete (red)
    const od = client.onboarding_data || {};
    const onboardingDone = od && Object.keys(od).length >= 3;
    if (!onboardingDone) {
      tasks.push({
        id: "onboarding",
        titleEn: "Let's finish setting up your profile",
        titleEs: "Terminemos de configurar tu perfil",
        subtitleEn: "Your AI needs to know your brand and audience to help you.",
        subtitleEs: "Tu IA necesita conocer tu marca y audiencia para ayudarte.",
        priority: "red",
        actionLabelEn: "Complete profile",
        actionLabelEs: "Completar perfil",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/onboarding",
      });
    }

    // 2. No recent script (red if 5+ days)
    const { data: recentScript } = await adminClient
      .from("scripts")
      .select("created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysSinceScript = recentScript
      ? Math.floor((Date.now() - new Date(recentScript.created_at).getTime()) / 86400000)
      : 999;

    if (daysSinceScript >= 5) {
      const daysLabel = daysSinceScript >= 999 ? "a while" : `${daysSinceScript} days`;
      const daysLabelEs = daysSinceScript >= 999 ? "un tiempo" : `${daysSinceScript} días`;
      tasks.push({
        id: "no_recent_script",
        titleEn: `You haven't posted in ${daysLabel}`,
        titleEs: `No has publicado en ${daysLabelEs}`,
        subtitleEn: "Your AI is ready to help you create something great. Let's go.",
        subtitleEs: "Tu IA está lista para ayudarte a crear algo genial. Vamos.",
        priority: "red",
        actionLabelEn: "Let's do it",
        actionLabelEs: "Vamos a hacerlo",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/scripts",
      });
    }

    // 3. Approved script not filmed yet (amber)
    const { data: approvedScripts } = await adminClient
      .from("scripts")
      .select("id")
      .eq("client_id", clientId)
      .eq("review_status", "approved")
      .limit(1);

    if (approvedScripts && approvedScripts.length > 0) {
      tasks.push({
        id: "time_to_film",
        titleEn: "Time to film",
        titleEs: "Es hora de filmar",
        subtitleEn: "Your script is approved. Upload your footage and your editor handles the rest.",
        subtitleEs: "Tu guión está aprobado. Sube tu metraje y tu editor se encarga del resto.",
        priority: "amber",
        actionLabelEn: "Upload footage",
        actionLabelEs: "Subir metraje",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/editing-queue",
      });
    }

    // 4. Video edit with no assignee (amber)
    const { data: stalledEdits } = await adminClient
      .from("video_edits")
      .select("id")
      .eq("client_id", clientId)
      .is("assignee", null)
      .is("deleted_at", null)
      .limit(1);

    if (stalledEdits && stalledEdits.length > 0) {
      tasks.push({
        id: "stalled_edit",
        titleEn: "Your video needs an editor",
        titleEs: "Tu video necesita un editor",
        subtitleEn: "Footage is uploaded but no editor is assigned yet.",
        subtitleEs: "El metraje está subido pero aún no hay editor asignado.",
        priority: "amber",
        actionLabelEn: "View editing queue",
        actionLabelEs: "Ver cola de edición",
        skipLabelEn: "Skip",
        skipLabelEs: "Omitir",
        actionPath: "/editing-queue",
      });
    }

    // 5. Calendar empty next 7 days (blue)
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const { data: calendarItems } = await adminClient
      .from("video_edits")
      .select("id")
      .eq("client_id", clientId)
      .gte("schedule_date", today)
      .lte("schedule_date", nextWeek)
      .is("deleted_at", null)
      .limit(1);

    if (!calendarItems || calendarItems.length === 0) {
      tasks.push({
        id: "empty_calendar",
        titleEn: "Next week's calendar is empty",
        titleEs: "El calendario de la próxima semana está vacío",
        subtitleEn: "Once your content is ready, your AI can schedule it automatically.",
        subtitleEs: "Una vez que tu contenido esté listo, tu IA puede programarlo automáticamente.",
        priority: "blue",
        actionLabelEn: "View calendar",
        actionLabelEs: "Ver calendario",
        skipLabelEn: "Skip",
        skipLabelEs: "Omitir",
        actionPath: "/content-calendar",
      });
    }

    return new Response(JSON.stringify({ tasks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy get-companion-tasks --no-verify-jwt 2>&1 | tail -5
```

Expected: `Deployed Functions get-companion-tasks`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/get-companion-tasks/
git commit -m "feat(companion): add get-companion-tasks edge function"
```

---

### Task 5: companion-chat edge function

**Files:**
- Create: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { message, companion_name } = await req.json() as { message: string; companion_name: string };
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: client } = await adminClient
      .from("clients")
      .select("id, name, onboarding_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "No client found" }), { status: 400, headers: corsHeaders });
    }

    // Last 20 messages for context
    const { data: history } = await adminClient
      .from("companion_messages")
      .select("role, content")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const priorMessages = (history || []).reverse().map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Build brand context
    const od = client.onboarding_data || {};
    const brandLines = [
      od.business_name && `Business: ${od.business_name}`,
      od.industry && `Industry: ${od.industry}`,
      od.unique_offer && `Unique offer: ${od.unique_offer}`,
      od.target_client && `Target audience: ${od.target_client}`,
      od.unique_values && `Key values: ${od.unique_values}`,
    ].filter(Boolean).join("\n");

    const name = companion_name || "AI";
    const systemPrompt = `You are ${name}, a friendly AI assistant for Connecta Creators — a content creation platform.

Your job: guide users step by step through creating great content, even if they know nothing about marketing. You do the thinking, they make decisions.

User's name: ${client.name || "there"}
${brandLines ? `\nBrand context:\n${brandLines}` : ""}

Rules:
- Always speak plain English (or Spanish if they write in Spanish — detect automatically).
- Be warm, encouraging, and direct. Like a good coach.
- Keep replies short: 2–4 sentences max unless they ask for detail.
- Refer to yourself as "${name}" when natural.
- If they ask where to find something, point them to the right page: Scripts, Vault, Viral Today, Editing Queue, Content Calendar, Subscription.
- Never use jargon like "pipeline", "leverage", "synergy", or "streamline".`;

    // Save user message
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "user",
      content: message,
    });

    // Prune to 50 messages
    const { data: allMsgs } = await adminClient
      .from("companion_messages")
      .select("id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (allMsgs && allMsgs.length > 50) {
      const toDelete = allMsgs.slice(50).map((m: any) => m.id);
      await adminClient.from("companion_messages").delete().in("id", toDelete);
    }

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        messages: [...priorMessages, { role: "user", content: message }],
      }),
    });

    const result = await claudeRes.json();
    const reply: string = result.content?.[0]?.text || "I'm here — what do you need?";

    // Save assistant reply
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "assistant",
      content: reply,
    });

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy companion-chat --no-verify-jwt 2>&1 | tail -5
```

Expected: `Deployed Functions companion-chat`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/companion-chat/
git commit -m "feat(companion): add companion-chat edge function with Claude and brand context"
```

---

### Task 6: CompanionBubble — floating bubble + compact panel

**Files:**
- Create: `src/components/CompanionBubble.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, X, ChevronRight, Mic, Send } from "lucide-react";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function CompanionBubble() {
  const { companionName, tasks, isOpen, setIsOpen, refreshTasks } = useCompanion();
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const en = language === "en";
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [panelMessages, setPanelMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  const urgentTasks = tasks.filter((t) => t.priority === "red" || t.priority === "amber").slice(0, 2);
  const badgeCount = tasks.filter((t) => t.priority === "red" || t.priority === "amber").length;

  const sendMessage = async () => {
    if (!chatInput.trim() || sending || !user) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setSending(true);
    setPanelMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.functions.invoke("companion-chat", {
        body: { message: userMsg, companion_name: companionName },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (data?.reply) {
        setPanelMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-50 w-13 h-13 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ width: 52, height: 52, background: "linear-gradient(135deg,#0891B2,#84CC16)", boxShadow: "0 4px 24px rgba(8,145,178,0.45)" }}
        aria-label={en ? `Open ${companionName}` : `Abrir ${companionName}`}
      >
        {/* Animated ring when tasks pending */}
        {badgeCount > 0 && !isOpen && (
          <span
            className="absolute inset-[-5px] rounded-full border-2 border-[rgba(8,145,178,0.4)] animate-ping"
            style={{ animationDuration: "2.2s" }}
          />
        )}
        {isOpen ? <X className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
        {/* Badge */}
        {badgeCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badgeCount}
          </span>
        )}
      </button>

      {/* Compact panel */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-5 z-50 w-[340px] rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: "#111827", border: "1px solid rgba(8,145,178,0.2)", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}
        >
          {/* Panel header */}
          <div
            className="flex items-center gap-3 px-4 py-3.5"
            style={{ background: "linear-gradient(135deg,#0c1524,#111d35)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
            >
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{companionName}</p>
              <p className="text-[10px] text-white/35 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse inline-block" />
                {en ? "Online" : "En línea"}
              </p>
            </div>
            <button
              onClick={() => { navigate("/ai"); setIsOpen(false); }}
              className="text-[11px] font-semibold text-[#22d3ee] flex items-center gap-0.5 hover:opacity-80 transition-opacity"
            >
              {en ? "See all" : "Ver todo"} <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Urgent tasks */}
          {urgentTasks.length > 0 && panelMessages.length === 0 && (
            <div className="px-3 pt-3 space-y-2">
              {urgentTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl p-3 flex items-start gap-2.5"
                  style={{
                    background: task.priority === "red" ? "rgba(239,68,68,0.04)" : "rgba(245,158,11,0.04)",
                    border: `1px solid ${task.priority === "red" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.18)"}`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: task.priority === "red" ? "#ef4444" : "#f59e0b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white leading-tight">
                      {en ? task.titleEn : task.titleEs}
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">
                      {en ? task.subtitleEn : task.subtitleEs}
                    </p>
                  </div>
                  <button
                    onClick={() => { navigate(task.actionPath); setIsOpen(false); }}
                    className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-opacity hover:opacity-80"
                    style={{ background: "rgba(8,145,178,0.15)", color: "#22d3ee", border: "1px solid rgba(8,145,178,0.25)" }}
                  >
                    {en ? task.actionLabelEn : task.actionLabelEs}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Chat messages */}
          {panelMessages.length > 0 && (
            <div className="px-3 pt-3 space-y-2 max-h-[200px] overflow-y-auto">
              {panelMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}>
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div
                    className="max-w-[220px] text-[12px] px-3 py-2 rounded-xl leading-relaxed"
                    style={msg.role === "assistant"
                      ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", borderRadius: "4px 12px 12px 12px" }
                      : { background: "linear-gradient(135deg,#0891B2,#0e7490)", color: "#fff", borderRadius: "12px 4px 12px 12px" }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}>
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex gap-1 items-center px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat input */}
          <div className="p-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 8 }}>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={en ? `Ask ${companionName}...` : `Pregúntale a ${companionName}...`}
                className="flex-1 bg-transparent text-[12px] text-white/70 placeholder:text-white/25 outline-none"
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || sending}
                className="w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity"
                style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
              >
                <Send className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CompanionBubble.tsx
git commit -m "feat(companion): add floating CompanionBubble with compact panel and chat"
```

---

### Task 7: CommandCenter page — `/ai`

**Files:**
- Create: `src/pages/CommandCenter.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Send } from "lucide-react";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import PageTransition from "@/components/PageTransition";

type Tab = "todo" | "inprogress" | "done";

export default function CommandCenter() {
  const { companionName, tasks, loadingTasks, refreshTasks } = useCompanion();
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const en = language === "en";
  const [tab, setTab] = useState<Tab>("todo");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const todoTasks = tasks.filter((t) => !dismissedIds.has(t.id));
  const urgentCount = todoTasks.filter((t) => t.priority === "red" || t.priority === "amber").length;

  const sendMessage = async () => {
    if (!chatInput.trim() || sending || !user) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setSending(true);
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.functions.invoke("companion-chat", {
        body: { message: userMsg, companion_name: companionName },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (data?.reply) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
    } finally {
      setSending(false);
    }
  };

  const dotColor: Record<string, string> = {
    red: "#ef4444",
    amber: "#f59e0b",
    blue: "#22d3ee",
  };

  return (
    <PageTransition className="flex flex-col h-full max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
        >
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black text-foreground">{companionName}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse inline-block" />
            {urgentCount > 0
              ? (en ? `${urgentCount} things need your attention` : `${urgentCount} cosas necesitan tu atención`)
              : (en ? "You're all caught up" : "Estás al día")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/40 mb-4">
        {([
          { key: "todo", enLabel: "To Do", esLabel: "Por Hacer", count: todoTasks.length },
          { key: "done", enLabel: "Done", esLabel: "Hecho", count: 0 },
        ] as { key: Tab; enLabel: string; esLabel: string; count: number }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-[11px] font-semibold relative flex items-center gap-1.5 transition-colors"
            style={{ color: tab === t.key ? "#22d3ee" : "rgba(255,255,255,0.3)" }}
          >
            {en ? t.enLabel : t.esLabel}
            {t.count > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>
                {t.count}
              </span>
            )}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#22d3ee]" />
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        {tab === "todo" && (
          <>
            {loadingTasks && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {en ? `${companionName} is checking your pipeline...` : `${companionName} está revisando tu pipeline...`}
              </div>
            )}
            {!loadingTasks && todoTasks.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-foreground">
                  {en ? "You're all caught up!" : "¡Estás al día!"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {en ? `${companionName} will let you know when something needs attention.` : `${companionName} te avisará cuando algo necesite atención.`}
                </p>
              </div>
            )}
            {todoTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl p-3.5 flex items-start gap-3"
                style={{
                  background: task.priority === "red"
                    ? "rgba(239,68,68,0.03)"
                    : task.priority === "amber"
                    ? "rgba(245,158,11,0.03)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${task.priority === "red"
                    ? "rgba(239,68,68,0.2)"
                    : task.priority === "amber"
                    ? "rgba(245,158,11,0.18)"
                    : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                  style={{ background: dotColor[task.priority] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white leading-tight">
                    {en ? task.titleEn : task.titleEs}
                  </p>
                  <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
                    {en ? task.subtitleEn : task.subtitleEs}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  <button
                    onClick={() => navigate(task.actionPath)}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "rgba(8,145,178,0.15)", color: "#22d3ee", border: "1px solid rgba(8,145,178,0.25)" }}
                  >
                    {en ? task.actionLabelEn : task.actionLabelEs}
                  </button>
                  <button
                    onClick={() => setDismissedIds((prev) => new Set([...prev, task.id]))}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {en ? task.skipLabelEn : task.skipLabelEs}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === "done" && (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {en ? "Completed tasks will appear here." : "Las tareas completadas aparecerán aquí."}
            </p>
          </div>
        )}
      </div>

      {/* Chat strip */}
      {chatMessages.length > 0 && (
        <div className="space-y-2 mb-3 max-h-[160px] overflow-y-auto">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}>
                  <Bot className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className="max-w-sm text-[12px] px-3 py-2 rounded-xl leading-relaxed"
                style={msg.role === "assistant"
                  ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", borderRadius: "4px 12px 12px 12px" }
                  : { background: "linear-gradient(135deg,#0891B2,#0e7490)", color: "#fff", borderRadius: "12px 4px 12px 12px" }
                }
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}>
                <Bot className="w-3 h-3 text-white" />
              </div>
              <div className="flex gap-1 items-center px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={en ? `Ask ${companionName} anything...` : `Pregúntale a ${companionName} lo que quieras...`}
          className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={!chatInput.trim() || sending}
          className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CommandCenter.tsx
git commit -m "feat(companion): add CommandCenter page at /ai"
```

---

### Task 8: Wire into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add lazy imports**

After the last existing lazy import (e.g. `const About = lazy(...)`) add:

```tsx
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
```

- [ ] **Step 2: Add context + component imports** (static imports near the top, after other static imports)

```tsx
import { CompanionProvider } from "@/contexts/CompanionContext";
import CompanionBubble from "@/components/CompanionBubble";
import NamingModal from "@/components/NamingModal";
```

- [ ] **Step 3: Wrap app with CompanionProvider**

Find the existing provider stack in the App component. Find:
```tsx
      <OutOfCreditsProvider>
```

Replace with:
```tsx
      <CompanionProvider>
      <OutOfCreditsProvider>
```

And close it — find:
```tsx
      </OutOfCreditsProvider>
```

Replace with:
```tsx
      </OutOfCreditsProvider>
      </CompanionProvider>
```

- [ ] **Step 4: Add CompanionBubble and NamingModal inside BrowserRouter**

Find:
```tsx
          <FloatingUploadProgress />
          <OutOfCreditsModal />
```

Add below those two lines:
```tsx
          <CompanionBubble />
          <NamingModal />
```

- [ ] **Step 5: Add /ai route**

Inside the authenticated `<Route element={<DashboardLayout />}>` block, add:

```tsx
              <Route path="/ai" element={<CommandCenter />} />
```

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(companion): wire CompanionProvider, bubble, modal, and /ai route into App"
```

---

### Task 9: DashboardSidebar — bot nav item with badge

**Files:**
- Modify: `src/components/DashboardSidebar.tsx`

- [ ] **Step 1: Import useCompanion**

In DashboardSidebar.tsx, add import near the top (with other hook imports):

```tsx
import { useCompanion } from "@/contexts/CompanionContext";
```

- [ ] **Step 2: Destructure companion data inside the component**

Inside `DashboardSidebar`, after the existing hook calls (e.g. after `const { credits } = useCredits();`), add:

```tsx
  const { tasks: companionTasks, companionName } = useCompanion();
  const companionBadge = companionTasks.filter((t) => t.priority === "red" || t.priority === "amber").length;
```

- [ ] **Step 3: Add the AI nav item to all role navs**

In `getNavItems()`, in every role branch (admin, videographer, editor, isUser, and the default client branch), add this item before `Manage Subscription` / `Settings`:

```tsx
{ label: companionName, icon: Bot, path: "/ai", badge: companionBadge },
```

Example for the admin nav (find the Trainings line and add after it):
```tsx
        { label: "Trainings", icon: BookOpen, path: "/trainings" },
        { label: companionName, icon: Bot, path: "/ai", badge: companionBadge },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
```

Repeat for all 4+ branches. The `badge` prop will need to be rendered.

- [ ] **Step 4: Render the badge in the nav item renderer**

Find where navItems are rendered (the `.map()` over navItems). Find the part that renders the label and icon. Add badge rendering — look for something like:

```tsx
<span className="...">{item.label}</span>
```

Add after the label span:
```tsx
{(item as any).badge > 0 && (
  <span className="ml-auto w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
    {(item as any).badge}
  </span>
)}
```

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

If there are type errors about the `badge` property, add `badge?: number` to the nav item type definition in the file.

- [ ] **Step 6: Commit and push**

```bash
git add src/components/DashboardSidebar.tsx
git commit -m "feat(companion): add AI nav item with badge count to sidebar"
git push origin main
```

---

### Task 10: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test naming modal**

1. Sign in as a fresh user (or clear `companion_state` row in Supabase for test user)
2. Verify naming modal appears on first load — blurred background, bot icon, name input, suggestion chips
3. Type a name or click a chip → click "Start with [Name]"
4. Verify modal closes and bubble appears with that name

- [ ] **Step 3: Test floating bubble**

1. Navigate to several pages (Scripts, Vault, Dashboard) — bubble should always be visible
2. Click the bubble — compact panel opens with task list
3. Type a message — AI responds in the panel
4. Click "See all" — navigates to `/ai`

- [ ] **Step 4: Test Command Center**

1. Navigate to `/ai`
2. Verify bot icon in sidebar is highlighted with badge count
3. Tasks appear correctly (red/amber/blue priorities)
4. Click a task action button — navigates to the correct page
5. Type in the chat strip — AI responds with plain English
6. Switch to Spanish in language toggle — all labels change to Spanish

- [ ] **Step 5: Verify badge sync**

1. The sidebar bot icon badge number matches the bubble badge number
2. Both match the "To Do" count in the Command Center
