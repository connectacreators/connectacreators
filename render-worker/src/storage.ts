// render-worker/src/storage.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function downloadToFile(
  client: SupabaseClient,
  bucket: string,
  storagePath: string,
  destPath: string,
): Promise<void> {
  const { data, error } = await client.storage.from(bucket).download(storagePath);
  if (error) throw error;
  const arrayBuf = await data.arrayBuffer();
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, Buffer.from(arrayBuf));
}

export async function uploadFile(
  client: SupabaseClient,
  bucket: string,
  storagePath: string,
  localPath: string,
  contentType = "video/mp4",
): Promise<void> {
  const data = await fs.readFile(localPath);
  const { error } = await client.storage.from(bucket).upload(storagePath, data, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}
