import { supabase } from "@/integrations/supabase/client";

// Removes every storage object belonging to a video edit before its row is
// permanently deleted: original footage and `submission/` uploads in the
// `footage` bucket, the mirrored 720p web proxies in `footage-proxies`, the
// editor's `broll/` and `music/` assets (keyed by video-edit id), and the
// `footage_proxies` tracking rows. Storage objects have no FK to video_edits,
// so deleting the DB rows alone leaks all of it forever.
export async function wipeVideoEditStorage(clientId: string | null | undefined, videoEditId: string | null | undefined) {
  // Guard: never build a broad/root prefix from missing ids.
  if (!clientId || !videoEditId) return;
  const prefixes = [
    `${clientId}/${videoEditId}/`,
    `${clientId}/${videoEditId}/submission/`,
    `broll/${videoEditId}/`,
    `music/${videoEditId}/`,
  ];
  for (const bucket of ["footage", "footage-proxies"]) {
    const paths: string[] = [];
    for (const prefix of prefixes) {
      const { data: objects } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: 1000 });
      for (const obj of objects ?? []) {
        // `.list()` returns immediate children; skip the nested folder placeholder.
        if (obj.name && !obj.name.endsWith("/")) paths.push(`${prefix}${obj.name}`);
      }
    }
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      // Non-fatal: log and let the caller still delete the rows.
      if (error) console.error(`${bucket} storage cleanup failed:`, error);
    }
  }
  // Drop the proxy tracking rows too, or they'd keep pointing at deleted files.
  // `footage_proxies` is not in the generated DB types yet — cast to query it.
  for (const like of [`${clientId}/${videoEditId}/%`, `broll/${videoEditId}/%`, `music/${videoEditId}/%`]) {
    await (supabase as any).from("footage_proxies").delete().like("source_path", like);
  }
}
