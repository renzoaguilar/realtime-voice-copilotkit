"use client";

import { useCopilotChatInternal } from "@copilotkit/react-core";
import type { Message } from "@copilotkit/shared";
import { useEffect, useMemo } from "react";
import { useVoiceBridgeStore } from "@/store/voice-bridge-store";

const REALTIME_TOOL_MESSAGE_PREFIX = "rt-tool-bridge";

const isRealtimeBridgeMessage = (message: Message): boolean =>
  message.id.startsWith(REALTIME_TOOL_MESSAGE_PREFIX);

const normalizeResultContent = (result: unknown): string =>
  JSON.stringify(result ?? {}, null, 2);

const buildToolMessages = (
  toolOrder: string[],
  toolsByCallId: ReturnType<typeof useVoiceBridgeStore.getState>["toolsByCallId"],
): Message[] => {
  const messages: Message[] = [];

  toolOrder.forEach((callId) => {
    const tool = toolsByCallId[callId];
    if (!tool) {
      return;
    }

    const assistantMessage: Message = {
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

    messages.push(assistantMessage);

    if (tool.status === "complete" || tool.status === "error") {
      const toolMessage: Message = {
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

      messages.push(toolMessage);
    }
  });

  return messages;
};

const toolSyncSignature = (messages: Message[]): string =>
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

  const nextRealtimeMessages = useMemo(
    () => buildToolMessages(toolOrder, toolsByCallId),
    [toolOrder, toolsByCallId],
  );

  const nextSignature = useMemo(
    () => toolSyncSignature(nextRealtimeMessages),
    [nextRealtimeMessages],
  );

  const currentSignature = useMemo(
    () =>
      toolSyncSignature(messages.filter((message) => isRealtimeBridgeMessage(message))),
    [messages],
  );

  useEffect(() => {
    if (nextSignature === currentSignature) {
      return;
    }

    const nonRealtimeMessages = messages.filter(
      (message) => !isRealtimeBridgeMessage(message),
    );

    setMessages([...nonRealtimeMessages, ...nextRealtimeMessages]);
  }, [currentSignature, messages, nextRealtimeMessages, nextSignature, setMessages]);

  return null;
};
