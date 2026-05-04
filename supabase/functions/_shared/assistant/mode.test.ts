// supabase/functions/_shared/assistant/mode.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectModeFromPath, toolsForMode } from "./mode.ts";

Deno.test("detectModeFromPath — agency for /home, /dashboard, /clients (list)", () => {
  assertEquals(detectModeFromPath("/home"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/dashboard"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/clients"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/vault"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/leads"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/ai"), { mode: "agency", clientId: null });
});

Deno.test("detectModeFromPath — client for /clients/:id/* paths", () => {
  const m = detectModeFromPath("/clients/abc-123/scripts");
  assertEquals(m.mode, "client");
  assertEquals(m.clientId, "abc-123");
});

Deno.test("detectModeFromPath — handles trailing slash and query string", () => {
  assertEquals(detectModeFromPath("/clients/xyz/scripts/").mode, "client");
  assertEquals(detectModeFromPath("/clients/xyz?view=canvas").mode, "client");
  assertEquals(detectModeFromPath("/clients/xyz/scripts?view=canvas").clientId, "xyz");
});

Deno.test("toolsForMode — agency drawer surface excludes single-client tools", () => {
  const tools = toolsForMode({ mode: "agency", clientId: null }, "drawer");
  assertEquals(tools.includes("list_all_clients"), true);
  assertEquals(tools.includes("create_script"), false);
  assertEquals(tools.includes("submit_to_editing_queue"), false);
  assertEquals(tools.includes("generate_script_streaming"), false);
});

Deno.test("toolsForMode — client drawer surface includes script + queue tools", () => {
  const tools = toolsForMode({ mode: "client", clientId: "c1" }, "drawer");
  assertEquals(tools.includes("create_script"), true);
  assertEquals(tools.includes("submit_to_editing_queue"), true);
  assertEquals(tools.includes("get_client_strategy"), true);
  assertEquals(tools.includes("generate_script_streaming"), false); // canvas-only
});

Deno.test("toolsForMode — canvas surface is the only one with generate_script_streaming", () => {
  const drawerClient = toolsForMode({ mode: "client", clientId: "c1" }, "drawer");
  const canvasClient = toolsForMode({ mode: "client", clientId: "c1" }, "canvas");
  assertEquals(drawerClient.includes("generate_script_streaming"), false);
  assertEquals(canvasClient.includes("generate_script_streaming"), true);
});
