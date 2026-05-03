# Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contract signing system inside each client's detail page — admins upload PDFs, sign first, then send to clients to sign via email link or in-app, with signatures overlaid on the bottom of the last PDF page.

**Architecture:** Two Supabase Edge Functions handle all PDF work (`sign-contract` uses pdf-lib + embedded TTF fonts to composite signatures; `send-contract` generates a signing token and sends an email via SMTP). The frontend adds a `ContractsPage` at `/clients/:clientId/contracts`, three modal components, and a public signing page at `/contract/:token`.

**Tech Stack:** pdf-lib@1.17.1 (Deno), @pdf-lib/fontkit@1.1.1, denomailer (SMTP email), Supabase Storage (private buckets), React + shadcn/ui + Lucide icons, Google Fonts (Dancing Script, Great Vibes, Pinyon Script).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260502_contracts.sql` | Tables, RLS, storage buckets |
| Create | `supabase/functions/sign-contract/index.ts` | PDF signing Edge Function |
| Create | `supabase/functions/sign-contract/fonts/DancingScript-Regular.ttf` | Bundled font |
| Create | `supabase/functions/sign-contract/fonts/GreatVibes-Regular.ttf` | Bundled font |
| Create | `supabase/functions/sign-contract/fonts/PinyonScript-Regular.ttf` | Bundled font |
| Create | `supabase/functions/send-contract/index.ts` | Delivery Edge Function |
| Create | `src/pages/PublicContract.tsx` | Public signing page (no auth) |
| Create | `src/pages/ContractsPage.tsx` | Contract list for a client |
| Create | `src/components/contracts/ContractUploadModal.tsx` | Upload PDF / pick template |
| Create | `src/components/contracts/SigningModal.tsx` | Admin in-app signing experience |
| Create | `src/components/contracts/SendContractModal.tsx` | Delivery method selection |
| Modify | `src/App.tsx` | Add two new routes |
| Modify | `src/pages/ClientDetail.tsx` | Add Contracts card to setup grid |
| Modify | `src/components/DashboardSidebar.tsx` | Add Contracts link for client role |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260502_contracts.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260502_contracts.sql

-- Storage buckets (private — signed URLs only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('contracts', 'contracts', false, 10485760, array['application/pdf']),
  ('contract-templates', 'contract-templates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- contract_templates: reusable base PDFs (admin-managed, not client-specific)
create table if not exists contract_templates (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users not null,
  name        text not null,
  storage_path text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table contract_templates enable row level security;

-- contracts: one row per contract instance tied to a client
create table if not exists contracts (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid references clients not null,
  template_id           uuid references contract_templates,
  created_by            uuid references auth.users not null,
  title                 text not null,
  status                text not null default 'draft'
                          check (status in ('draft','awaiting_client','complete','voided')),
  original_storage_path text not null,
  current_storage_path  text,
  admin_signed_at       timestamptz,
  admin_signature_name  text,
  admin_signature_font  text,
  client_signed_at      timestamptz,
  client_signature_name text,
  client_signature_font text,
  send_method           text check (send_method in ('email','in_app')),
  client_email          text,
  send_message          text,
  signing_token         uuid unique,
  signing_token_expires_at timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
alter table contracts enable row level security;

-- RLS: contract_templates — admin full access only
create policy "admin_all_contract_templates" on contract_templates
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- RLS: contracts — admin full access
create policy "admin_all_contracts" on contracts
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- RLS: contracts — client can read their own in-app contracts
create policy "client_read_own_contracts" on contracts
  for select using (
    exists (
      select 1 from clients c
      where c.id = contracts.client_id
        and c.user_id = auth.uid()
        and contracts.send_method = 'in_app'
        and contracts.status in ('awaiting_client', 'complete')
    )
  );

-- Storage RLS: contracts bucket — admin upload/read
create policy "admin_manage_contracts_storage" on storage.objects
  for all using (
    bucket_id = 'contracts'
    and exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Storage RLS: contract-templates bucket — admin upload/read
create policy "admin_manage_templates_storage" on storage.objects
  for all using (
    bucket_id = 'contract-templates'
    and exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with project_id `hxojqrilwhhrvloiwmfo`, name `contracts`, and the SQL above.

- [ ] **Step 3: Verify tables exist**

Use `mcp__plugin_supabase_supabase__execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('contracts', 'contract_templates');
```
Expected: two rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260502_contracts.sql
git commit -m "feat(contracts): add DB tables, RLS, and storage buckets"
```

---

## Task 2: Download Font Files

**Files:**
- Create: `supabase/functions/sign-contract/fonts/DancingScript-Regular.ttf`
- Create: `supabase/functions/sign-contract/fonts/GreatVibes-Regular.ttf`
- Create: `supabase/functions/sign-contract/fonts/PinyonScript-Regular.ttf`

- [ ] **Step 1: Create the fonts directory and download the TTF files**

```bash
mkdir -p supabase/functions/sign-contract/fonts

curl -L "https://github.com/google/fonts/raw/main/ofl/dancingscript/static/DancingScript-Regular.ttf" \
  -o supabase/functions/sign-contract/fonts/DancingScript-Regular.ttf

curl -L "https://github.com/google/fonts/raw/main/ofl/greatvibes/GreatVibes-Regular.ttf" \
  -o supabase/functions/sign-contract/fonts/GreatVibes-Regular.ttf

curl -L "https://github.com/google/fonts/raw/main/ofl/pinyonscript/PinyonScript-Regular.ttf" \
  -o supabase/functions/sign-contract/fonts/PinyonScript-Regular.ttf
```

- [ ] **Step 2: Verify files downloaded successfully**

```bash
ls -lh supabase/functions/sign-contract/fonts/
```
Expected: three `.ttf` files, each between 100KB–500KB. If any file is 0 bytes or missing, download manually from fonts.google.com (search the font name → Download family → extract TTF from zip).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sign-contract/fonts/
git commit -m "feat(contracts): add bundled TTF fonts for PDF signing"
```

---

## Task 3: `sign-contract` Edge Function

**Files:**
- Create: `supabase/functions/sign-contract/index.ts`

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/sign-contract/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FONT_MAP: Record<string, string> = {
  "dancing-script": "./fonts/DancingScript-Regular.ttf",
  "great-vibes":    "./fonts/GreatVibes-Regular.ttf",
  "pinyon-script":  "./fonts/PinyonScript-Regular.ttf",
};

async function loadFont(fontKey: string): Promise<Uint8Array> {
  const path = FONT_MAP[fontKey] ?? FONT_MAP["dancing-script"];
  const url = new URL(path, import.meta.url);
  return new Uint8Array(await Deno.readFile(url.pathname));
}

function formatTimestamp(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

async function overlaySignatureBlock(
  pdfBytes: Uint8Array,
  adminName: string | null,
  adminFont: string | null,
  adminDate: Date | null,
  clientName: string | null,
  clientFont: string | null,
  clientDate: Date | null,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width, height } = lastPage.getSize();

  const marginX = 50;
  const marginY = 40;
  const colWidth = (width - marginX * 2 - 20) / 2;
  const ruleY = marginY + 75;

  // Embed fonts needed for this render
  const fontsToLoad = new Set<string>();
  if (adminFont) fontsToLoad.add(adminFont);
  if (clientFont) fontsToLoad.add(clientFont);
  if (fontsToLoad.size === 0) fontsToLoad.add("dancing-script");

  const embeddedFonts: Record<string, Awaited<ReturnType<typeof pdfDoc.embedFont>>> = {};
  for (const key of fontsToLoad) {
    const bytes = await loadFont(key);
    embeddedFonts[key] = await pdfDoc.embedFont(bytes);
  }
  const fallbackFont = embeddedFonts[fontsToLoad.values().next().value];

  // Draw horizontal rule
  lastPage.drawLine({
    start: { x: marginX, y: ruleY },
    end:   { x: width - marginX, y: ruleY },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });

  // --- Left column: Agency ---
  lastPage.drawText("Agency", {
    x: marginX, y: ruleY - 14,
    size: 7, color: rgb(0.5, 0.5, 0.5),
  });

  if (adminName && adminFont) {
    const aFont = embeddedFonts[adminFont] ?? fallbackFont;
    lastPage.drawText(adminName, {
      x: marginX, y: ruleY - 34,
      size: 14, font: aFont, color: rgb(0.1, 0.1, 0.1),
    });
    lastPage.drawText(formatTimestamp(adminDate ?? new Date()), {
      x: marginX, y: ruleY - 52,
      size: 7, color: rgb(0.55, 0.55, 0.55),
    });
  } else {
    lastPage.drawLine({
      start: { x: marginX, y: ruleY - 38 },
      end:   { x: marginX + colWidth, y: ruleY - 38 },
      thickness: 0.4, color: rgb(0.8, 0.8, 0.8),
    });
  }

  // --- Right column: Client ---
  const rightX = marginX + colWidth + 20;
  lastPage.drawText("Client", {
    x: rightX, y: ruleY - 14,
    size: 7, color: rgb(0.5, 0.5, 0.5),
  });

  if (clientName && clientFont) {
    const cFont = embeddedFonts[clientFont] ?? fallbackFont;
    lastPage.drawText(clientName, {
      x: rightX, y: ruleY - 34,
      size: 14, font: cFont, color: rgb(0.1, 0.1, 0.1),
    });
    lastPage.drawText(formatTimestamp(clientDate ?? new Date()), {
      x: rightX, y: ruleY - 52,
      size: 7, color: rgb(0.55, 0.55, 0.55),
    });
  } else {
    lastPage.drawLine({
      start: { x: rightX, y: ruleY - 38 },
      end:   { x: rightX + colWidth, y: ruleY - 38 },
      thickness: 0.4, color: rgb(0.8, 0.8, 0.8),
    });
    lastPage.drawText("Awaiting signature", {
      x: rightX, y: ruleY - 52,
      size: 7, color: rgb(0.7, 0.7, 0.7),
    });
  }

  return pdfDoc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { contract_id, role, signature_name, signature_font, signing_token } = await req.json();

    if (!contract_id || !role || !signature_name || !signature_font) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!FONT_MAP[signature_font]) {
      return new Response(JSON.stringify({ error: "Invalid font" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the contract
    const { data: contract, error: fetchErr } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (fetchErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth validation
    if (role === "admin") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: { user }, error: userErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleRow } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).single();
      if (roleRow?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (contract.status !== "draft") {
        return new Response(JSON.stringify({ error: "Contract already signed by admin" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (role === "client") {
      const authHeader = req.headers.get("Authorization");

      if (signing_token) {
        // Email-link signing: validate token
        if (contract.signing_token !== signing_token) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (new Date(contract.signing_token_expires_at) < new Date()) {
          return new Response(JSON.stringify({ error: "Signing link has expired" }), {
            status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (authHeader) {
        // In-app signing: validate JWT + client ownership
        const { data: { user }, error: userErr } = await supabase.auth.getUser(
          authHeader.replace("Bearer ", "")
        );
        if (userErr || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: clientRow } = await supabase
          .from("clients").select("id").eq("id", contract.client_id).eq("user_id", user.id).single();
        if (!clientRow) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (contract.status !== "awaiting_client") {
        return new Response(JSON.stringify({ error: "Contract not awaiting client signature" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the source PDF (original for admin, admin-signed for client)
    const sourcePath = role === "admin"
      ? contract.original_storage_path
      : contract.current_storage_path ?? contract.original_storage_path;

    const { data: fileData, error: dlErr } = await supabase.storage
      .from("contracts").download(sourcePath);
    if (dlErr || !fileData) {
      return new Response(JSON.stringify({ error: "Failed to load PDF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    const now = new Date();

    // Prepare both columns for the overlay
    const adminName = role === "admin" ? signature_name : contract.admin_signature_name;
    const adminFont = role === "admin" ? signature_font : contract.admin_signature_font;
    const adminDate = role === "admin" ? now : (contract.admin_signed_at ? new Date(contract.admin_signed_at) : null);
    const clientName = role === "client" ? signature_name : null;
    const clientFont = role === "client" ? signature_font : null;
    const clientDate = role === "client" ? now : null;

    const signedPdfBytes = await overlaySignatureBlock(
      pdfBytes, adminName, adminFont, adminDate, clientName, clientFont, clientDate
    );

    // Determine output path
    const outputFilename = role === "admin" ? "admin-signed.pdf" : "signed.pdf";
    const outputPath = `${contract.client_id}/${contract.id}/${outputFilename}`;

    const { error: upErr } = await supabase.storage
      .from("contracts")
      .upload(outputPath, signedPdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: "Failed to save signed PDF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update contracts row
    const updatePayload: Record<string, unknown> = {
      current_storage_path: outputPath,
      updated_at: now.toISOString(),
    };

    if (role === "admin") {
      updatePayload.admin_signed_at = now.toISOString();
      updatePayload.admin_signature_name = signature_name;
      updatePayload.admin_signature_font = signature_font;
      // Status stays 'draft' until send-contract is called
    } else {
      updatePayload.client_signed_at = now.toISOString();
      updatePayload.client_signature_name = signature_name;
      updatePayload.client_signature_font = signature_font;
      updatePayload.status = "complete";
    }

    await supabase.from("contracts").update(updatePayload).eq("id", contract_id);

    return new Response(JSON.stringify({ success: true, path: outputPath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sign-contract error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy the Edge Function**

```bash
npx supabase functions deploy sign-contract --project-ref hxojqrilwhhrvloiwmfo
```
Expected output: `Deployed sign-contract`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sign-contract/
git commit -m "feat(contracts): sign-contract Edge Function with pdf-lib overlay"
```

---

## Task 4: `send-contract` Edge Function

**Files:**
- Create: `supabase/functions/send-contract/index.ts`

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/send-contract/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateToken(): string {
  return crypto.randomUUID();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate admin JWT
    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { contract_id, send_method, client_email, message } = await req.json();

    if (!contract_id || !send_method) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: fetchErr } = await supabase
      .from("contracts").select("*").eq("id", contract_id).single();
    if (fetchErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contract.admin_signed_at) {
      return new Response(JSON.stringify({ error: "Admin must sign before sending" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signingToken = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await supabase.from("contracts").update({
      status: "awaiting_client",
      send_method,
      client_email: client_email ?? contract.client_email,
      send_message: message ?? null,
      signing_token: signingToken,
      signing_token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", contract_id);

    if (send_method === "email" && client_email) {
      const appUrl = Deno.env.get("APP_URL") ?? "https://connectacreators.com";
      const signingUrl = `${appUrl}/contract/${signingToken}`;

      const smtpHost = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
      const smtpPort = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
      const smtpUser = Deno.env.get("SMTP_USER") ?? "";
      const smtpPass = Deno.env.get("SMTP_PASS") ?? "";

      if (smtpUser && smtpPass) {
        const subject = `Please sign: ${contract.title}`;
        const bodyText = [
          message ? `${message}\n\n` : "",
          `Please review and sign the contract "${contract.title}" using the link below:\n`,
          signingUrl,
          "\n\nThis link expires in 30 days.",
        ].join("");

        const htmlBody = `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <h2 style="margin:0 0 16px;font-size:18px;">Contract ready for your signature</h2>
            ${message ? `<p style="color:#555;margin:0 0 16px;">${message}</p>` : ""}
            <p style="color:#333;margin:0 0 24px;">
              Please review and sign <strong>${contract.title}</strong>.
            </p>
            <a href="${signingUrl}"
               style="display:inline-block;background:#d4af37;color:#000;font-weight:700;
                      padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;">
              Review &amp; Sign
            </a>
            <p style="color:#999;font-size:12px;margin-top:24px;">
              This link expires in 30 days. If you did not expect this, you can ignore it.
            </p>
          </div>`;

        try {
          const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
          const client = new SMTPClient({
            connection: {
              hostname: smtpHost,
              port: smtpPort,
              tls: false,
              auth: { username: smtpUser, password: smtpPass },
            },
          });
          await client.send({
            from: smtpUser,
            to: client_email,
            subject,
            content: bodyText,
            html: htmlBody,
          });
          await client.close();
        } catch (emailErr) {
          console.error("Email send error:", emailErr);
          // Don't fail the request — contract is already updated in DB
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-contract error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy the Edge Function**

```bash
npx supabase functions deploy send-contract --project-ref hxojqrilwhhrvloiwmfo
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-contract/
git commit -m "feat(contracts): send-contract Edge Function with SMTP email"
```

---

## Task 5: Public Signing Page + Route

**Files:**
- Create: `src/pages/PublicContract.tsx`
- Modify: `src/App.tsx` — add `/contract/:token` route

- [ ] **Step 1: Create `PublicContract.tsx`**

```tsx
// src/pages/PublicContract.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FONTS = [
  { key: "dancing-script", label: "Dancing Script", family: "'Dancing Script', cursive" },
  { key: "great-vibes",    label: "Great Vibes",    family: "'Great Vibes', cursive"    },
  { key: "pinyon-script",  label: "Pinyon Script",  family: "'Pinyon Script', cursive"  },
];

export default function PublicContract() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [font, setFont] = useState("dancing-script");
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Load Google Fonts
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Pinyon+Script&display=swap";
    document.head.appendChild(link);

    async function load() {
      try {
        const { data, error: fetchErr } = await supabase
          .from("contracts")
          .select("id,title,status,current_storage_path,signing_token_expires_at,admin_signature_name,client_signed_at")
          .eq("signing_token", token!)
          .single();

        if (fetchErr || !data) { setError("Contract not found."); return; }
        if (data.status !== "awaiting_client") {
          setError(data.client_signed_at ? "This contract has already been signed." : "This contract is not ready for signing.");
          return;
        }
        if (new Date(data.signing_token_expires_at) < new Date()) {
          setError("This signing link has expired. Please contact the sender for a new link.");
          return;
        }

        setContract(data);

        // Get signed URL for PDF preview
        const { data: urlData } = await supabase.storage
          .from("contracts")
          .createSignedUrl(data.current_storage_path, 3600);
        if (urlData?.signedUrl) setPdfUrl(urlData.signedUrl);
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const handleSign = async () => {
    if (!name.trim()) { toast.error("Please enter your full name"); return; }
    setSigning(true);
    try {
      const { error } = await supabase.functions.invoke("sign-contract", {
        body: {
          contract_id: contract.id,
          role: "client",
          signature_name: name.trim(),
          signature_font: font,
          signing_token: token,
        },
      });
      if (error) throw new Error(error.message);
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to sign. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3 px-4">
        <FileText className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-4">
        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
        <h2 className="text-lg font-semibold text-foreground">Contract signed</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Thank you. Your signature has been recorded. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* PDF Viewer */}
      <div className="flex-1 flex flex-col border-r border-border/40">
        <div className="px-4 py-3 border-b border-border/40 bg-card/20">
          <p className="text-sm font-semibold text-foreground">{contract?.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Review the document before signing</p>
        </div>
        <div className="flex-1 bg-muted/10">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full min-h-[600px]" title="Contract PDF" />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Unable to load PDF preview
            </div>
          )}
        </div>
      </div>

      {/* Signature Panel */}
      <div className="w-72 flex-shrink-0 flex flex-col p-5 gap-5 bg-card/10">
        <div>
          <p className="text-sm font-bold text-foreground">Your signature</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Type your full name. It will appear in cursive on the document.
          </p>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Full name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="text-sm"
          />
        </div>

        {name && (
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Preview</Label>
            <div className="bg-white border border-border rounded-md px-3 py-2 text-center">
              <span style={{ fontFamily: FONTS.find(f => f.key === font)?.family, fontSize: "24px", color: "#111" }}>
                {name}
              </span>
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Style</Label>
          <div className="flex flex-col gap-2">
            {FONTS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFont(f.key)}
                className={`text-left px-3 py-2 rounded-md border transition-all ${
                  font === f.key
                    ? "border-primary bg-primary/5"
                    : "border-border/40 bg-card/30 hover:border-border"
                }`}
              >
                <span style={{ fontFamily: f.family, fontSize: "18px", color: font === f.key ? "#d4af37" : "#888" }}>
                  {name || "Your Name"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          By signing, you agree this constitutes a legally binding electronic signature.
        </p>

        <Button
          onClick={handleSign}
          disabled={signing || !name.trim()}
          className="w-full btn-17-primary gap-2"
        >
          {signing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Sign Document
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route to `App.tsx`**

In `src/App.tsx`, find the public routes block (around line 110) and add:
```tsx
<Route path="/contract/:token" element={<PublicContract />} />
```
Also add the lazy import at the top with the other lazy imports:
```tsx
const PublicContract = lazy(() => import("./pages/PublicContract"));
```

- [ ] **Step 3: Verify type-check passes**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "PublicContract\|public-contract" | head -10
```
Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicContract.tsx src/App.tsx
git commit -m "feat(contracts): public signing page at /contract/:token"
```

---

## Task 6: `ContractsPage` + Route + ClientDetail Card

**Files:**
- Create: `src/pages/ContractsPage.tsx`
- Modify: `src/App.tsx` — add `/clients/:clientId/contracts` route
- Modify: `src/pages/ClientDetail.tsx` — add Contracts card

- [ ] **Step 1: Create `ContractsPage.tsx`**

```tsx
// src/pages/ContractsPage.tsx
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ArrowLeft, Plus, FileText, Download, Send,
  CheckCircle2, Clock, FileX, LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ContractUploadModal from "@/components/contracts/ContractUploadModal";
import SigningModal from "@/components/contracts/SigningModal";
import SendContractModal from "@/components/contracts/SendContractModal";

type ContractStatus = "draft" | "awaiting_client" | "complete" | "voided";

interface Contract {
  id: string;
  title: string;
  status: ContractStatus;
  current_storage_path: string | null;
  original_storage_path: string;
  admin_signed_at: string | null;
  admin_signature_name: string | null;
  admin_signature_font: string | null;
  client_signed_at: string | null;
  send_method: string | null;
  client_email: string | null;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  storage_path: string;
}

function statusBadge(status: ContractStatus) {
  const cfg: Record<ContractStatus, { label: string; className: string }> = {
    draft:           { label: "Draft",          className: "bg-muted/50 text-muted-foreground border-border/40" },
    awaiting_client: { label: "Awaiting Client", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    complete:        { label: "Fully Signed",    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    voided:          { label: "Voided",          className: "bg-destructive/10 text-destructive border-destructive/30" },
  };
  const { label, className } = cfg[status] ?? cfg.draft;
  return <Badge variant="outline" className={`text-[10px] px-2 py-0 h-4 ${className}`}>{label}</Badge>;
}

function needsAdminSign(c: Contract) {
  return c.status === "draft" && !c.admin_signed_at;
}

export default function ContractsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fetching, setFetching] = useState(true);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFromTemplate, setUploadFromTemplate] = useState<Template | null>(null);
  const [signingContract, setSigningContract] = useState<Contract | null>(null);
  const [sendingContract, setSendingContract] = useState<Contract | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setFetching(true);
    try {
      const [{ data: clientData }, { data: contractData }, { data: templateData }] = await Promise.all([
        supabase.from("clients").select("name,email").eq("id", clientId).single(),
        supabase.from("contracts").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
        isAdmin ? supabase.from("contract_templates").select("*").order("name") : Promise.resolve({ data: [] }),
      ]);
      setClientName(clientData?.name ?? "");
      setClientEmail(clientData?.email ?? "");
      setContracts((contractData ?? []) as Contract[]);
      setTemplates((templateData ?? []) as Template[]);
    } catch {
      toast.error("Failed to load contracts");
    } finally {
      setFetching(false);
    }
  }, [clientId, isAdmin]);

  useEffect(() => {
    if (!loading && user) fetchData();
  }, [loading, user, fetchData]);

  const handleDownload = async (contract: Contract) => {
    const path = contract.current_storage_path ?? contract.original_storage_path;
    setDownloading(contract.id);
    try {
      const { data } = await supabase.storage.from("contracts").createSignedUrl(path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      else toast.error("Could not generate download link");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(null);
    }
  };

  const handleVoid = async (contract: Contract) => {
    if (!window.confirm("Void this contract? This cannot be undone.")) return;
    const { error } = await supabase.from("contracts").update({ status: "voided" }).eq("id", contract.id);
    if (error) { toast.error("Failed to void contract"); return; }
    toast.success("Contract voided");
    fetchData();
  };

  const handleSaveAsTemplate = async (contract: Contract) => {
    const name = window.prompt("Template name:", contract.title);
    if (!name?.trim()) return;
    const templateId = crypto.randomUUID();
    const destPath = `${templateId}/template.pdf`;
    // Copy original PDF to templates bucket
    const { data: fileData } = await supabase.storage.from("contracts").download(contract.original_storage_path);
    if (!fileData) { toast.error("Could not read contract PDF"); return; }
    const { error: upErr } = await supabase.storage.from("contract-templates").upload(destPath, fileData, { contentType: "application/pdf" });
    if (upErr) { toast.error("Failed to save template"); return; }
    const { error: dbErr } = await supabase.from("contract_templates").insert({
      id: templateId, name: name.trim(), storage_path: destPath, created_by: user!.id,
    });
    if (dbErr) { toast.error("Failed to save template"); return; }
    toast.success("Template saved");
    fetchData();
  };

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageTransition className="flex-1 flex flex-col min-h-screen">
      <div className="flex-1 px-4 sm:px-8 py-8 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {clientName || "Client"}
          </button>
          <span className="text-muted-foreground/30">/</span>
          <h1 className="text-lg font-bold text-foreground">Contracts</h1>
          {isAdmin && (
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline" size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => { setUploadFromTemplate(null); setShowUpload(true); }}
              >
                <LayoutTemplate className="w-3 h-3" />
                From Template
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-7 text-xs btn-17-primary"
                onClick={() => { setUploadFromTemplate(null); setShowUpload(true); }}
              >
                <Plus className="w-3 h-3" />
                Upload PDF
              </Button>
            </div>
          )}
        </div>

        {/* Contract list */}
        {contracts.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No contracts yet</p>
            {isAdmin && (
              <Button
                variant="outline" size="sm"
                className="mt-4 gap-2"
                onClick={() => setShowUpload(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Upload first contract
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-8">
            {contracts.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border bg-card/30 px-4 py-3 flex items-center gap-4 transition-all ${
                  needsAdminSign(c) ? "border-primary/40 hover:border-primary/60" : "border-border/50 hover:border-border/80"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                  c.status === "complete"
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : c.status === "awaiting_client" || needsAdminSign(c)
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-muted/30 border-border/30"
                }`}>
                  <FileText className={`w-4 h-4 ${
                    c.status === "complete" ? "text-emerald-400"
                    : c.status === "awaiting_client" || needsAdminSign(c) ? "text-amber-400"
                    : "text-muted-foreground"
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                    {c.admin_signed_at && ` · You signed ${new Date(c.admin_signed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    {c.client_signed_at && ` · Client signed ${new Date(c.client_signed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {statusBadge(c.status)}

                  {isAdmin && needsAdminSign(c) && (
                    <Button
                      size="sm"
                      className="h-7 text-xs btn-17-primary gap-1"
                      onClick={() => setSigningContract(c)}
                    >
                      Sign
                      <ArrowLeft className="w-3 h-3 rotate-180" />
                    </Button>
                  )}
                  {isAdmin && c.status === "awaiting_client" && (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setSendingContract(c)}
                    >
                      <Send className="w-3 h-3" />
                      Resend
                    </Button>
                  )}
                  {c.status === "complete" && (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleDownload(c)}
                      disabled={downloading === c.id}
                    >
                      {downloading === c.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Download className="w-3 h-3" />}
                      Download
                    </Button>
                  )}
                  {isAdmin && c.status === "draft" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                      onClick={() => handleVoid(c)}
                    >
                      <FileX className="w-3 h-3" />
                    </Button>
                  )}
                  {isAdmin && c.status === "complete" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-muted-foreground gap-1"
                      onClick={() => handleSaveAsTemplate(c)}
                    >
                      <LayoutTemplate className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Templates section (admin only) */}
        {isAdmin && (
          <div className="border-t border-border/40 pt-6">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Templates</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setUploadFromTemplate(t); setShowUpload(true); }}
                  className="flex items-center gap-2 bg-card/30 border border-border/40 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-all"
                >
                  <LayoutTemplate className="w-3 h-3" />
                  {t.name}
                </button>
              ))}
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 bg-transparent border border-dashed border-border/30 rounded-lg px-3 py-2 text-xs text-muted-foreground/50 hover:border-border/60 hover:text-muted-foreground transition-all"
              >
                <Plus className="w-3 h-3" />
                Save current as template
              </button>
            </div>
          </div>
        )}
      </div>

      {showUpload && (
        <ContractUploadModal
          clientId={clientId!}
          fromTemplate={uploadFromTemplate}
          onClose={() => { setShowUpload(false); setUploadFromTemplate(null); }}
          onCreated={() => { setShowUpload(false); setUploadFromTemplate(null); fetchData(); }}
        />
      )}
      {signingContract && (
        <SigningModal
          contract={signingContract}
          onClose={() => setSigningContract(null)}
          onSigned={(updatedContract) => { setSigningContract(null); setSendingContract(updatedContract); fetchData(); }}
        />
      )}
      {sendingContract && (
        <SendContractModal
          contract={sendingContract}
          defaultEmail={clientEmail}
          onClose={() => setSendingContract(null)}
          onSent={() => { setSendingContract(null); fetchData(); }}
        />
      )}
    </PageTransition>
  );
}
```

- [ ] **Step 2: Add route to `App.tsx`**

Add lazy import at top:
```tsx
const ContractsPage = lazy(() => import("./pages/ContractsPage"));
```
Add route inside the authenticated routes block (after `/clients/:clientId/vault`):
```tsx
<Route path="/clients/:clientId/contracts" element={<ContractsPage />} />
```

- [ ] **Step 3: Add Contracts card to `ClientDetail.tsx`**

In [src/pages/ClientDetail.tsx](src/pages/ClientDetail.tsx), find the `subCards.setup` array and add the Contracts entry. First add `ScrollText` to the lucide import line, then add to the setup cards array:

```tsx
// Add to lucide import: ScrollText

// In subCards.setup array, add:
{
  label: "Contracts",
  description: language === "en" ? "Upload, sign & send contracts" : "Sube, firma y envía contratos",
  icon: ScrollText,
  color: "text-amber-400",
  path: `/clients/${clientId}/contracts`,
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "ContractsPage\|contracts" | head -10
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ContractsPage.tsx src/App.tsx src/pages/ClientDetail.tsx
git commit -m "feat(contracts): contracts list page and navigation"
```

---

## Task 7: `ContractUploadModal`

**Files:**
- Create: `src/components/contracts/ContractUploadModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/contracts/ContractUploadModal.tsx
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  storage_path: string;
}

interface Props {
  clientId: string;
  fromTemplate: Template | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function ContractUploadModal({ clientId, fromTemplate, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState(fromTemplate?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!fromTemplate && !file) { toast.error("Please select a PDF file"); return; }

    setUploading(true);
    try {
      const contractId = crypto.randomUUID();
      const originalPath = `${clientId}/${contractId}/original.pdf`;

      if (fromTemplate) {
        // Copy template PDF to contracts bucket
        const { data: templateFile, error: dlErr } = await supabase.storage
          .from("contract-templates")
          .download(fromTemplate.storage_path);
        if (dlErr || !templateFile) throw new Error("Failed to read template");

        const { error: upErr } = await supabase.storage
          .from("contracts")
          .upload(originalPath, templateFile, { contentType: "application/pdf" });
        if (upErr) throw new Error("Failed to copy template");
      } else {
        if (file!.size > 10 * 1024 * 1024) throw new Error("File must be under 10MB");
        const { error: upErr } = await supabase.storage
          .from("contracts")
          .upload(originalPath, file!, { contentType: "application/pdf" });
        if (upErr) throw new Error("Upload failed");
      }

      const { error: dbErr } = await supabase.from("contracts").insert({
        id: contractId,
        client_id: clientId,
        template_id: fromTemplate?.id ?? null,
        created_by: user!.id,
        title: title.trim(),
        original_storage_path: originalPath,
        status: "draft",
      });
      if (dbErr) throw new Error(dbErr.message);

      toast.success("Contract created");
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create contract");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fromTemplate ? `New contract from: ${fromTemplate.name}` : "Upload Contract PDF"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label className="text-xs mb-1.5 block">Contract title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Service Agreement 2026"
            />
          </div>

          {!fromTemplate && (
            <div>
              <Label className="text-xs mb-1.5 block">PDF file (max 10MB)</Label>
              {file ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-card/30">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-foreground flex-1 truncate">{file.name}</span>
                  <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-border/50 rounded-lg p-6 flex flex-col items-center gap-2 hover:border-border transition-colors"
                >
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Click to select PDF</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={uploading} className="btn-17-primary gap-2">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Creating..." : "Create Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ContractUploadModal" | head -5
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/contracts/ContractUploadModal.tsx
git commit -m "feat(contracts): ContractUploadModal component"
```

---

## Task 8: `SigningModal`

**Files:**
- Create: `src/components/contracts/SigningModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/contracts/SigningModal.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FONTS = [
  { key: "dancing-script", label: "Dancing Script", family: "'Dancing Script', cursive" },
  { key: "great-vibes",    label: "Great Vibes",    family: "'Great Vibes', cursive"    },
  { key: "pinyon-script",  label: "Pinyon Script",  family: "'Pinyon Script', cursive"  },
];

interface Contract {
  id: string;
  title: string;
  original_storage_path: string;
  current_storage_path: string | null;
}

interface Props {
  contract: Contract;
  onClose: () => void;
  onSigned: (updatedContract: Contract) => void;
}

export default function SigningModal({ contract, onClose, onSigned }: Props) {
  const { user } = useAuth();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [font, setFont] = useState("dancing-script");
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    // Load Google Fonts
    if (!document.getElementById("contract-gfonts")) {
      const link = document.createElement("link");
      link.id = "contract-gfonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Pinyon+Script&display=swap";
      document.head.appendChild(link);
    }

    // Pre-fill admin name from profile
    const loadProfile = async () => {
      const { data } = await supabase
        .from("videographers")
        .select("name")
        .eq("user_id", user!.id)
        .single();
      if (data?.name) setName(data.name);
    };
    loadProfile();

    // Load PDF preview URL
    const sourcePath = contract.original_storage_path;
    supabase.storage.from("contracts").createSignedUrl(sourcePath, 3600).then(({ data }) => {
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    });
  }, [contract, user]);

  const handleSign = async () => {
    if (!name.trim()) { toast.error("Please enter your full name"); return; }
    setSigning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sign-contract", {
        body: {
          contract_id: contract.id,
          role: "admin",
          signature_name: name.trim(),
          signature_font: font,
        },
      });
      if (error) throw new Error(error.message);
      toast.success("Document signed");
      onSigned({ ...contract, current_storage_path: data?.path ?? contract.current_storage_path });
    } catch (err: any) {
      toast.error(err.message || "Failed to sign");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex">
      {/* PDF Viewer */}
      <div className="flex-1 flex flex-col border-r border-border/40">
        <div className="px-4 py-3 border-b border-border/40 bg-card/20 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{contract.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sign as Agency</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 bg-muted/10">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full min-h-[600px]" title="Contract" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Signature Panel */}
      <div className="w-72 flex-shrink-0 flex flex-col p-5 gap-5 overflow-y-auto">
        <div>
          <p className="text-sm font-bold text-foreground">Your signature</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Type your full name. It will appear in cursive on the document.
          </p>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="text-sm" />
        </div>

        {name && (
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Preview</Label>
            <div className="bg-white border border-border rounded-md px-3 py-2 text-center">
              <span style={{ fontFamily: FONTS.find(f => f.key === font)?.family, fontSize: "24px", color: "#111" }}>
                {name}
              </span>
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Style</Label>
          <div className="flex flex-col gap-2">
            {FONTS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFont(f.key)}
                className={`text-left px-3 py-2 rounded-md border transition-all ${
                  font === f.key
                    ? "border-primary bg-primary/5"
                    : "border-border/40 bg-card/30 hover:border-border"
                }`}
              >
                <span style={{ fontFamily: f.family, fontSize: "18px", color: font === f.key ? "#d4af37" : "#888" }}>
                  {name || "Your Name"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          By signing, you agree this constitutes a legally binding electronic signature.
        </p>

        <Button onClick={handleSign} disabled={signing || !name.trim()} className="w-full btn-17-primary gap-2">
          {signing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Sign Document
        </Button>

        <Button variant="outline" onClick={onClose} disabled={signing} className="w-full">
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "SigningModal" | head -5
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/contracts/SigningModal.tsx
git commit -m "feat(contracts): SigningModal component"
```

---

## Task 9: `SendContractModal`

**Files:**
- Create: `src/components/contracts/SendContractModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/contracts/SendContractModal.tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, User, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Contract {
  id: string;
  title: string;
}

interface Props {
  contract: Contract;
  defaultEmail: string;
  onClose: () => void;
  onSent: () => void;
}

export default function SendContractModal({ contract, defaultEmail, onClose, onSent }: Props) {
  const [method, setMethod] = useState<"email" | "in_app">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (method === "email" && !email.trim()) { toast.error("Email address is required"); return; }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-contract", {
        body: {
          contract_id: contract.id,
          send_method: method,
          client_email: method === "email" ? email.trim() : null,
          message: message.trim() || null,
        },
      });
      if (error) throw new Error(error.message);
      toast.success(method === "email" ? "Contract sent to client" : "Contract sent to client's dashboard");
      onSent();
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send for Signature</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Confirmation that admin signed */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">{contract.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Your signature is complete</p>
            </div>
          </div>

          {/* Method selector */}
          <div>
            <Label className="text-xs mb-2 block">How should the client sign?</Label>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setMethod("email")}
                className={`text-left p-3 rounded-lg border transition-all ${
                  method === "email" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Send email link</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                  Client gets a unique link by email. No login required.
                </p>
              </button>

              <button
                onClick={() => setMethod("in_app")}
                className={`text-left p-3 rounded-lg border transition-all ${
                  method === "in_app" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">In-app (Connecta account)</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                  Contract appears in client's Connecta dashboard next time they log in.
                </p>
              </button>
            </div>
          </div>

          {method === "email" && (
            <div>
              <Label className="text-xs mb-1.5 block">Client email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>
          )}

          <div>
            <Label className="text-xs mb-1.5 block">Message (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi, please review and sign the attached contract..."
              rows={3}
              className="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending} className="btn-17-primary gap-2">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? "Sending..." : "Send to Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "SendContractModal" | head -5
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/contracts/SendContractModal.tsx
git commit -m "feat(contracts): SendContractModal component"
```

---

## Task 10: Client In-App Contracts + Final Wiring

**Files:**
- Modify: `src/components/DashboardSidebar.tsx` — add Contracts link for client role

- [ ] **Step 1: Add Contracts to client sidebar**

In [src/components/DashboardSidebar.tsx](src/components/DashboardSidebar.tsx), add `ScrollText` to the lucide import, then add the Contracts link to the `isUser` nav items and the subscriber/client nav items (both around line 263 and 287).

Find the subscriber/client `return` block (line ~272) and add to the Resources group:
```tsx
{ label: "Contracts", icon: ScrollText, path: ownClientId ? `/clients/${ownClientId}/contracts` : "/dashboard" },
```

Find the `isUser` block (line ~247) and add to the Resources group:
```tsx
{ label: "Contracts", icon: ScrollText, path: selectedClientId ? `/clients/${selectedClientId}/contracts` : "/dashboard" },
```

- [ ] **Step 2: Full type-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```
Expected: no output (zero errors).

- [ ] **Step 3: End-to-end smoke test**

Manually verify the full flow in the browser:
1. Navigate to a client → Setup → Contracts
2. Click "Upload PDF" → upload a small PDF → confirm contract appears with Draft status
3. Click "Sign" → type name → pick font → click "Sign Document"
4. Confirm SendContractModal opens — switch between Email and In-app
5. Send via email → confirm toast "Contract sent to client"
6. Open `/contract/{token}` in an incognito window — confirm PDF loads and signing works
7. Return to ContractsPage → confirm status is "Fully Signed" and Download button appears

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardSidebar.tsx
git commit -m "feat(contracts): add contracts link to client sidebar + complete wiring"
```

---

## Self-Review Notes

**Spec coverage check:**
- [x] Contracts tab inside client detail → `ContractsPage` at `/clients/:clientId/contracts` + card in `ClientDetail`
- [x] Email link signing → `PublicContract.tsx` at `/contract/:token`
- [x] In-app signing → client sidebar link + RLS policy gates visibility
- [x] Typed name → 3 cursive font options in both `SigningModal` and `PublicContract`
- [x] Admin signs first → status stays `draft` after admin signs, `send-contract` advances to `awaiting_client`
- [x] Signature overlaid at bottom of last page → `overlaySignatureBlock()` in `sign-contract`
- [x] Stored as downloadable PDF → `createSignedUrl` in `handleDownload`
- [x] Templates → `ContractUploadModal` copies template PDF, `handleSaveAsTemplate` saves to templates bucket
- [x] Edge Function approach (pdf-lib) → `sign-contract/index.ts`
- [x] RLS → migration SQL covers admin full access + client read-own

**Type consistency check:**
- `Contract` interface in `ContractsPage` matches fields selected from `contracts` table
- `onSigned` callback passes `Contract` shape — `SigningModal` spreads `contract` + `current_storage_path` override ✓
- `fromTemplate` prop typed as `Template | null` consistently across `ContractsPage` → `ContractUploadModal` ✓
- Font keys (`"dancing-script"`, `"great-vibes"`, `"pinyon-script"`) used consistently across `FONT_MAP` in Edge Function, `FONTS` array in both `SigningModal` and `PublicContract` ✓
