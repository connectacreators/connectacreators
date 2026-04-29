# Native Lead Form — Design Spec
**Date:** 2026-04-29
**Replaces:** Calendly integration (`https://calendly.com/robertogaunaj/demo-presentation`)

---

## Overview

Replace all Calendly CTA buttons on `src/pages/Index.tsx` with a scroll-to-section anchor. Add a native multi-step lead qualification form as an inline section on the landing page. Leads are saved to Supabase and trigger an email notification to the team via Gmail SMTP.

---

## User Flow

### Branch A — Negocio Físico (7 steps)

1. Nicho
2. Tipo de negocio → selecciona "Negocio físico"
3. Ubicación (geolocalización auto-fill + editable)
4. Animación "Verificando disponibilidad en [ciudad]..." (3s, always resolves yes)
5. Ingresos mensuales
6. Disposición a invertir
7. Datos de contacto → submit

### Branch B — Negocio Online (5 steps)

1. Nicho
2. Tipo de negocio → selecciona "Vendo online"
3. Ingresos mensuales
4. Disposición a invertir
5. Datos de contacto → submit

Steps 3–4 from Branch A (location + city animation) are skipped entirely for online businesses.

---

## Steps Detail

### Step 1 — Nicho
**Question:** ¿Cuál es tu nicho o industria?
**Type:** Single-select grid (2 columns)
**Options:**
- Salud y Bienestar
- Fitness y Nutricion
- Dental y Estetica
- Bienes Raices
- Servicios Legales
- Belleza y Cuidado Personal
- Restaurantes y Food
- Otro

### Step 2 — Tipo de negocio
**Question:** ¿Tienes un negocio fisico o vendes online?
**Type:** Single-select (2 large options)
**Options:**
- Negocio fisico → branches to Step 3A (location)
- Vendo online → skips to Step 3B (ingresos)

### Step 3A — Ubicacion (physical only)
**Question:** ¿Donde esta ubicado tu negocio?
**Type:** Auto-detected via browser Geolocation API, displayed as editable fields
**Fields:** Ciudad (text), Estado (text)
**Fallback:** If geolocation denied, show empty editable fields

### Step 4A — Animacion ciudad (physical only)
**Behavior:**
- Show spinner + text: "Verificando disponibilidad en [ciudad]..."
- Duration: 3 seconds (hardcoded timeout, no real API call)
- Always resolves to: "Tu ciudad esta disponible — Cupos limitados"
- Purpose: creates exclusivity perception

### Step 3B (online) / Step 5 (physical) — Ingresos mensuales
**Question:** ¿Cuanto genera tu negocio actualmente por mes?
**Type:** Single-select
**Options:**
- Menos de $3,000 / mes
- Entre $3,000 y $10,000 / mes
- Entre $10,000 y $30,000 / mes
- Mas de $30,000 / mes

### Step 4B (online) / Step 6 (physical) — Disposicion a invertir
**Question:** ¿Estas dispuesto a invertir entre $1,500 y $4,000 al mes para hacer crecer tu negocio?
**Type:** Single-select
**Options:**
- Si, estoy listo para invertir → qualified
- Necesito mas informacion primero → qualified
- En los proximos 30 a 60 dias → qualified
- Todavia no es el momento → disqualified

**Disqualification logic:** If "Todavia no es el momento" is selected, lead is saved with `status: "no_calificado"` and shown an alternate confirmation screen. No email notification is sent for disqualified leads.

### Step 5B (online) / Step 7 (physical) — Datos de contacto
**Question:** ¡Casi listo! ¿Como te contactamos?
**Fields:**
- Nombre completo (required)
- Numero de WhatsApp (required, tel input)
- Correo electronico (required, email input)
**CTA button:** "SOLICITAR MI ESTRATEGIA GRATUITA"

---

## Confirmation Screens

### Qualified lead
> ¡Solicitud recibida, [Nombre]! Un estratega de Connecta Creators se pondra en contacto contigo en las proximas 24 horas via WhatsApp.

### Disqualified lead
> Gracias por tu interes. Cuando estes listo para dar el siguiente paso, estaremos aqui. Te guardamos en nuestra lista.

---

## Data Model

New table: `leads`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auto |
| niche | text | step 1 value |
| business_type | text | "fisico" or "online" |
| city | text | null for online |
| state | text | null for online |
| revenue_range | text | step value |
| investment_ready | text | step value |
| name | text | |
| phone | text | |
| email | text | |
| status | text | "calificado" or "no_calificado" |
| created_at | timestamptz | default now() |

RLS: insert allowed for anon (public form), select restricted to authenticated users only.

---

## Backend — Email Notification

**Trigger:** On qualified lead submission only (`status = "calificado"`)
**Method:** Supabase Edge Function `send-lead-notification`
**Transport:** Gmail SMTP via Deno SMTP library (`deno.land/x/smtp`)

**SMTP config (stored as Supabase secrets):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=admin@connectacreators.com
SMTP_PASS=[app password — stored in Supabase vault, never in code]
SMTP_TO=admin@connectacreators.com
```

**Email content:**
- Subject: `Nuevo lead calificado — [Nombre] ([ciudad o "Online"])`
- Body: all lead fields formatted in plain text

---

## Frontend Integration

- All 5 `ApplyBtn` instances in `Index.tsx` replaced with a scroll-to-section anchor (`href="#aplicar"`)
- New `<LeadForm />` component added as a full-width section with `id="aplicar"` near the bottom of the page, above the final CTA
- Form state managed locally with `useState` (no external form library needed)
- No page navigation — form lives entirely inline
- On submit: calls Supabase client to insert lead, then calls Edge Function

---

## Style

- No emojis
- Font: Montserrat (matches rest of page)
- Background: dark (#111 or #0a0a0a) to visually separate from surrounding sections
- Active step indicator: horizontal step dots at top of form — total count updates dynamically (5 dots for online, 7 for physical) once branch is determined at step 2
- Brand color (#0891B2) for selected options and CTA button
- City animation spinner: amber (#f59e0b)
- Success state: green (#22c55e)
