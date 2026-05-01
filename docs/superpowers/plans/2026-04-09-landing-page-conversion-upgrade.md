# Landing Page Conversion Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the per-client booking landing page with conversion-focused copy tools, trust signals, font picker, hero image, sticky mobile CTA, and per-client FB Pixel — all through the existing builder UI.

**Architecture:** Incremental upgrade to `PublicLandingPage.tsx` (public-facing render) and `LandingPageBuilder.tsx` (admin editor). New DB columns via migration. No routing changes, no new files.

**Tech Stack:** React, TypeScript, Supabase (postgres + storage bucket `booking-logos`), Tailwind/shadcn for builder UI, inline styles for public page (existing pattern).

---

## File Map

| File | Role |
|---|---|
| `supabase/migrations/20260409_landing_page_conversion.sql` | Add 11 new columns to `landing_pages` |
| `src/pages/LandingPageBuilder.tsx` | Admin editor — add all new builder UI fields and update save payload |
| `src/pages/PublicLandingPage.tsx` | Public render — apply font, hero image, trust strip, sticky CTA, dynamic FB Pixel |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260409_landing_page_conversion.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/20260409_landing_page_conversion.sql
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS hero_image_url     text,
  ADD COLUMN IF NOT EXISTS font_family        text DEFAULT 'Inter, sans-serif',
  ADD COLUMN IF NOT EXISTS fb_pixel_id        text,
  ADD COLUMN IF NOT EXISTS show_sticky_cta    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS trust_stat_1_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_1_label  text,
  ADD COLUMN IF NOT EXISTS trust_stat_2_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_2_label  text,
  ADD COLUMN IF NOT EXISTS trust_stat_3_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_3_label  text;
```

- [ ] **Step 2: Apply migration**

Run in Supabase Dashboard SQL Editor (or via CLI):
```bash
npx supabase db push
```
Or paste the SQL directly into the Supabase Dashboard → SQL Editor → Run.

Expected: no errors, 10 new columns appear in `landing_pages`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260409_landing_page_conversion.sql
git commit -m "feat(landing): add conversion upgrade columns to landing_pages"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx` — `LandingPageData` type (lines 21–53)
- Modify: `src/pages/PublicLandingPage.tsx` — `LandingPage` type (lines 6–44)

- [ ] **Step 1: Update `LandingPageData` type in `LandingPageBuilder.tsx`**

Find the closing `};` of the `LandingPageData` type (after `og_image_url`) and add these fields before it:

```typescript
  hero_image_url?: string | null;
  font_family?: string | null;
  fb_pixel_id?: string | null;
  show_sticky_cta?: boolean;
  trust_stat_1_number?: string | null;
  trust_stat_1_label?: string | null;
  trust_stat_2_number?: string | null;
  trust_stat_2_label?: string | null;
  trust_stat_3_number?: string | null;
  trust_stat_3_label?: string | null;
```

- [ ] **Step 2: Update `LandingPage` type in `PublicLandingPage.tsx`**

Find the closing `};` of the `LandingPage` type (after `og_image_url`) and add the same fields:

```typescript
  hero_image_url?: string | null;
  font_family?: string | null;
  fb_pixel_id?: string | null;
  show_sticky_cta?: boolean;
  trust_stat_1_number?: string | null;
  trust_stat_1_label?: string | null;
  trust_stat_2_number?: string | null;
  trust_stat_2_label?: string | null;
  trust_stat_3_number?: string | null;
  trust_stat_3_label?: string | null;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to the new fields.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx src/pages/PublicLandingPage.tsx
git commit -m "feat(landing): add new fields to LandingPage types"
```

---

## Task 3: Builder — Hero Image Upload (Branding Tab)

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx`

Add a hero image upload handler and UI in the Branding tab (same pattern as `handleLogoUpload`).

- [ ] **Step 1: Add state variable near top of component**

Find the line `const [uploadingFavicon, setUploadingFavicon] = useState(false);` (around line 86) and add after it:

```typescript
const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
```

- [ ] **Step 2: Add upload + remove handlers**

Add these two functions after `handleFaviconUpload` (around line 308):

```typescript
const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !clientId) return;
  if (file.size > 10 * 1024 * 1024) { toast.error("File too large — max 10MB."); e.target.value = ""; return; }
  setUploadingHeroImage(true);
  await supabase.storage.from("booking-logos").remove([
    `${clientId}/hero-image.webp`, `${clientId}/hero-image.png`,
    `${clientId}/hero-image.jpg`, `${clientId}/hero-image.jpeg`,
  ]);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${clientId}/hero-image.${ext}`;
  const { error } = await supabase.storage.from("booking-logos").upload(path, file, { upsert: true });
  if (error) { toast.error("Upload failed: " + error.message); }
  else {
    const { data: { publicUrl: url } } = supabase.storage.from("booking-logos").getPublicUrl(path);
    setPage((p) => p ? { ...p, hero_image_url: `${url}?t=${Date.now()}` } : p);
    toast.success("Hero image uploaded — click Save to keep it.");
  }
  setUploadingHeroImage(false);
  e.target.value = "";
};

const handleHeroImageRemove = async () => {
  if (!page || !clientId) return;
  if (page.hero_image_url) {
    const ext = page.hero_image_url.split(".").pop()?.split("?")[0];
    await supabase.storage.from("booking-logos").remove([`${clientId}/hero-image.${ext}`]);
  }
  setPage((p) => p ? { ...p, hero_image_url: null } : p);
  toast.success("Hero image removed");
};
```

- [ ] **Step 3: Add UI to Branding tab**

In the Branding tab JSX, find the closing `</div>` of the Logo section (around line 433) and add this block right after it (before the color grid):

```tsx
{/* Hero Image */}
<div>
  <Label className="text-xs text-muted-foreground mb-1 block">
    Hero Background Image <span style={{ color: "#888", fontWeight: 400 }}>(optional — shows behind headline)</span>
  </Label>
  {page.hero_image_url && (
    <img src={page.hero_image_url} alt="Hero" className="w-full h-24 object-cover rounded-lg border border-border mb-2" />
  )}
  <div className="flex items-center gap-3">
    <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
      {uploadingHeroImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
      {page.hero_image_url ? "Change image" : "Upload hero image"}
      <input type="file" accept="image/*" className="hidden" onChange={handleHeroImageUpload} />
    </label>
    {page.hero_image_url && (
      <button onClick={handleHeroImageRemove} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove hero image">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx
git commit -m "feat(landing): add hero image upload to builder branding tab"
```

---

## Task 4: Builder — Font Picker (Branding Tab)

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx`

- [ ] **Step 1: Add font options constant**

Add this constant near the top of the file, after the `TABS` array:

```typescript
const FONT_OPTIONS = [
  { label: "Clean & Modern", value: "Inter, sans-serif", sample: "Book your appointment today" },
  { label: "Trustworthy & Warm", value: "Lato, sans-serif", sample: "Book your appointment today" },
  { label: "Premium & Elegant", value: "'Playfair Display', serif", sample: "Book your appointment today" },
  { label: "Bold & Direct", value: "Oswald, sans-serif", sample: "Book your appointment today" },
] as const;
```

- [ ] **Step 2: Add Google Fonts link injection**

Add this `useEffect` inside the component, after the existing `useEffect` calls:

```typescript
// Load Google Fonts for font picker preview
useEffect(() => {
  const id = "builder-google-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Lato:wght@400;700&family=Playfair+Display:wght@400;700&family=Oswald:wght@400;700&display=swap";
  document.head.appendChild(link);
}, []);
```

- [ ] **Step 3: Add font picker UI to Branding tab**

In the Branding tab, find the color preview block (around line 484) and add the font picker before it:

```tsx
{/* Font Picker */}
<div>
  <Label className="text-xs text-muted-foreground mb-2 block">Font Style</Label>
  <div className="grid grid-cols-2 gap-2">
    {FONT_OPTIONS.map((font) => (
      <button
        key={font.value}
        type="button"
        onClick={() => setPage({ ...page, font_family: font.value })}
        className={`p-3 rounded-lg border text-left transition-all ${
          (page.font_family || "Inter, sans-serif") === font.value
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/40"
        }`}
      >
        <p className="text-[10px] text-muted-foreground mb-1">{font.label}</p>
        <p style={{ fontFamily: font.value, fontSize: 13, color: "hsl(var(--foreground))", margin: 0 }}>
          {font.sample}
        </p>
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx
git commit -m "feat(landing): add font picker to builder branding tab"
```

---

## Task 5: Builder — Headline Template Picker (CTA Text Tab)

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx`

- [ ] **Step 1: Add headline templates constant**

Add after `FONT_OPTIONS`:

```typescript
const HEADLINE_TEMPLATES = [
  { label: "Outcome-Focused", formula: "Get [Result] in [Timeframe]", example: 'e.g. "Get Your Dream Smile in Just 2 Visits"' },
  { label: "Loss-Aversion", formula: "Stop [Pain]. Start [Outcome].", example: 'e.g. "Stop Hiding Your Smile. Start Living Confidently."' },
  { label: "Social Proof", formula: "Trusted by [X]+ [Clients]", example: 'e.g. "Trusted by 2,000+ Families Since 2005"' },
  { label: "Question Hook", formula: "Ready to [Achieve Goal]?", example: 'e.g. "Ready to Transform Your Business?"' },
  { label: "Direct Value", formula: "[Adjective] [Service] for [Audience]", example: 'e.g. "Premium Legal Counsel for Growing Businesses"' },
] as const;
```

- [ ] **Step 2: Find the CTA Text tab section**

Search the builder JSX for `activeTab === "hero"` — this is the CTA Text tab. It contains the `hero_headline` and `hero_subheadline` inputs.

- [ ] **Step 3: Add template picker above the headline input**

In the CTA Text (`hero`) tab, find the `hero_headline` `<Input>` element and add this block directly before the `<Label>` that precedes it:

```tsx
{/* Headline Template Picker */}
<div>
  <Label className="text-xs text-muted-foreground mb-1 block">Headline Formula <span style={{ color: "#888", fontWeight: 400 }}>(pick one to pre-fill, then edit)</span></Label>
  <select
    className="w-full rounded-lg border border-border bg-card text-foreground text-xs px-3 py-2 mb-3"
    value=""
    onChange={(e) => {
      const tpl = HEADLINE_TEMPLATES.find(t => t.formula === e.target.value);
      if (tpl) setPage({ ...page, hero_headline: tpl.formula });
    }}
  >
    <option value="">— Pick a formula to pre-fill —</option>
    {HEADLINE_TEMPLATES.map((t) => (
      <option key={t.formula} value={t.formula}>{t.label}: {t.example}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx
git commit -m "feat(landing): add headline template picker to CTA Text tab"
```

---

## Task 6: Builder — CTA Button Copy Dropdown (CTA Text Tab)

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx`

- [ ] **Step 1: Add CTA options constant**

Add after `HEADLINE_TEMPLATES`:

```typescript
const CTA_OPTIONS = [
  "Book My Free Consultation",
  "Reserve My Spot",
  "Get My Free Assessment",
  "Claim My Appointment",
  "Start My Transformation",
  "Schedule a Call",
  "Get Started Today",
] as const;
```

- [ ] **Step 2: Find the `cta_button_text` input in the CTA Text tab**

It's a `<Label>` + `<Input>` with `value={page.cta_button_text}`.

- [ ] **Step 3: Replace the plain input with dropdown + custom field**

Replace the existing `cta_button_text` `<Label>` + `<Input>` block with:

```tsx
<div>
  <Label className="text-xs text-muted-foreground mb-1 block">CTA Button Text</Label>
  <select
    className="w-full rounded-lg border border-border bg-card text-foreground text-xs px-3 py-2 mb-2"
    value={CTA_OPTIONS.includes(page.cta_button_text as any) ? page.cta_button_text : "__custom__"}
    onChange={(e) => {
      if (e.target.value !== "__custom__") setPage({ ...page, cta_button_text: e.target.value });
    }}
  >
    {CTA_OPTIONS.map((opt) => (
      <option key={opt} value={opt}>{opt}</option>
    ))}
    <option value="__custom__">Custom…</option>
  </select>
  {(!CTA_OPTIONS.includes(page.cta_button_text as any) || page.cta_button_text === "__custom__") && (
    <Input
      value={page.cta_button_text === "__custom__" ? "" : page.cta_button_text}
      onChange={(e) => setPage({ ...page, cta_button_text: e.target.value })}
      placeholder="Type your custom CTA text"
      className="h-10 text-sm"
    />
  )}
</div>
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx
git commit -m "feat(landing): replace CTA text input with proven-copy dropdown"
```

---

## Task 7: Builder — Trust Strip Fields (CTA Text Tab)

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx`

- [ ] **Step 1: Add trust strip fields in the CTA Text tab**

Find the end of the CTA Text (`hero`) tab section — after the `hero_subheadline` textarea. Add this block:

```tsx
{/* Trust Strip */}
<div>
  <Label className="text-xs text-muted-foreground mb-1 block">
    Trust Stats <span style={{ color: "#888", fontWeight: 400 }}>(shown below headline — leave blank to hide)</span>
  </Label>
  <div className="space-y-2">
    {([1, 2, 3] as const).map((n) => {
      const numKey = `trust_stat_${n}_number` as keyof typeof page;
      const lblKey = `trust_stat_${n}_label` as keyof typeof page;
      return (
        <div key={n} className="flex gap-2 items-center">
          <span className="text-xs text-muted-foreground w-4">{n}.</span>
          <Input
            value={(page[numKey] as string) || ""}
            onChange={(e) => setPage({ ...page, [numKey]: e.target.value })}
            placeholder='e.g. "4.9 ⭐" or "2,000+"'
            className="h-8 text-xs flex-1"
          />
          <Input
            value={(page[lblKey] as string) || ""}
            onChange={(e) => setPage({ ...page, [lblKey]: e.target.value })}
            placeholder='e.g. "Google Rating"'
            className="h-8 text-xs flex-1"
          />
        </div>
      );
    })}
  </div>
</div>
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx
git commit -m "feat(landing): add trust strip stat fields to CTA Text tab"
```

---

## Task 8: Builder — FB Pixel Field (SEO Tab) + Sticky CTA Toggle (Booking Tab)

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx`

- [ ] **Step 1: Add FB Pixel input to SEO tab**

Find the SEO tab section (`activeTab === "seo"`). Add this block after the existing OG Image field:

```tsx
{/* Facebook Pixel */}
<div>
  <Label className="text-xs text-muted-foreground mb-1 block">Facebook Pixel ID</Label>
  <Input
    value={page.fb_pixel_id || ""}
    onChange={(e) => setPage({ ...page, fb_pixel_id: e.target.value.trim() })}
    placeholder="e.g. 942091105339252"
    className="h-10 font-mono text-sm"
  />
  <p className="text-[11px] text-muted-foreground mt-1">Paste your Pixel ID (numbers only). Used to track conversions from ads.</p>
</div>
```

- [ ] **Step 2: Add Sticky CTA toggle to Booking tab**

Find the Booking tab section (`activeTab === "booking"`). Add this block at the very top of the booking tab content, before the existing booking type selector:

```tsx
{/* Sticky Mobile CTA */}
<div className="flex items-center justify-between">
  <div>
    <p className="text-sm font-medium text-foreground">Sticky Mobile CTA</p>
    <p className="text-xs text-muted-foreground">Shows a fixed "Book Now" button at the bottom of mobile screens</p>
  </div>
  <Switch
    checked={page.show_sticky_cta ?? true}
    onCheckedChange={(v) => setPage({ ...page, show_sticky_cta: v })}
  />
</div>
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx
git commit -m "feat(landing): add FB Pixel field and sticky CTA toggle to builder"
```

---

## Task 9: Builder — Update Save Payload

**Files:**
- Modify: `src/pages/LandingPageBuilder.tsx`

The `handleSave` function builds an explicit `payload` object (lines ~154–189). New fields must be added here or they won't be persisted.

- [ ] **Step 1: Add new fields to the save payload**

Find the `const payload = {` block in `handleSave`. Add these fields before the closing `};`:

```typescript
      hero_image_url: page.hero_image_url || null,
      font_family: page.font_family || "Inter, sans-serif",
      fb_pixel_id: page.fb_pixel_id || null,
      show_sticky_cta: page.show_sticky_cta ?? true,
      trust_stat_1_number: page.trust_stat_1_number || null,
      trust_stat_1_label: page.trust_stat_1_label || null,
      trust_stat_2_number: page.trust_stat_2_number || null,
      trust_stat_2_label: page.trust_stat_2_label || null,
      trust_stat_3_number: page.trust_stat_3_number || null,
      trust_stat_3_label: page.trust_stat_3_label || null,
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPageBuilder.tsx
git commit -m "feat(landing): include new fields in handleSave payload"
```

---

## Task 10: Public Page — Font + Hero Image

**Files:**
- Modify: `src/pages/PublicLandingPage.tsx`

- [ ] **Step 1: Load Google Fonts dynamically**

Add a `useEffect` inside `PublicLandingPage` (after the existing `useEffect` blocks, before the `if (loading)` return):

```typescript
// Load font from Google Fonts
useEffect(() => {
  if (!page?.font_family) return;
  const id = "public-page-font";
  if (document.getElementById(id)) {
    document.getElementById(id)!.remove(); // remove stale font on re-render
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Lato:wght@400;700&family=Playfair+Display:wght@400;700&family=Oswald:wght@400;700&display=swap";
  document.head.appendChild(link);
}, [page?.font_family]);
```

- [ ] **Step 2: Apply selected font to root div**

Find the root `<div>` of the return statement (line ~272):
```tsx
<div style={{ fontFamily: "Arial, sans-serif", background: bg1, minHeight: "100vh" }}>
```

Change it to:
```tsx
<div style={{ fontFamily: page.font_family || "Arial, sans-serif", background: bg1, minHeight: "100vh" }}>
```

Also update `headingStyle` (line ~264):
```typescript
const headingStyle: React.CSSProperties = {
  fontFamily: page.font_family || "Arial, sans-serif",
  fontWeight: 700,
  color: textPrimary,
  textAlign: "center",
};
```

- [ ] **Step 3: Add hero image overlay**

Find the hero `<div>` (line ~284):
```tsx
<div style={{ paddingTop: 40, paddingBottom: 28, textAlign: "center" }}>
```

Replace it with:
```tsx
<div style={{
  paddingTop: 40,
  paddingBottom: 28,
  textAlign: "center",
  ...(page.hero_image_url ? {
    backgroundImage: `url(${page.hero_image_url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    position: "relative",
    borderRadius: 0,
  } : {}),
}}>
  {page.hero_image_url && (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(0,0,0,0.5)",
      borderRadius: "inherit",
    }} />
  )}
  <div style={{ position: "relative", zIndex: 1 }}>
```

Then close that inner `<div style={{ position: "relative", zIndex: 1 }}>` before the closing `</div>` of the hero section. The structure becomes:

```tsx
<div style={{ /* hero wrapper with optional bg */ }}>
  {page.hero_image_url && <div style={{ /* overlay */ }} />}
  <div style={{ position: "relative", zIndex: 1 }}>
    {/* logo, h1, subheadline — existing JSX */}
  </div>
</div>
```

Also: when `hero_image_url` is set, force the headline and subheadline text to white inside the hero section. Add these computed variables after `const safeAccent = ...`:

```typescript
const heroTextColor = page.hero_image_url ? "#ffffff" : textPrimary;
const heroMutedColor = page.hero_image_url ? "rgba(255,255,255,0.85)" : textMuted;
```

Then use `heroTextColor` and `heroMutedColor` for the `h1` and `p` inside the hero div instead of the existing `textPrimary` / `textMuted`.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/PublicLandingPage.tsx
git commit -m "feat(landing): apply font choice and hero background image to public page"
```

---

## Task 11: Public Page — Trust Strip

**Files:**
- Modify: `src/pages/PublicLandingPage.tsx`

- [ ] **Step 1: Add trust strip below subheadline**

In the hero section, find the subheadline `<p>` element. After its closing tag, add:

```tsx
{/* Trust Strip */}
{(page.trust_stat_1_number || page.trust_stat_2_number || page.trust_stat_3_number) && (
  <div style={{
    display: "flex",
    gap: 0,
    justifyContent: "center",
    alignItems: "stretch",
    flexWrap: "wrap",
    marginTop: 20,
    marginBottom: 4,
  }}>
    {[
      { num: page.trust_stat_1_number, lbl: page.trust_stat_1_label },
      { num: page.trust_stat_2_number, lbl: page.trust_stat_2_label },
      { num: page.trust_stat_3_number, lbl: page.trust_stat_3_label },
    ].filter(s => s.num).map((stat, i, arr) => (
      <div key={i} style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 20px",
        borderRight: i < arr.length - 1 ? `1px solid ${page.hero_image_url ? "rgba(255,255,255,0.3)" : cardBorder}` : undefined,
      }}>
        <span style={{
          fontSize: 22,
          fontWeight: 800,
          color: page.hero_image_url ? "#ffffff" : safeAccent,
          fontFamily: page.font_family || "Arial, sans-serif",
          lineHeight: 1.1,
        }}>
          {stat.num}
        </span>
        {stat.lbl && (
          <span style={{
            fontSize: 11,
            color: page.hero_image_url ? "rgba(255,255,255,0.75)" : textMuted,
            marginTop: 2,
            textAlign: "center",
          }}>
            {stat.lbl}
          </span>
        )}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/PublicLandingPage.tsx
git commit -m "feat(landing): add trust strip below hero headline"
```

---

## Task 12: Public Page — Sticky Mobile CTA

**Files:**
- Modify: `src/pages/PublicLandingPage.tsx`

- [ ] **Step 1: Add `id="booking-section"` to booking div**

Find the booking section wrapper (around line 308):
```tsx
{page.show_booking && (() => {
```

The outer `<div>` inside the IIFE (the card div with `boxShadow`) needs the ID. It's actually the `<div style={{ background: cardBg, borderRadius: 12...` line. Add `id="booking-section"` to whichever `<div>` wraps the booking content. The simplest approach — add a wrapper div just inside the booking IIFE:

Find in the calendar embed branch:
```tsx
<div style={{ background: cardBg, borderRadius: 12, overflow: "hidden", boxShadow: ...
```

Change to:
```tsx
<div id="booking-section" style={{ background: cardBg, borderRadius: 12, overflow: "hidden", boxShadow: ...
```

Do the same for the vimeo and cta booking type divs (add `id="booking-section"` to the first div in each branch).

- [ ] **Step 2: Add sticky mobile CTA bar**

At the very end of the return, just before the final `</div>` that closes the root element, add:

```tsx
{/* Sticky Mobile CTA */}
{(page.show_sticky_cta ?? true) && (
  <div style={{
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    padding: "12px 16px",
    background: bgBase,
    borderTop: `1px solid ${cardBorder}`,
    display: "block",
  }}
    className="sm:hidden"
  >
    <button
      onClick={() => document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth" })}
      style={{
        width: "100%",
        background: safeAccent,
        color: hexLuminance(safeAccent) > 0.35 ? "#1a1a1a" : "#ffffff",
        fontFamily: page.font_family || "Arial, sans-serif",
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        border: "none",
        borderRadius: 10,
        padding: "15px 24px",
        cursor: "pointer",
        boxShadow: `0 4px 16px ${safeAccent}44`,
      }}
    >
      {page.cta_button_text || "Book Now"}
    </button>
  </div>
)}
```

Note: `className="sm:hidden"` uses Tailwind to hide on screens ≥640px. Since `PublicLandingPage` uses inline styles, Tailwind CDN is NOT loaded — use a media query approach instead:

Replace `className="sm:hidden"` with inline style and a `<style>` tag. Change to:

```tsx
{(page.show_sticky_cta ?? true) && (
  <>
    <style>{`@media (min-width: 640px) { #sticky-cta-bar { display: none !important; } }`}</style>
    <div id="sticky-cta-bar" style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      padding: "12px 16px",
      background: bgBase,
      borderTop: `1px solid ${cardBorder}`,
    }}>
      <button
        onClick={() => document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth" })}
        style={{
          width: "100%",
          background: safeAccent,
          color: hexLuminance(safeAccent) > 0.35 ? "#1a1a1a" : "#ffffff",
          fontFamily: page.font_family || "Arial, sans-serif",
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          border: "none",
          borderRadius: 10,
          padding: "15px 24px",
          cursor: "pointer",
          boxShadow: `0 4px 16px ${safeAccent}44`,
        }}
      >
        {page.cta_button_text || "Book Now"}
      </button>
    </div>
  </>
)}
```

Also add `paddingBottom: 80` to the root div's style so content isn't hidden behind the sticky bar on mobile:

```tsx
<div style={{ fontFamily: ..., background: bg1, minHeight: "100vh", paddingBottom: (page.show_sticky_cta ?? true) ? 80 : 0 }}>
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicLandingPage.tsx
git commit -m "feat(landing): add sticky mobile CTA button to public page"
```

---

## Task 13: Public Page — Dynamic FB Pixel

**Files:**
- Modify: `src/pages/PublicLandingPage.tsx`

- [ ] **Step 1: Replace hardcoded DOMAIN_PIXELS with dynamic field**

Find the Facebook Pixel `useEffect` (around line 175). Replace the entire `useEffect` with:

```typescript
// Facebook Pixel — keyed by page.fb_pixel_id (or legacy domain map)
useEffect(() => {
  if (!page) return;
  const LEGACY_DOMAIN_PIXELS: Record<string, string> = {
    "saratogachiropracticutah.store": "942091105339252",
  };
  const pixelId = page.fb_pixel_id || LEGACY_DOMAIN_PIXELS[hostname] || null;
  if (!pixelId || document.getElementById("fb-pixel-script")) return;

  const script = document.createElement("script");
  script.id = "fb-pixel-script";
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  const inline = document.createElement("script");
  inline.id = "fb-pixel-init";
  inline.textContent = `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];}(window,document,'script','','','','');
    fbq('init','${pixelId}');
    fbq('track','PageView');
  `;
  document.head.appendChild(inline);

  const ns = document.createElement("noscript");
  ns.id = "fb-pixel-noscript";
  ns.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1" />`;
  document.body.appendChild(ns);

  return () => {
    document.getElementById("fb-pixel-script")?.remove();
    document.getElementById("fb-pixel-init")?.remove();
    document.getElementById("fb-pixel-noscript")?.remove();
    delete (window as any).fbq;
    delete (window as any)._fbq;
  };
}, [page, hostname]);
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/PublicLandingPage.tsx
git commit -m "feat(landing): replace hardcoded FB Pixel map with per-client dynamic field"
```

---

## Task 14: Build + Deploy

- [ ] **Step 1: Full build**

```bash
cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -20
```

Expected: build succeeds, no TypeScript errors, `dist/` generated.

- [ ] **Step 2: Deploy to VPS (tarball method)**

```bash
cd /Users/admin/Desktop/connectacreators
tar czf dist.tar.gz dist/
```

Then SCP tarball to VPS, extract, copy index.html (per standard VPS deploy procedure).

- [ ] **Step 3: Smoke test**

1. Open an existing client's landing page builder
2. Verify new tabs/fields appear: hero image upload (Branding), font picker (Branding), headline templates (CTA Text), CTA dropdown (CTA Text), trust stats (CTA Text), FB Pixel (SEO), sticky CTA toggle (Booking)
3. Fill in a trust stat, save, view the public page — verify stat shows below headline
4. Set a font, save, view public page — verify font changes
5. On mobile (or DevTools mobile), verify sticky CTA bar appears at bottom
6. Set an FB Pixel ID, save, view public page source — verify `fbq('init','...')` is present

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(landing): full conversion upgrade — font, hero image, trust strip, sticky CTA, FB Pixel"
```
