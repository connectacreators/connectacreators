/**
 * Decide which `video_edits` columns to clear when a footage or submission folder
 * is emptied by deleting its last storage file.
 *
 * The footage slot and the submission slot must NEVER clear each other's columns:
 *  - the submission file lives in `file_submission`
 *  - the raw footage file lives in `storage_path` / `storage_url` / `upload_source`
 *
 * Regression context: the viewer's per-file delete used to null `storage_path` /
 * `storage_url` unconditionally. Deleting the last submission file therefore wiped
 * the footage metadata, making the footage badge disappear in the editing queue even
 * though the footage files were still in storage. Branching on `subfolder` fixes that.
 */
export function emptyFolderClearUpdate(subfolder?: string): Record<string, null> {
  if (subfolder === 'submission') {
    return { file_submission: null };
  }
  return { storage_path: null, storage_url: null, upload_source: null };
}
