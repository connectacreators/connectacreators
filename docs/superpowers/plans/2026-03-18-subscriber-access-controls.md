# Subscriber Access Controls & Internal Lead Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give subscribers (starter/growth/enterprise) proper access controls: gray out Landing Page for non-enterprise, add Lead Tracker + Master Database to their dashboard, enable internal Supabase-based lead management.

**Architecture:** Inline modifications to 3 existing files (Dashboard.tsx, LeadTracker.tsx, MasterDatabase.tsx). Subscribers use Supabase `leads` table directly; admin/client/connectaPlus continue using Notion via edge functions. No new components or services — `leadService.ts` already has all needed CRUD operations.

**Tech Stack:** React, TypeScript, Supabase, shadcn/ui components, Framer Motion

**Spec:** `docs/superpowers/specs/2026-03-18-subscriber-access-controls-design.md`

---

### Task 1: Dashboard — Store userPlanType from subscription check

**Files:**
- Modify: `src/pages/Dashboard.tsx:31-41` (add state) and `src/pages/Dashboard.tsx:95-137` (retain plan_type)

- [ ] **Step 1: Add userPlanType state declaration**

After `const [welcomePlan, setWelcomePlan] = useState("starter");` (line 41), add:

```tsx
const [userPlanType, setUserPlanType] = useState<string | null>(null);
```

- [ ] **Step 2: Store plan_type in the subscription check effect**

In the `checkSubscription` async function (line 105), after the first query result on line 110, add after line 112:

```tsx
setUserPlanType(data?.plan_type ?? null);
```

Also in the `refreshed` path (line 127), add before the `return`:

```tsx
setUserPlanType(refreshed?.plan_type ?? null);
```

The two insertions go:
1. After `const valid = data?.plan_type && ...` (line 112), before `if (valid) return;` — add `setUserPlanType(data?.plan_type ?? null);`
2. After `if (refreshed?.plan_type && ...)` check (line 127), inside the `if` block before `return` — add `setUserPlanType(refreshed?.plan_type ?? null);`

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep Dashboard`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: store userPlanType from subscription check in Dashboard"
```

---

### Task 2: Dashboard — Gray out Landing Page card for non-enterprise subscribers

**Files:**
- Modify: `src/pages/Dashboard.tsx:193-198` (setup sub-cards in `getClientSubCards()`), `src/pages/Dashboard.tsx:302-306` (subscriber flat card array), and card rendering blocks (~line 360, ~line 481)

**Important context:** Subscribers (`isUser`) use a flat inline card array at lines 302-306 — they do NOT use the `getClientSubCards().setup` folder system. Both paths need the disabled card treatment.

- [ ] **Step 1: Add disabled flag to Landing Page in `getClientSubCards().setup`**

In `getClientSubCards()` (line 193), add a `disabled` property to the Landing Page entry:

```tsx
{ label: "Landing Page", description: language === "en" ? "View your public landing page" : "Ve tu página de destino pública", icon: Globe, color: "text-rose-400", path: clientId ? `/clients/${clientId}/landing-page` : "/", disabled: isUser && userPlanType !== "enterprise" },
```

- [ ] **Step 2: Update isClientRole and admin/client-mode sub-card rendering for disabled cards**

There are two places where `activeSubCards` render (isClientRole folder view ~line 360 and admin/client-mode folder view ~line 481). In both `motion.button` blocks, update onClick and styling:

```tsx
<motion.button
  key={card.path}
  onClick={() => !(card as any).disabled && navigate(card.path)}
  className={`group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl ${(card as any).disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
  initial="hidden"
  animate="visible"
  custom={i + 1}
  variants={fadeUp}
>
  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
    <card.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: card.color.startsWith('#') ? card.color : undefined }} />
  </div>
  <div>
    <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{card.label}</h2>
    <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
    {(card as any).disabled && (
      <p className="text-[10px] text-muted-foreground/60 mt-1">{language === "en" ? "Enterprise plan only" : "Solo plan Enterprise"}</p>
    )}
  </div>
</motion.button>
```

Apply this to both render locations (~line 360 and ~line 481).

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep Dashboard`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: gray out Landing Page card for non-enterprise subscribers"
```

---

### Task 3: Dashboard — Add Lead Tracker + Master Database cards for subscribers

**Files:**
- Modify: `src/pages/Dashboard.tsx:291-327` (isUser card section)
- Import: Add `Target` and `Database` to lucide-react imports (line 5) — check if already imported

- [ ] **Step 1: Verify imports**

Check line 5-8 of Dashboard.tsx. `Target` and `Database` are already imported. No changes needed.

- [ ] **Step 2: Add three new cards to the isUser section (Lead Tracker, Master Database, disabled Landing Page)**

In the `isUser` card array (lines 302-306), add after the Content Calendar entry. The Landing Page card must be added here too (with disabled flag) since subscribers use this flat card array, not the folder system:

```tsx
{ label: language === "en" ? "Lead Tracker" : "Rastreador de Leads", description: language === "en" ? "Track and manage your leads" : "Rastrea y gestiona tus leads", icon: Target, color: "text-emerald-400", path: ownClientId ? `/clients/${ownClientId}/leads` : "/leads" },
{ label: language === "en" ? "Master Database" : "Base de Datos", description: language === "en" ? "View all your leads and videos" : "Ve todos tus leads y videos", icon: Database, color: "text-cyan-400", path: "/master-database" },
{ label: "Landing Page", description: language === "en" ? "View your public landing page" : "Ve tu página de destino pública", icon: Globe, color: "text-rose-400", path: ownClientId ? `/clients/${ownClientId}/landing-page` : "/", disabled: userPlanType !== "enterprise" },
```

- [ ] **Step 3: Update the subscriber card rendering to handle the disabled flag**

The subscriber `isUser` section (lines 308-325) renders cards with `motion.button`. Update the render to handle the `disabled` property. Change the `.map()` callback:

```tsx
.map((card, i) => {
  const isDisabled = (card as any).disabled;
  return (
    <motion.button
      key={card.path}
      onClick={() => !isDisabled && navigate(card.path)}
      className={`group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      initial="hidden"
      animate="visible"
      custom={i + 2}
      variants={fadeUp}
    >
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
        <card.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: card.color.startsWith('#') ? card.color : undefined }} />
      </div>
      <div>
        <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{card.label}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
        {isDisabled && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">{language === "en" ? "Enterprise plan only" : "Solo plan Enterprise"}</p>
        )}
      </div>
    </motion.button>
  );
})
```

- [ ] **Step 4: Update grid layout for 7 cards**

Change the grid class from:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-3xl mx-auto">
```
to (7 cards = 3 columns works well, with the last row having 1 card centered):
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep Dashboard`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: add Lead Tracker + Master Database cards to subscriber dashboard"
```

---

### Task 4: MasterDatabase — Allow subscriber access

**Files:**
- Modify: `src/pages/MasterDatabase.tsx:52` (useAuth destructure), `src/pages/MasterDatabase.tsx:136-147` (access guard + data loading)

- [ ] **Step 1: Add isUser to useAuth destructure**

Change line 52 from:
```tsx
const { user, loading, isAdmin } = useAuth();
```
to:
```tsx
const { user, loading, isAdmin, isUser } = useAuth();
```

- [ ] **Step 2: Add ownClientId state and fetch effect**

After the existing state declarations (after line 134), add:

```tsx
const [ownClientId, setOwnClientId] = useState<string | null>(null);

useEffect(() => {
  if (!user || !isUser) return;
  supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (data) setOwnClientId(data.id);
    });
}, [user, isUser]);
```

- [ ] **Step 3: Update access guard**

Change line 137-141 from:
```tsx
useEffect(() => {
  if (!loading && user && !isAdmin) {
    navigate("/dashboard");
  }
}, [loading, user, isAdmin, navigate]);
```
to:
```tsx
useEffect(() => {
  if (!loading && user && !isAdmin && !isUser) {
    navigate("/dashboard");
  }
}, [loading, user, isAdmin, isUser, navigate]);
```

- [ ] **Step 4: Update data loading condition**

Change line 144-147 from:
```tsx
useEffect(() => {
  if (!isAdmin || !user) return;
  loadAllData();
}, [isAdmin, user]);
```
to:
```tsx
useEffect(() => {
  if ((!isAdmin && !isUser) || !user) return;
  if (isUser && !ownClientId) return; // wait for ownClientId to load
  loadAllData();
}, [isAdmin, isUser, user, ownClientId]);
```

- [ ] **Step 5: Scope data loading for subscribers**

In `loadAllData()` (line 149), the function currently fetches ALL leads and ALL videos. Add subscriber scoping. Modify the leads query (lines 157-160):

```tsx
const leadsQuery = supabase
  .from("leads")
  .select("*")
  .order("created_at", { ascending: false });

// Scope to subscriber's own client only
if (isUser && ownClientId) {
  leadsQuery.eq("client_id", ownClientId);
}

const leadsData = await leadsQuery;
```

Apply the same pattern to the videos query further in `loadAllData()` — add `.eq("client_id", ownClientId)` when `isUser && ownClientId`.

For the clients list: when `isUser`, instead of `clientService.getAllClients()`, fetch only the subscriber's own client:

```tsx
let clientsData: Client[];
if (isUser && ownClientId) {
  const { data } = await supabase.from("clients").select("*").eq("id", ownClientId);
  clientsData = (data || []) as Client[];
} else {
  clientsData = await clientService.getAllClients();
}
setClients(clientsData);
```

- [ ] **Step 6: Hide client filter for subscribers**

Find the client filter `<Select>` in the JSX (search for `selectedClientFilter`). Wrap it with `{isAdmin && (...)}` or `{!isUser && (...)}` so subscribers don't see the client dropdown.

- [ ] **Step 7: Auto-set client_id in Add Lead dialog for subscribers**

In the Add Lead dialog, when `isUser`, auto-set `leadForm.client_id` to `ownClientId` and hide the client picker `<Select>`. Find the `showAddLeadDialog` Dialog component and wrap the client selector with:

```tsx
{!isUser && (
  <div className="space-y-2">
    <Label>Client *</Label>
    <Select ...>
      ...
    </Select>
  </div>
)}
```

Also update `resetLeadForm` to auto-set `client_id` for subscribers:

In the `leadForm` reset, if `isUser`, set `client_id: ownClientId || ""` instead of `""`.

And in the `handleSaveLead` validation, for `isUser` use `ownClientId` as `client_id`:

```tsx
const clientId = isUser ? (ownClientId || "") : leadForm.client_id;
if (!clientId || !leadForm.name.trim()) {
  toast.error("Client and lead name are required");
  return;
}
```

Then use `clientId` instead of `leadForm.client_id` in the `createLead` call.

- [ ] **Step 8: Apply same auto-set pattern to Add Video dialog**

Same changes for the video dialog: hide client picker for `isUser`, auto-set `client_id` to `ownClientId`.

- [ ] **Step 9: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep MasterDatabase`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add src/pages/MasterDatabase.tsx
git commit -m "feat: allow subscriber access to MasterDatabase, scoped to own client"
```

---

### Task 5: LeadTracker — Add ownClientId fetch for subscribers

**Files:**
- Modify: `src/pages/LeadTracker.tsx:101` (useAuth destructure), add state + effect

- [ ] **Step 1: Add isUser to useAuth destructure**

Change line 101 from:
```tsx
const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
```
to:
```tsx
const { user, loading: authLoading, isAdmin, isUser, isVideographer } = useAuth();
```

- [ ] **Step 2: Add ownClientId state and fetch effect**

After line 104, add:

```tsx
const [ownClientId, setOwnClientId] = useState<string | null>(null);

useEffect(() => {
  if (!user || !isUser) return;
  supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (data) setOwnClientId(data.id);
    });
}, [user, isUser]);
```

- [ ] **Step 3: Add leadService import**

Add at the top imports:

```tsx
import { leadService } from "@/services/leadService";
```

Also add `Plus` to the lucide-react imports for the Add Lead button.

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep LeadTracker`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/LeadTracker.tsx
git commit -m "feat: add ownClientId fetch and leadService import to LeadTracker"
```

---

### Task 6: LeadTracker — Dual data source (Supabase for subscribers)

**Files:**
- Modify: `src/pages/LeadTracker.tsx:152-206` (fetchLeads + useEffect)

- [ ] **Step 1: Add subscriber-specific fetch function**

After the existing `fetchLeads` function (after line 195), add a new function for subscriber data:

```tsx
const fetchSubscriberLeads = useCallback(async (silent = false) => {
  if (!ownClientId) return;
  if (!silent) setLoading(true);
  setError(null);
  try {
    const supaLeads = await leadService.getLeadsByClient(ownClientId);
    const normalized: Lead[] = supaLeads.map((sl) => ({
      id: sl.id,
      fullName: sl.name,
      email: sl.email || "",
      phone: sl.phone || "",
      leadStatus: sl.status,
      leadSource: sl.source || "",
      client: "",
      campaignName: "",
      notes: sl.notes || "",
      createdDate: sl.created_at,
      lastContacted: sl.last_contacted_at || "",
      appointmentDate: sl.booking_date || "",
      bookingTime: sl.booking_time || undefined,
      booked: sl.booked,
      notionUrl: "",
    }));
    setLeads(normalized.sort((a, b) => {
      const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      return dateB - dateA;
    }));
    // Set filter options from the data
    const statuses = [...new Set(normalized.map(l => l.leadStatus).filter(Boolean))];
    const sources = [...new Set(normalized.map(l => l.leadSource).filter(Boolean))];
    if (statuses.length) setStatusOptions(statuses);
    if (sources.length) setSourceOptions(sources);
  } catch (e: any) {
    console.error("Error fetching subscriber leads:", e);
    if (!silent) setError(e.message || "Error loading leads");
  } finally {
    if (!silent) setLoading(false);
  }
}, [ownClientId]);
```

- [ ] **Step 2: Update the main useEffect to branch on isUser**

Change the existing fetch useEffect (lines 197-206) from:

```tsx
useEffect(() => {
  if (!authLoading && user) {
    if (isStaff) {
      fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined);
    } else {
      fetchLeads();
    }
  }
}, [authLoading, user, isStaff, selectedClient, urlClientId, fetchLeads]);
```

to:

```tsx
useEffect(() => {
  if (!authLoading && user) {
    if (isUser) {
      fetchSubscriberLeads();
    } else if (isStaff) {
      fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined);
    } else {
      fetchLeads();
    }
  }
}, [authLoading, user, isUser, isStaff, selectedClient, urlClientId, fetchLeads, fetchSubscriberLeads]);
```

- [ ] **Step 3: Update auto-refresh interval to use subscriber fetch**

Change the auto-refresh useEffect (lines 209-219) to also branch on `isUser`:

```tsx
useEffect(() => {
  if (!user || authLoading) return;
  const interval = setInterval(() => {
    if (isUser) {
      fetchSubscriberLeads(true);
    } else if (isStaff) {
      fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined, true);
    } else {
      fetchLeads(undefined, undefined, true);
    }
  }, 120_000);
  return () => clearInterval(interval);
}, [user, authLoading, isUser, isStaff, selectedClient, urlClientId, fetchLeads, fetchSubscriberLeads]);
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep LeadTracker`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/LeadTracker.tsx
git commit -m "feat: add Supabase data source for subscriber leads in LeadTracker"
```

---

### Task 7: LeadTracker — Subscriber-specific CRUD (status, notes, delete)

**Files:**
- Modify: `src/pages/LeadTracker.tsx:267-306` (handleSaveStatus), `src/pages/LeadTracker.tsx:228-265` (handleSaveNotes), `src/pages/LeadTracker.tsx:308-343` (handleDeleteLead)

- [ ] **Step 1: Update handleSaveStatus to use Supabase for subscribers**

In `handleSaveStatus` (line 267), add an `isUser` branch before the existing Notion edge function call:

```tsx
const handleSaveStatus = async () => {
  if (!selectedLead || newStatus === selectedLead.leadStatus) {
    setModalOpen(false);
    return;
  }
  setSaving(true);
  try {
    if (isUser) {
      // Subscriber: update directly in Supabase
      await leadService.updateLead(selectedLead.id, { status: newStatus });
      toast.success(tr(t.leadDetail.statusUpdated, language));
      setModalOpen(false);
      fetchSubscriberLeads();
    } else {
      // Admin/staff/client: use Notion edge function (existing code)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-lead-status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadId: selectedLead.id, newStatus, clientId: urlClientId }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }
      toast.success(tr(t.leadDetail.statusUpdated, language));
      setModalOpen(false);
      isStaff
        ? fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined)
        : fetchLeads();
    }
  } catch (e: any) {
    console.error("Error updating status:", e);
    toast.error(tr(t.leadDetail.statusError, language));
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 2: Update handleSaveNotes to use Supabase for subscribers**

In `handleSaveNotes` (line 228), add an `isUser` branch:

```tsx
if (isUser) {
  await leadService.updateLead(selectedLead.id, { notes: trimmed });
  setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, notes: trimmed } : l));
  setSelectedLead((prev) => prev ? { ...prev, notes: trimmed } : prev);
  toast.success(tr({ en: "Notes saved", es: "Notas guardadas" }, language));
} else {
  // existing Notion edge function code...
}
```

- [ ] **Step 3: Update handleDeleteLead to use Supabase for subscribers**

In `handleDeleteLead` (line 308), add an `isUser` branch:

```tsx
if (isUser) {
  await leadService.deleteLead(lead.id);
  setLeads((prev) => prev.filter((l) => l.id !== lead.id));
  toast.success(language === "en" ? "Lead deleted" : "Lead eliminado");
  setConfirmDeleteId(null);
  if (modalOpen && selectedLead?.id === lead.id) setModalOpen(false);
} else {
  // existing Notion edge function code...
}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep LeadTracker`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/LeadTracker.tsx
git commit -m "feat: subscriber-specific CRUD for leads (status, notes, delete)"
```

---

### Task 8: LeadTracker — Add Lead dialog

**Files:**
- Modify: `src/pages/LeadTracker.tsx` (add state, dialog, button)

- [ ] **Step 1: Add Add Lead state declarations**

After the existing state declarations (around line 137), add:

```tsx
// Add Lead dialog state
const [showAddLead, setShowAddLead] = useState(false);
const [addLeadForm, setAddLeadForm] = useState({
  name: "",
  email: "",
  phone: "",
  source: "",
  status: "New Lead",
  follow_up_step: 0,
  last_contacted_at: "",
  next_follow_up_at: "",
  booked: false,
  stopped: false,
  replied: false,
});

const resetAddLeadForm = () => setAddLeadForm({
  name: "", email: "", phone: "", source: "", status: "New Lead",
  follow_up_step: 0, last_contacted_at: "", next_follow_up_at: "",
  booked: false, stopped: false, replied: false,
});
```

- [ ] **Step 2: Add handleAddLead function**

After `resetAddLeadForm`, add:

```tsx
const handleAddLead = async () => {
  if (!addLeadForm.name.trim()) {
    toast.error(language === "en" ? "Lead name is required" : "El nombre del lead es requerido");
    return;
  }
  const clientId = isUser ? ownClientId : urlClientId;
  if (!clientId) {
    toast.error(language === "en" ? "No client associated" : "Sin cliente asociado");
    return;
  }
  try {
    await leadService.createLead({
      client_id: clientId,
      name: addLeadForm.name.trim(),
      phone: addLeadForm.phone || null,
      email: addLeadForm.email || null,
      source: addLeadForm.source || null,
      status: addLeadForm.status,
    });
    toast.success(language === "en" ? "Lead created" : "Lead creado");
    setShowAddLead(false);
    resetAddLeadForm();
    if (isUser) {
      fetchSubscriberLeads();
    } else {
      fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined);
    }
  } catch (e: any) {
    console.error("Error creating lead:", e);
    toast.error(e.message || "Error creating lead");
  }
};
```

- [ ] **Step 3: Add the + Add Lead button in the filter bar**

In the filter section (around line 536), just before the view toggle div (line 628), add the button. Insert before `{/* View toggle: Cards / Table / Chart */}`:

```tsx
{(isUser || isAdmin) && (
  <Button
    size="sm"
    onClick={() => setShowAddLead(true)}
    className="flex-shrink-0 gap-1.5"
  >
    <Plus className="w-4 h-4" />
    {language === "en" ? "Add Lead" : "Agregar Lead"}
  </Button>
)}
```

- [ ] **Step 4: Add the Add Lead Dialog JSX**

At the end of the component, just before the closing `</>` (after the existing lead detail modal), add the dialog. Import `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` and `Label` — check if already imported (they are used by the existing modal):

```tsx
{/* Add Lead Dialog */}
<Dialog open={showAddLead} onOpenChange={setShowAddLead}>
  <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>{language === "en" ? "Add New Lead" : "Agregar Nuevo Lead"}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <label className="text-sm font-medium">{language === "en" ? "Name" : "Nombre"} *</label>
        <Input placeholder={language === "en" ? "Lead name" : "Nombre del lead"} value={addLeadForm.name} onChange={(e) => setAddLeadForm({ ...addLeadForm, name: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Email</label>
        <Input type="email" placeholder="email@example.com" value={addLeadForm.email} onChange={(e) => setAddLeadForm({ ...addLeadForm, email: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{language === "en" ? "Phone" : "Teléfono"}</label>
        <Input placeholder="+1 (555) 000-0000" value={addLeadForm.phone} onChange={(e) => setAddLeadForm({ ...addLeadForm, phone: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{language === "en" ? "Source" : "Fuente"}</label>
        <Input placeholder="Facebook, Referral, etc." value={addLeadForm.source} onChange={(e) => setAddLeadForm({ ...addLeadForm, source: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Status</label>
        <Select value={addLeadForm.status} onValueChange={(value) => setAddLeadForm({ ...addLeadForm, status: value })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALLOWED_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{language === "en" ? "Follow Up Step" : "Paso de Seguimiento"}</label>
        <Input type="number" min="0" max="10" value={addLeadForm.follow_up_step} onChange={(e) => setAddLeadForm({ ...addLeadForm, follow_up_step: parseInt(e.target.value) || 0 })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{language === "en" ? "Last Contacted" : "Último Contacto"}</label>
        <Input type="date" value={addLeadForm.last_contacted_at} onChange={(e) => setAddLeadForm({ ...addLeadForm, last_contacted_at: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{language === "en" ? "Next Follow Up" : "Próximo Seguimiento"}</label>
        <Input type="date" value={addLeadForm.next_follow_up_at} onChange={(e) => setAddLeadForm({ ...addLeadForm, next_follow_up_at: e.target.value })} />
      </div>
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center gap-2">
          <input type="checkbox" id="addLead-booked" checked={addLeadForm.booked} onChange={(e) => setAddLeadForm({ ...addLeadForm, booked: e.target.checked })} className="rounded" />
          <label htmlFor="addLead-booked" className="text-sm cursor-pointer">Booked</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="addLead-replied" checked={addLeadForm.replied} onChange={(e) => setAddLeadForm({ ...addLeadForm, replied: e.target.checked })} className="rounded" />
          <label htmlFor="addLead-replied" className="text-sm cursor-pointer">{language === "en" ? "Replied" : "Respondió"}</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="addLead-stopped" checked={addLeadForm.stopped} onChange={(e) => setAddLeadForm({ ...addLeadForm, stopped: e.target.checked })} className="rounded" />
          <label htmlFor="addLead-stopped" className="text-sm cursor-pointer">{language === "en" ? "Stopped/Archived" : "Detenido/Archivado"}</label>
        </div>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => { setShowAddLead(false); resetAddLeadForm(); }}>
        {language === "en" ? "Cancel" : "Cancelar"}
      </Button>
      <Button onClick={handleAddLead}>
        {language === "en" ? "Create Lead" : "Crear Lead"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: Verify Dialog/DialogContent/etc imports exist**

Check the imports at the top of LeadTracker.tsx. The file already imports `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` from `@/components/ui/dialog`. Verify `Button` and `Input` are also imported. They are (lines 7-8). `Plus` from lucide-react needs to be added to the lucide import line.

- [ ] **Step 6: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep LeadTracker`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/LeadTracker.tsx
git commit -m "feat: add manual lead creation dialog to LeadTracker"
```

---

### Task 9: Empty state for subscribers with no client record

**Files:**
- Modify: `src/pages/LeadTracker.tsx` (add empty state before main content)
- Modify: `src/pages/MasterDatabase.tsx` (add empty state before main content)

- [ ] **Step 1: Add empty state to LeadTracker for subscribers with no client record**

In the LeadTracker's return JSX, after the loading spinner check (`if (authLoading || subscriptionChecking)` at line 345), add a check for subscribers with no client:

```tsx
if (isUser && !ownClientId && !authLoading) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="container mx-auto px-4 py-16 max-w-6xl text-center">
        <p className="text-muted-foreground text-lg">
          {language === "en" ? "No account found. Please complete onboarding first." : "No se encontró cuenta. Por favor completa la incorporación primero."}
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Add empty state to MasterDatabase for subscribers with no client record**

In MasterDatabase, after the loading check, add a similar check. After the access guard effect, add to the JSX return:

```tsx
if (isUser && !ownClientId && !loading) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="container mx-auto px-4 py-16 max-w-6xl text-center">
        <p className="text-muted-foreground text-lg">
          No account found. Please complete onboarding first.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep -E "LeadTracker|MasterDatabase"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/LeadTracker.tsx src/pages/MasterDatabase.tsx
git commit -m "feat: add empty state for subscribers with no client record"
```

---

### Task 10: Final verification — TypeScript check + build

**Files:** All modified files

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors related to Dashboard, LeadTracker, or MasterDatabase

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit any remaining fixes**

If any TypeScript or build errors were found and fixed, commit those specific files (do NOT use `git add -A` — the repo has many untracked files):

```bash
git add src/pages/Dashboard.tsx src/pages/LeadTracker.tsx src/pages/MasterDatabase.tsx
git commit -m "fix: resolve TypeScript errors from subscriber access controls"
```
