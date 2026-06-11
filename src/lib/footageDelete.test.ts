import { describe, it, expect } from 'vitest';
import { emptyFolderClearUpdate } from './footageDelete';

describe('emptyFolderClearUpdate', () => {
  // Regression: deleting the last SUBMISSION file used to null storage_path/storage_url,
  // which belong to the FOOTAGE — making the footage badge vanish while the files remained.
  it('clears only file_submission when the submission folder empties', () => {
    const update = emptyFolderClearUpdate('submission');
    expect(update).toEqual({ file_submission: null });
    expect(update).not.toHaveProperty('storage_path');
    expect(update).not.toHaveProperty('storage_url');
    expect(update).not.toHaveProperty('upload_source');
  });

  it('clears footage storage metadata when the footage folder empties', () => {
    expect(emptyFolderClearUpdate(undefined)).toEqual({
      storage_path: null,
      storage_url: null,
      upload_source: null,
    });
    expect(emptyFolderClearUpdate(undefined)).not.toHaveProperty('file_submission');
  });

  it('treats any non-submission subfolder value as footage', () => {
    expect(emptyFolderClearUpdate('')).toEqual({
      storage_path: null,
      storage_url: null,
      upload_source: null,
    });
  });
});
