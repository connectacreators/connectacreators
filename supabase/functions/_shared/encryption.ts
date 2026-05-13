// AES-GCM token encryption. Key is provided via SCHEDULER_TOKEN_KEY env var
// as a base64-encoded 32-byte (256-bit) random key. Generate one with:
//   openssl rand -base64 32
//
// Storage format (base64-encoded):
//   <12 bytes IV>||<ciphertext>||<16 bytes auth tag>   -- all concatenated, then base64.
// Web Crypto's AES-GCM appends the auth tag to the ciphertext, so we just prepend the IV.

const KEY_ENV = "SCHEDULER_TOKEN_KEY";

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get(KEY_ENV);
  if (!raw) throw new Error(`${KEY_ENV} env var is required for token encryption`);
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error(`${KEY_ENV} must decode to 32 bytes`);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decryptToken(cipherB64: string): Promise<string> {
  const key = await getKey();
  const bundle = b64ToBytes(cipherB64);
  const iv = bundle.slice(0, 12);
  const ct = bundle.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
