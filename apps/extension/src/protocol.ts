import type { HistoryLine, TaskPlan, VoiceState } from "../../web/src/voice/LiveVoiceSession";

export const PORT_NAME = "tekkie-voice";

/** Widget (iframe) → voice document. */
export type ToVoice = { type: "start" } | { type: "stop" } | { type: "text"; text: string } | { type: "mute"; muted: boolean };

/** Voice document → widgets. */
export type ToUi =
  | { type: "state"; state: VoiceState }
  | { type: "caption"; who: "user" | "tekkie"; text: string; final: boolean }
  | { type: "error"; message: string }
  | { type: "levels"; out: number; in: number }
  | { type: "emote"; kind: string }
  | { type: "plan"; plan: TaskPlan | null }
  | { type: "history"; lines: HistoryLine[] };
