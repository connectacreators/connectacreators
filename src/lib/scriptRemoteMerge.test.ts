import { describe, it, expect } from "vitest";
import { mergeRemoteBlocks } from "./scriptRemoteMerge";
import type { ScriptLine } from "@/hooks/useScripts";

const b = (id: string, text: string, over: Partial<ScriptLine> = {}): ScriptLine => ({
  id, uid: "uid-" + id, line_number: 1, line_type: "actor", section: "body", text, block_kind: "line", ...over,
});

describe("mergeRemoteBlocks", () => {
  it("takes the remote version of a block the local user has not edited", () => {
    const local = [b("a", "old")];
    const remote = [b("a", "new")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.text)).toEqual(["new"]);
  });

  it("keeps the local version of a block the user is editing (dirty)", () => {
    const local = [b("a", "my edit")];
    const remote = [b("a", "their edit")];
    const out = mergeRemoteBlocks(local, remote, new Set(["a"]));
    expect(out.map((x) => x.text)).toEqual(["my edit"]);
  });

  it("adds a remotely-added block, following remote order", () => {
    const local = [b("a", "a")];
    const remote = [b("a", "a"), b("c", "c")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("drops a clean local block that was deleted remotely", () => {
    const local = [b("a", "a"), b("b", "b")];
    const remote = [b("a", "a")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("preserves a locally-created block not yet known remotely (dirty)", () => {
    const local = [b("a", "a"), b("z", "new local")];
    const remote = [b("a", "a")];
    const out = mergeRemoteBlocks(local, remote, new Set(["z"]));
    expect(out.map((x) => x.id)).toEqual(["a", "z"]);
  });

  it("carries the local uid onto a taken-remote block so keys stay stable", () => {
    const local = [b("a", "old")];
    const remote = [{ ...b("a", "new"), uid: undefined } as ScriptLine];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out[0].uid).toBe("uid-a");
  });

  it("follows remote order even when local order differs", () => {
    const local = [b("b", "b"), b("a", "a")];
    const remote = [b("a", "a"), b("b", "b")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("keeps the local uid when preserving a dirty block", () => {
    const local = [b("a", "my edit")];
    const remote = [{ ...b("a", "their edit"), uid: "remote-uid" } as ScriptLine];
    const out = mergeRemoteBlocks(local, remote, new Set(["a"]));
    expect(out[0].uid).toBe("uid-a");
    expect(out[0].text).toBe("my edit");
  });

  it("preserves a local block that has no id", () => {
    const local = [b("a", "a"), { ...b("x", "no id"), id: undefined } as ScriptLine];
    const remote = [b("a", "a")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.some((bl) => bl.text === "no id")).toBe(true);
  });
});
