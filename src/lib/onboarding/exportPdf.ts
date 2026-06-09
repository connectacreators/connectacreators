import { stripHtml, profilesToText } from "./richText";
import type { OnboardingData } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Build a clean printable sheet of all onboarding answers and open the browser
 * print dialog (Save as PDF). Matches the app's existing window.print() export
 * pattern — no PDF dependency.
 */
export function exportOnboardingPdf(data: OnboardingData, opts?: { name?: string }) {
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Basic Information",
      rows: [
        ["Name", data.clientName],
        ["Email", data.email],
      ],
    },
    {
      title: "Social Accounts",
      rows: [
        ["Instagram", data.instagram],
        ["Instagram password", data.instagramPassword],
        ["TikTok", data.tiktok],
        ["TikTok password", data.tiktokPassword],
        ["YouTube", data.youtube],
        ["YouTube password", data.youtubePassword],
        ["Facebook", data.facebook],
        ["Facebook password", data.facebookPassword],
      ],
    },
    {
      title: "Business Details",
      rows: [
        ["Package", data.package],
        ["Monthly ad budget", data.adBudget],
        ["Industry", data.industryOther || data.industry],
        ["State", data.state],
      ],
    },
    {
      title: "Brand & Messaging",
      rows: [
        ["Unique offer", stripHtml(data.uniqueOffer)],
        ["Can explain really well", stripHtml(data.uniqueValues)],
        ["Differentiator", stripHtml(data.competition)],
        ["Contrarian beliefs", stripHtml(data.contrarianBeliefs)],
        ["Story", stripHtml(data.story)],
      ],
    },
    {
      title: "Market & Goals",
      rows: [
        ["Target client", stripHtml(data.targetClient)],
        ["Profiles to emulate", profilesToText(data.top3Profiles, ", ")],
        ["Call / calendar link", data.callLink],
        ["Additional notes", stripHtml(data.additionalNotes)],
      ],
    },
  ];

  const sectionsHtml = groups
    .map((g) => {
      const rows = g.rows.filter(([, v]) => v && String(v).trim());
      if (!rows.length) return "";
      const items = rows
        .map(
          ([label, value]) => `
        <div class="row">
          <div class="label">${esc(label)}</div>
          <div class="value">${esc(String(value))}</div>
        </div>`,
        )
        .join("");
      return `<section><h2>${esc(g.title)}</h2>${items}</section>`;
    })
    .join("");

  const name = opts?.name || data.clientName || "Onboarding";
  const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(name)} — Onboarding</title>
    <style>
      body{margin:0;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:#fff;line-height:1.5;}
      h1{font-size:22px;font-weight:700;color:#0f172a;margin:0 0 2px;}
      .sub{font-size:12px;color:#94a3b8;margin:0 0 28px;}
      section{margin:0 0 24px;page-break-inside:avoid;}
      h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:0 0 12px;}
      .row{margin:0 0 12px;page-break-inside:avoid;}
      .label{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin:0 0 2px;}
      .value{font-size:14px;color:#1e293b;white-space:pre-wrap;}
      @media print{body{padding:24px;}@page{margin:16mm;}}
    </style></head><body>
    <h1>${esc(name)} — Onboarding</h1>
    <p class="sub">ConnectaCreators · ${esc(dateStr)}</p>
    ${sectionsHtml}
  </body></html>`;

  const w = window.open("", "_blank", "width=820,height=720");
  if (!w) {
    // Popup blocked — fall back to printing the current page is not useful;
    // inform via a thrown error the caller can toast.
    throw new Error("popup-blocked");
  }
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}
