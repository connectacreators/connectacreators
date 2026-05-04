import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import {
  DancingScript_Regular_B64,
  GreatVibes_Regular_B64,
  PinyonScript_Regular_B64,
} from "./fonts-b64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fonts are embedded as base64 in fonts-b64.ts because Supabase Edge Functions
// don't bundle non-source files with the deploy, and external CDNs (jsdelivr)
// were rate-limiting/blocking. Self-contained = always works.
const FONT_B64: Record<string, string> = {
  "dancing-script": DancingScript_Regular_B64,
  "great-vibes":    GreatVibes_Regular_B64,
  "pinyon-script":  PinyonScript_Regular_B64,
};

const fontCache = new Map<string, Uint8Array>();

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadFont(fontKey: string): Promise<Uint8Array> {
  const cached = fontCache.get(fontKey);
  if (cached) return cached;
  const b64 = FONT_B64[fontKey] ?? FONT_B64["dancing-script"];
  if (!b64) throw new Error(`Font not found: ${fontKey}`);
  const bytes = base64ToBytes(b64);
  fontCache.set(fontKey, bytes);
  return bytes;
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
  const { width } = lastPage.getSize();

  const marginX = 50;
  const marginY = 40;
  const colWidth = (width - marginX * 2 - 20) / 2;
  const ruleY = marginY + 75;

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

  lastPage.drawLine({
    start: { x: marginX, y: ruleY },
    end:   { x: width - marginX, y: ruleY },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });

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

    if (!FONT_B64[signature_font]) {
      return new Response(JSON.stringify({ error: "Invalid font" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const adminName = role === "admin" ? signature_name : contract.admin_signature_name;
    const adminFont = role === "admin" ? signature_font : contract.admin_signature_font;
    const adminDate = role === "admin" ? now : (contract.admin_signed_at ? new Date(contract.admin_signed_at) : null);
    const clientName = role === "client" ? signature_name : null;
    const clientFont = role === "client" ? signature_font : null;
    const clientDate = role === "client" ? now : null;

    const signedPdfBytes = await overlaySignatureBlock(
      pdfBytes, adminName, adminFont, adminDate, clientName, clientFont, clientDate
    );

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

    const updatePayload: Record<string, unknown> = {
      current_storage_path: outputPath,
      updated_at: now.toISOString(),
    };

    if (role === "admin") {
      updatePayload.admin_signed_at = now.toISOString();
      updatePayload.admin_signature_name = signature_name;
      updatePayload.admin_signature_font = signature_font;
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
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("sign-contract error:", message, stack);
    return new Response(JSON.stringify({ error: message, stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
