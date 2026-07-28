// Reads the companion-chat SSE stream and surfaces events to the caller
// via callbacks. Replaces the old `await res.json()` / `functions.invoke`
// pattern. The function only resolves once the stream closes — callers
// use the onScene/onDone callbacks to react to events as they arrive.
//
// Backend event types:
//   - { type: "text_delta", text } — a chunk of the reply as Claude writes it
//   - { type: "scene", scene, verb, meta, tool } — emitted before each tool
//   - { type: "speech_reset" } — discard any buffered/queued speech; the
//     text streamed so far was a dead-end that's being silently retried
//   - { type: "done", reply, actions, thread_id, build_session_id? } — final
//   - { type: "error", message, status? } — fatal
import type { SceneType, EmbedRef } from "./turn-script";

export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface SpeechResetEvent {
  type: "speech_reset";
}

export interface SceneEvent {
  type: "scene";
  scene: SceneType;
  verb: string;
  meta: string;
  tool: string;
}

export interface EmbedsEvent {
  type: "embeds";
  embeds: EmbedRef[];
}

// Re-export EmbedRef so callers can type their state without importing
// from two modules.
export type { EmbedRef };

export interface DoneEvent {
  type: "done";
  reply: string;
  actions: Array<Record<string, unknown>>;
  thread_id?: string;
  build_session_id?: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  status?: number;
}

export type CompanionChatEvent = TextDeltaEvent | SceneEvent | SpeechResetEvent | EmbedsEvent | DoneEvent | ErrorEvent;

export interface StreamCallbacks {
  onTextDelta?: (event: TextDeltaEvent) => void;
  onScene?: (event: SceneEvent) => void;
  onSpeechReset?: (event: SpeechResetEvent) => void;
  onEmbeds?: (event: EmbedsEvent) => void;
  onDone?: (event: DoneEvent) => void;
  onError?: (event: ErrorEvent) => void;
}

export interface StreamCompanionChatArgs {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  callbacks?: StreamCallbacks;
}

export interface StreamResult {
  done?: DoneEvent;
  error?: ErrorEvent;
}

/**
 * POST to /functions/v1/companion-chat with SSE consumption. Returns once
 * the stream closes. The result object holds whichever terminal event was
 * received (done or error). Scene events fire callbacks in real time.
 */
export async function streamCompanionChat({
  supabaseUrl,
  anonKey,
  accessToken,
  body,
  signal,
  callbacks,
}: StreamCompanionChatArgs): Promise<StreamResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/companion-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    const errEvent: ErrorEvent = {
      type: "error",
      message: text || `HTTP ${res.status}`,
      status: res.status,
    };
    callbacks?.onError?.(errEvent);
    return { error: errEvent };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const result: StreamResult = {};

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line (\n\n). Process every
      // complete frame currently in the buffer; keep the trailing
      // partial frame for the next iteration.
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf("\n\n");

        // Each frame is one or more lines, possibly prefixed with `data: `.
        // We ignore SSE comment lines (starting with `:`) and event-type
        // lines (`event: ...`). Only `data:` lines carry payload.
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;
        const json = dataLines.join("\n");

        let event: CompanionChatEvent | null = null;
        try {
          event = JSON.parse(json) as CompanionChatEvent;
        } catch {
          continue;
        }

        if (event.type === "text_delta") {
          callbacks?.onTextDelta?.(event);
        } else if (event.type === "scene") {
          callbacks?.onScene?.(event);
        } else if (event.type === "speech_reset") {
          callbacks?.onSpeechReset?.(event);
        } else if (event.type === "embeds") {
          callbacks?.onEmbeds?.(event);
        } else if (event.type === "done") {
          result.done = event;
          callbacks?.onDone?.(event);
        } else if (event.type === "error") {
          result.error = event;
          callbacks?.onError?.(event);
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return result;
    }
    const errEvent: ErrorEvent = { type: "error", message: String(err) };
    callbacks?.onError?.(errEvent);
    result.error = errEvent;
  }

  return result;
}
