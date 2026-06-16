import { describe, it, expect } from "vitest";
import { proxyPathFor, buildProxyArgs } from "./proxy.js";

describe("proxyPathFor", () => {
  it("mirrors the source path and forces a .mp4 extension", () => {
    expect(proxyPathFor("c1/v1/IMG_6001.MOV")).toBe("c1/v1/IMG_6001.mp4");
    expect(proxyPathFor("c1/v1/submission/clip.webm")).toBe("c1/v1/submission/clip.mp4");
  });
  it("handles names with dots", () => {
    expect(proxyPathFor("c1/v1/my.clip.final.mov")).toBe("c1/v1/my.clip.final.mp4");
  });
});

describe("buildProxyArgs", () => {
  it("produces a 720p H.264 + AAC + faststart transcode that never upscales", () => {
    const args = buildProxyArgs("/in/input.mov", "/out/output.mp4");
    expect(args).toContain("-i");
    expect(args).toContain("/in/input.mov");
    expect(args.join(" ")).toContain("scale=-2:'min(720,ih)'");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args.join(" ")).toContain("+faststart");
    expect(args[args.length - 1]).toBe("/out/output.mp4");
  });

  it("uses the ultrafast preset so proxies finish quickly", () => {
    const args = buildProxyArgs("/in/input.mov", "/out/output.mp4");
    const presetIdx = args.indexOf("-preset");
    expect(presetIdx).toBeGreaterThanOrEqual(0);
    expect(args[presetIdx + 1]).toBe("ultrafast");
  });

  it("does NOT add http reconnect flags for a local file input", () => {
    const args = buildProxyArgs("/in/input.mov", "/out/output.mp4");
    expect(args).not.toContain("-reconnect");
  });

  it("streams an http(s) source with reconnect flags placed before -i", () => {
    const args = buildProxyArgs("https://example.com/footage/clip.mov?token=x", "/out/output.mp4");
    expect(args).toContain("-reconnect");
    // Input options must precede the -i they apply to.
    expect(args.indexOf("-reconnect")).toBeLessThan(args.indexOf("-i"));
    expect(args).toContain("https://example.com/footage/clip.mov?token=x");
  });
});
