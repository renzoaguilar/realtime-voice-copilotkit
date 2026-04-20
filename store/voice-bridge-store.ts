import { create } from "zustand";
import {
  RealtimeChatRecord,
  RealtimeChatRole,
  ToolExecutionRecord,
  VoiceEventType,
  VoiceSessionState,
  VoiceTimelineEvent,
} from "@/lib/realtime/types";

const MAX_TIMELINE_EVENTS = 200;

const makeEvent = (
  type: VoiceEventType,
  detail?: Record<string, unknown>,
): VoiceTimelineEvent => ({
  id: crypto.randomUUID(),
  type,
  detail,
  createdAt: Date.now(),
});

type ToolStartedPayload = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
};

type UpsertRealtimeChatPayload = {
  messageId: string;
  role: RealtimeChatRole;
  content: string;
  finalized?: boolean;
};

type AppendRealtimeChatDeltaPayload = {
  messageId: string;
  role: RealtimeChatRole;
  delta: string;
};

type VoiceBridgeState = {
  connectionState: VoiceSessionState;
  timeline: VoiceTimelineEvent[];
  toolsByCallId: Record<string, ToolExecutionRecord>;
  toolOrder: string[];
  realtimeMessagesById: Record<string, RealtimeChatRecord>;
  realtimeMessageOrder: string[];
  setConnectionState: (
    next: VoiceSessionState,
    eventType?: VoiceEventType,
    detail?: Record<string, unknown>,
  ) => void;
  pushEvent: (type: VoiceEventType, detail?: Record<string, unknown>) => void;
  toolStarted: (payload: ToolStartedPayload) => void;
  toolProgress: (callId: string, progress: string) => void;
  toolCompleted: (callId: string, result: unknown) => void;
  toolFailed: (callId: string, message: string) => void;
  upsertRealtimeMessage: (payload: UpsertRealtimeChatPayload) => void;
  appendRealtimeMessageDelta: (payload: AppendRealtimeChatDeltaPayload) => void;
  reset: () => void;
};

const trimTimeline = (timeline: VoiceTimelineEvent[]): VoiceTimelineEvent[] => {
  if (timeline.length <= MAX_TIMELINE_EVENTS) {
    return timeline;
  }

  // La linea de tiempo es solo diagnostico visual; recortarla no afecta la conversacion.
  return timeline.slice(timeline.length - MAX_TIMELINE_EVENTS);
};

export const useVoiceBridgeStore = create<VoiceBridgeState>((set) => ({
  connectionState: "idle",
  timeline: [],
  toolsByCallId: {},
  toolOrder: [],
  realtimeMessagesById: {},
  realtimeMessageOrder: [],

  // Estado compartido por controles de voz, timeline y bridge visual de CopilotKit.
  setConnectionState: (next, eventType, detail) =>
    set((state) => {
      const timeline = eventType
        ? trimTimeline([...state.timeline, makeEvent(eventType, detail)])
        : state.timeline;

      return {
        connectionState: next,
        timeline,
      };
    }),

  pushEvent: (type, detail) =>
    set((state) => ({
      timeline: trimTimeline([...state.timeline, makeEvent(type, detail)]),
    })),

  toolStarted: ({ callId, name, args }) =>
    set((state) => {
      const now = Date.now();
      const existing = state.toolsByCallId[callId];
      // callId es la identidad estable de una tool en Realtime.
      // Si vuelve a aparecer, actualizamos el registro en vez de duplicarlo.
      const nextRecord: ToolExecutionRecord = existing
        ? {
            ...existing,
            name,
            args,
            status: "inProgress",
            error: undefined,
            result: undefined,
            updatedAt: now,
          }
        : {
            callId,
            name,
            args,
            status: "inProgress",
            createdAt: now,
            updatedAt: now,
          };

      return {
        toolsByCallId: {
          ...state.toolsByCallId,
          [callId]: nextRecord,
        },
        toolOrder: state.toolOrder.includes(callId)
          ? state.toolOrder
          : [...state.toolOrder, callId],
        timeline: trimTimeline([
          ...state.timeline,
          makeEvent("tool_started", { callId, name, args }),
        ]),
      };
    }),

  toolProgress: (callId, progress) =>
    set((state) => {
      const existing = state.toolsByCallId[callId];
      if (!existing) {
        return {
          timeline: trimTimeline([
            ...state.timeline,
            makeEvent("tool_progress", { callId, progress }),
          ]),
        };
      }

      return {
        toolsByCallId: {
          ...state.toolsByCallId,
          [callId]: {
            ...existing,
            status: "inProgress",
            progress,
            updatedAt: Date.now(),
          },
        },
        timeline: trimTimeline([
          ...state.timeline,
          makeEvent("tool_progress", { callId, progress }),
        ]),
      };
    }),

  toolCompleted: (callId, result) =>
    set((state) => {
      const existing = state.toolsByCallId[callId];
      if (!existing) {
        return {
          timeline: trimTimeline([
            ...state.timeline,
            makeEvent("tool_completed", { callId, result }),
          ]),
        };
      }

      return {
        toolsByCallId: {
          ...state.toolsByCallId,
          [callId]: {
            ...existing,
            status: "complete",
            result,
            error: undefined,
            progress: undefined,
            updatedAt: Date.now(),
          },
        },
        timeline: trimTimeline([
          ...state.timeline,
          makeEvent("tool_completed", { callId, result }),
        ]),
      };
    }),

  toolFailed: (callId, message) =>
    set((state) => {
      const existing = state.toolsByCallId[callId];
      if (!existing) {
        return {
          timeline: trimTimeline([
            ...state.timeline,
            makeEvent("tool_failed", { callId, error: message }),
          ]),
        };
      }

      return {
        toolsByCallId: {
          ...state.toolsByCallId,
          [callId]: {
            ...existing,
            status: "error",
            error: message,
            progress: undefined,
            updatedAt: Date.now(),
          },
        },
        timeline: trimTimeline([
          ...state.timeline,
          makeEvent("tool_failed", { callId, error: message }),
        ]),
      };
    }),

  upsertRealtimeMessage: ({ messageId, role, content, finalized = false }) =>
    set((state) => {
      const existing = state.realtimeMessagesById[messageId];
      const now = Date.now();
      const nextRecord: RealtimeChatRecord = existing
        ? {
            ...existing,
            role,
            content,
            finalized,
            updatedAt: now,
          }
        : {
            messageId,
            role,
            content,
            finalized,
            createdAt: now,
            updatedAt: now,
          };

      return {
        realtimeMessagesById: {
          ...state.realtimeMessagesById,
          [messageId]: nextRecord,
        },
        realtimeMessageOrder: state.realtimeMessageOrder.includes(messageId)
          ? state.realtimeMessageOrder
          : [...state.realtimeMessageOrder, messageId],
      };
    }),

  appendRealtimeMessageDelta: ({ messageId, role, delta }) =>
    set((state) => {
      if (!delta) {
        return {};
      }

      const existing = state.realtimeMessagesById[messageId];
      const now = Date.now();
      const nextRecord: RealtimeChatRecord = existing
        ? {
            ...existing,
            role,
            content: `${existing.content}${delta}`,
            finalized: false,
            updatedAt: now,
          }
        : {
            messageId,
            role,
            content: delta,
            finalized: false,
            createdAt: now,
            updatedAt: now,
          };

      return {
        realtimeMessagesById: {
          ...state.realtimeMessagesById,
          [messageId]: nextRecord,
        },
        realtimeMessageOrder: state.realtimeMessageOrder.includes(messageId)
          ? state.realtimeMessageOrder
          : [...state.realtimeMessageOrder, messageId],
      };
    }),

  reset: () =>
    set({
      connectionState: "idle",
      timeline: [],
      toolsByCallId: {},
      toolOrder: [],
      realtimeMessagesById: {},
      realtimeMessageOrder: [],
    }),
}));
