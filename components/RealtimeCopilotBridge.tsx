"use client";

import { useCopilotChatInternal } from "@copilotkit/react-core";
import type { Message } from "@copilotkit/shared";
import { useEffect, useMemo } from "react";
import { useVoiceBridgeStore } from "@/store/voice-bridge-store";
import type {
  RealtimeChatRecord,
  ToolExecutionRecord,
} from "@/lib/realtime/types";

const REALTIME_TOOL_MESSAGE_PREFIX = "rt-tool-bridge";
const REALTIME_CONVERSATION_MESSAGE_PREFIX = "rt-conversation-bridge";

// El bridge crea mensajes internos dentro de CopilotChat. El prefijo permite
// distinguirlos de mensajes normales del usuario/asistente y reemplazarlos sin tocar el resto.
const isRealtimeBridgeMessage = (message: Message): boolean => {
  const id = typeof message.id === "string" ? message.id : "";
  return (
    id.startsWith(REALTIME_TOOL_MESSAGE_PREFIX) ||
    id.startsWith(REALTIME_CONVERSATION_MESSAGE_PREFIX)
  );
};

type OrderedBridgeMessage = {
  createdAt: number;
  message: Message;
};

type ToolMap = Record<string, ToolExecutionRecord>;
type RealtimeMessageMap = Record<string, RealtimeChatRecord>;

const normalizeResultContent = (result: unknown): string =>
  JSON.stringify(result ?? {}, null, 2);

const buildToolMessages = (
  toolOrder: string[],
  toolsByCallId: ToolMap,
): OrderedBridgeMessage[] => {
  const messages: OrderedBridgeMessage[] = [];

  toolOrder.forEach((callId) => {
    const tool = toolsByCallId[callId];
    if (!tool) {
      return;
    }

    const assistantMessage: Message = {
      // CopilotKit renderiza actions cuando ve un mensaje assistant con toolCalls.
      // Por eso traducimos una tool de Realtime a este mensaje sintetico.
      id: `${REALTIME_TOOL_MESSAGE_PREFIX}-assistant-${callId}`,
      role: "assistant",
      name: "realtime_voice_tool",
      content: "",
      toolCalls: [
        {
          id: callId,
          type: "function",
          function: {
            name: tool.name,
            arguments: JSON.stringify(tool.args ?? {}),
          },
        },
      ],
    };

    messages.push({
      createdAt: tool.createdAt,
      message: assistantMessage,
    });

    if (tool.status === "complete" || tool.status === "error") {
      const toolMessage: Message = {
        // Este mensaje queda vinculado por toolCallId al assistantMessage anterior.
        // Asi la card puede mostrar resultado o error sin ejecutar la tool otra vez.
        id: `${REALTIME_TOOL_MESSAGE_PREFIX}-result-${callId}`,
        role: "tool",
        toolCallId: callId,
        content: normalizeResultContent(
          tool.status === "error"
            ? {
                ok: false,
                error: tool.error ?? "Unknown tool error",
              }
            : tool.result,
        ),
        ...(tool.status === "error"
          ? { error: tool.error ?? "Unknown tool error" }
          : {}),
      };

      messages.push({
        createdAt: tool.updatedAt,
        message: toolMessage,
      });
    }
  });

  return messages;
};

const buildConversationMessages = (
  realtimeMessageOrder: string[],
  realtimeMessagesById: RealtimeMessageMap,
): OrderedBridgeMessage[] => {
  const messages: OrderedBridgeMessage[] = [];

  realtimeMessageOrder.forEach((messageId) => {
    const entry = realtimeMessagesById[messageId];
    if (!entry) {
      return;
    }

    const content = entry.content.trim();
    if (!content) {
      return;
    }

    messages.push({
      createdAt: entry.createdAt,
      message: {
        id: `${REALTIME_CONVERSATION_MESSAGE_PREFIX}-${entry.messageId}`,
        role: entry.role,
        content,
      },
    });
  });

  return messages;
};

const buildBridgeMessages = (
  realtimeMessageOrder: string[],
  realtimeMessagesById: RealtimeMessageMap,
  toolOrder: string[],
  toolsByCallId: ToolMap,
): Message[] => {
  return [
    ...buildConversationMessages(realtimeMessageOrder, realtimeMessagesById),
    ...buildToolMessages(toolOrder, toolsByCallId),
  ]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((entry) => entry.message);
};

const bridgeSyncSignature = (messages: Message[]): string =>
  JSON.stringify(
    messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: "content" in message ? message.content : undefined,
      toolCalls:
        "toolCalls" in message
          ? message.toolCalls?.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.function.name,
              args: toolCall.function.arguments,
            }))
          : undefined,
      toolCallId: "toolCallId" in message ? message.toolCallId : undefined,
      error: "error" in message ? message.error : undefined,
    })),
  );

export const RealtimeCopilotBridge = () => {
  const { messages, setMessages } = useCopilotChatInternal();
  const toolsByCallId = useVoiceBridgeStore((state) => state.toolsByCallId);
  const toolOrder = useVoiceBridgeStore((state) => state.toolOrder);
  const realtimeMessagesById = useVoiceBridgeStore(
    (state) => state.realtimeMessagesById,
  );
  const realtimeMessageOrder = useVoiceBridgeStore(
    (state) => state.realtimeMessageOrder,
  );

  // El store es la fuente de verdad para tools + transcripciones Realtime.
  // CopilotChat solo recibe una representacion visual sincronizada.
  const nextRealtimeMessages = useMemo(
    () =>
      buildBridgeMessages(
        realtimeMessageOrder,
        realtimeMessagesById,
        toolOrder,
        toolsByCallId,
      ),
    [realtimeMessageOrder, realtimeMessagesById, toolOrder, toolsByCallId],
  );

  const nextSignature = useMemo(
    () => bridgeSyncSignature(nextRealtimeMessages),
    [nextRealtimeMessages],
  );

  const currentSignature = useMemo(
    () =>
      bridgeSyncSignature(
        messages.filter((message) => isRealtimeBridgeMessage(message)),
      ),
    [messages],
  );

  useEffect(() => {
    if (nextSignature === currentSignature) {
      return;
    }

    // Preservamos la conversacion normal y reemplazamos solo mensajes del bridge.
    // Esto evita que cada cambio de progreso duplique cards en el chat.
    const nonRealtimeMessages = messages.filter(
      (message) => !isRealtimeBridgeMessage(message),
    );

    setMessages([...nonRealtimeMessages, ...nextRealtimeMessages]);
  }, [currentSignature, messages, nextRealtimeMessages, nextSignature, setMessages]);

  return null;
};
