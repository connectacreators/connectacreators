// supabase/functions/_shared/assistant/prompt.test.ts
import { assertStringIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assemblePromptSections } from "./prompt.ts";

Deno.test("assemblePromptSections — agency mode includes mode line", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "agency", clientId: null },
    memories: [],
    surface: "drawer",
  });
  assertStringIncludes(out, "Robby");
  assertStringIncludes(out, "agency mode");
});

Deno.test("assemblePromptSections — client mode names the client", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "client", clientId: "c1" },
    activeClientName: "Maria",
    memories: [{ scope: "client", clientId: "c1", key: "tone", value: "direct" }],
    surface: "drawer",
  });
  assertStringIncludes(out, "Working on Maria");
  assertStringIncludes(out, "tone: direct");
});

Deno.test("assemblePromptSections — canvas surface notes connected nodes", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "client", clientId: "c1" },
    activeClientName: "Maria",
    memories: [],
    surface: "canvas",
    canvasContext: { connectedNodeCount: 2, connectedNodeTypes: ["video", "research"] },
  });
  assertStringIncludes(out, "canvas");
  assertStringIncludes(out, "2 connected node");
});

Deno.test("assemblePromptSections — pageContext line included when given", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "client", clientId: "c1" },
    activeClientName: "Maria",
    memories: [],
    surface: "drawer",
    pageContext: { path: "/clients/c1/scripts" },
  });
  assertStringIncludes(out, "/clients/c1/scripts");
});
