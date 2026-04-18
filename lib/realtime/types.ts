export type VoiceSessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error";

export type VoiceEventType =
  | "session_connecting"
  | "session_connected"
  | "user_speech_started"
  | "user_speech_stopped"
  | "assistant_speaking_started"
  | "assistant_speaking_stopped"
  | "assistant_interrupted"
  | "tool_started"
  | "tool_progress"
  | "tool_completed"
  | "tool_failed"
  | "error";

export type ToolExecutionStatus = "inProgress" | "complete" | "error";

export interface VoiceTimelineEvent {
  id: string;
  type: VoiceEventType;
  createdAt: number;
  detail?: Record<string, unknown>;
}

export interface ToolExecutionRecord {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolExecutionStatus;
  progress?: string;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
