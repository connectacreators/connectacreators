// Global upload store — lives outside React so uploads survive component unmounts

export type UploadEntry = {
  id: string;
  filename: string;
  progress: number;
  done: boolean;
  error?: string;
  abort?: () => void;
  route?: string;
};

const uploads = new Map<string, UploadEntry>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export const uploadStore = {
  add(id: string, filename: string, route?: string) {
    uploads.set(id, { id, filename, progress: 0, done: false, route });
    notify();
  },
  setAbort(id: string, abort: () => void) {
    const entry = uploads.get(id);
    if (entry) { uploads.set(id, { ...entry, abort }); }
  },
  update(id: string, progress: number) {
    const entry = uploads.get(id);
    if (entry) { uploads.set(id, { ...entry, progress }); notify(); }
  },
  cancel(id: string) {
    const entry = uploads.get(id);
    if (entry?.abort) entry.abort();
    uploads.delete(id);
    notify();
  },
  complete(id: string) {
    const entry = uploads.get(id);
    if (entry) {
      uploads.set(id, { ...entry, progress: 100, done: true });
      notify();
      setTimeout(() => { uploads.delete(id); notify(); }, 4000);
    }
  },
  fail(id: string, error: string) {
    const entry = uploads.get(id);
    if (entry) {
      uploads.set(id, { ...entry, error, done: true });
      notify();
      setTimeout(() => { uploads.delete(id); notify(); }, 6000);
    }
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getAll(): UploadEntry[] {
    return Array.from(uploads.values());
  },
};
