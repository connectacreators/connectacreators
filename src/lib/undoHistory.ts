// A generic, framework-agnostic undo/redo history over immutable snapshots.
//
// Used by the script Doc editor (ScriptDocEditor) to give *document-level* undo
// for STRUCTURAL changes — adding/deleting/merging/reordering lines, type and
// heading edits — none of which TipTap's per-line history knows about. Granular
// in-line text undo stays with TipTap; this layer catches everything else.
//
// Caller contract: call record(currentState) IMMEDIATELY BEFORE applying a
// structural change, so the snapshot is the state to return to. On Cmd+Z call
// undo(currentState); on Cmd+Shift+Z call redo(currentState).
export class UndoHistory<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  constructor(private readonly limit = 50) {}

  // Snapshot the state we can return to, and invalidate any redo future.
  record(snapshot: T): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // Returns the previous snapshot (and stages `current` for redo), or null if
  // there is nothing to undo.
  undo(current: T): T | null {
    if (this.undoStack.length === 0) return null;
    const previous = this.undoStack.pop() as T;
    this.redoStack.push(current);
    return previous;
  }

  // Returns the next snapshot (and stages `current` for undo), or null if there
  // is nothing to redo.
  redo(current: T): T | null {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop() as T;
    this.undoStack.push(current);
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
