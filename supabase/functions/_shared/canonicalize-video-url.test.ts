import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalizeVideoUrl } from "./canonicalize-video-url.ts";

Deno.test("instagram reel URL", () => {
  const r = canonicalizeVideoUrl("https://www.instagram.com/reel/C1AbCdEfGhi/?igsh=xyz");
  assertEquals(r?.platform, "instagram");
  assertEquals(r?.postId, "C1AbCdEfGhi");
  assertEquals(r?.normalizedUrl, "https://www.instagram.com/reel/C1AbCdEfGhi/");
});

Deno.test("instagram /p/ URL", () => {
  const r = canonicalizeVideoUrl("https://instagram.com/p/ABC123/");
  assertEquals(r?.platform, "instagram");
  assertEquals(r?.postId, "ABC123");
});

Deno.test("instagram /reels/ URL", () => {
  const r = canonicalizeVideoUrl("https://www.instagram.com/reels/XyZ789/");
  assertEquals(r?.platform, "instagram");
  assertEquals(r?.postId, "XyZ789");
});

Deno.test("tiktok /@user/video/ URL preserves the @username (yt-dlp 404s without it)", () => {
  const r = canonicalizeVideoUrl("https://www.tiktok.com/@user/video/7123456789012345678");
  assertEquals(r?.platform, "tiktok");
  assertEquals(r?.postId, "7123456789012345678");
  assertEquals(r?.normalizedUrl, "https://www.tiktok.com/@user/video/7123456789012345678");
});

Deno.test("tiktok URL keeps username while stripping tracking params", () => {
  const r = canonicalizeVideoUrl(
    "https://www.tiktok.com/@user.name/video/7123456789012345678?is_from_webapp=1&_t=abc&_r=1"
  );
  assertEquals(r?.postId, "7123456789012345678");
  assertEquals(r?.normalizedUrl, "https://www.tiktok.com/@user.name/video/7123456789012345678");
});

Deno.test("tiktok bare /video/ URL (no username) still resolves postId for dedup", () => {
  const r = canonicalizeVideoUrl("https://www.tiktok.com/video/7123456789012345678");
  assertEquals(r?.platform, "tiktok");
  assertEquals(r?.postId, "7123456789012345678");
});

Deno.test("tiktok vm.tiktok.com short URL — postId is shortcode, resolved later", () => {
  const r = canonicalizeVideoUrl("https://vm.tiktok.com/ZMabcDEF/");
  assertEquals(r?.platform, "tiktok");
  assertEquals(r?.postId, "ZMabcDEF");
});

Deno.test("youtube watch URL", () => {
  const r = canonicalizeVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share");
  assertEquals(r?.platform, "youtube");
  assertEquals(r?.postId, "dQw4w9WgXcQ");
});

Deno.test("youtube shorts URL", () => {
  const r = canonicalizeVideoUrl("https://youtube.com/shorts/abcDEFgh12_");
  assertEquals(r?.platform, "youtube");
  assertEquals(r?.postId, "abcDEFgh12_");
});

Deno.test("youtu.be short URL", () => {
  const r = canonicalizeVideoUrl("https://youtu.be/dQw4w9WgXcQ");
  assertEquals(r?.platform, "youtube");
  assertEquals(r?.postId, "dQw4w9WgXcQ");
});

Deno.test("facebook reel URL", () => {
  const r = canonicalizeVideoUrl("https://www.facebook.com/reel/1234567890");
  assertEquals(r?.platform, "facebook");
  assertEquals(r?.postId, "1234567890");
});

Deno.test("facebook watch URL", () => {
  const r = canonicalizeVideoUrl("https://facebook.com/watch?v=987654321");
  assertEquals(r?.platform, "facebook");
  assertEquals(r?.postId, "987654321");
});

Deno.test("unrecognized URL returns null", () => {
  assertEquals(canonicalizeVideoUrl("https://example.com/foo"), null);
  assertEquals(canonicalizeVideoUrl("not a url"), null);
  assertEquals(canonicalizeVideoUrl(""), null);
});

Deno.test("strips utm + igsh + si + fbclid tracking params", () => {
  const r = canonicalizeVideoUrl(
    "https://www.instagram.com/reel/ABC?utm_source=x&igsh=y&si=z&fbclid=w"
  );
  assertEquals(r?.normalizedUrl, "https://www.instagram.com/reel/ABC/");
});
