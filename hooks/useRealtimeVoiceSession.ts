"use client";

import { useCallback, useRef } from "react";
import { useVoiceBridgeStore } from "@/store/voice-bridge-store";
import type { VoiceSessionState } from "@/lib/realtime/types";

type RealtimeServerEvent = {
  type: string;
  [key: string]: unknown;
};

type FunctionCallDoneEvent = {
  type: "response.function_call_arguments.done";
  call_id: string;
  name: string;
  arguments: string;
};

type OutputItemFunctionCallDoneEvent = {
  type: "response.output_item.done";
  item?: {
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    [key: string]: unknown;
  };
};

type SessionBootstrapResponse = {
  value?: string;
  clientSecret?: string;
  expiresAt?: number;
};

const safeParseRecord = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignored on purpose
  }

  return {};
};

const isFunctionCallDoneEvent = (
  event: RealtimeServerEvent,
): event is FunctionCallDoneEvent =>
  event.type === "response.function_call_arguments.done" &&
  typeof event.call_id === "string" &&
  typeof event.name === "string" &&
  typeof event.arguments === "string";

const isOutputItemFunctionCallDoneEvent = (
  event: RealtimeServerEvent,
): event is OutputItemFunctionCallDoneEvent =>
  event.type === "response.output_item.done" &&
  typeof event.item === "object" &&
  event.item !== null;

export type UseRealtimeVoiceSessionResult = {
  isVoiceMode: boolean;
  connectionState: VoiceSessionState;
  startVoiceMode: () => Promise<void>;
  stopVoiceMode: () => void;
  interruptAssistant: (reason?: string) => void;
};

export const useRealtimeVoiceSession = (): UseRealtimeVoiceSessionResult => {
  const connectionState = useVoiceBridgeStore((state) => state.connectionState);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(false);
  const handledToolCallIdsRef = useRef<Set<string>>(new Set());

  const setConnectionState = useCallback((next: VoiceSessionState) => {
    useVoiceBridgeStore.getState().setConnectionState(next);
  }, []);

  const pushError = useCallback((message: string) => {
    const store = useVoiceBridgeStore.getState();
    store.setConnectionState("error", "error", { message });
  }, []);

  const sendClientEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    channel.send(JSON.stringify(event));
  }, []);

  const closeRealtimeResources = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    peerRef.current?.close();
    peerRef.current = null;

    handledToolCallIdsRef.current.clear();
    activeRef.current = false;
  }, []);

  const interruptAssistant = useCallback(
    (reason = "barge-in") => {
      if (!activeRef.current) {
        return;
      }

      sendClientEvent({ type: "response.cancel" });
      sendClientEvent({ type: "output_audio_buffer.clear" });
      useVoiceBridgeStore
        .getState()
        .setConnectionState("interrupted", "assistant_interrupted", {
          reason,
        });
    },
    [sendClientEvent],
  );

  const handleToolCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      const toolStore = useVoiceBridgeStore.getState();

      if (handledToolCallIdsRef.current.has(callId)) {
        return;
      }
      handledToolCallIdsRef.current.add(callId);

      const args = safeParseRecord(argsJson);
      toolStore.toolStarted({ callId, name, args });
      toolStore.toolProgress(callId, "Executing on server...");

      try {
        const response = await fetch("/api/tools", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            args,
            callId,
          }),
        });

        const payload = (await response.json()) as {
          ok: boolean;
          result?: Record<string, unknown>;
          error?: string;
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Tool execution failed");
        }

        toolStore.toolCompleted(callId, payload.result ?? {});

        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(payload.result ?? {}),
          },
        });

        sendClientEvent({ type: "response.create" });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown tool error";

        toolStore.toolFailed(callId, errorMessage);

        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ ok: false, error: errorMessage }),
          },
        });

        sendClientEvent({ type: "response.create" });
      }
    },
    [sendClientEvent],
  );

  const handleServerEvent = useCallback(
    (rawEvent: RealtimeServerEvent) => {
      if (isFunctionCallDoneEvent(rawEvent)) {
        void handleToolCall(rawEvent.call_id, rawEvent.name, rawEvent.arguments);
        return;
      }

      if (isOutputItemFunctionCallDoneEvent(rawEvent)) {
        const item = rawEvent.item;
        if (
          item?.type === "function_call" &&
          typeof item.call_id === "string" &&
          typeof item.name === "string"
        ) {
          const argumentsJson =
            typeof item.arguments === "string" ? item.arguments : "{}";
          void handleToolCall(item.call_id, item.name, argumentsJson);
        }
        return;
      }

      switch (rawEvent.type) {
        case "session.created":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("listening", "session_connected");
          break;
        case "input_audio_buffer.speech_started":
          if (useVoiceBridgeStore.getState().connectionState === "speaking") {
            interruptAssistant("barge-in");
          }
          useVoiceBridgeStore
            .getState()
            .setConnectionState("listening", "user_speech_started");
          break;
        case "input_audio_buffer.speech_stopped":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("thinking", "user_speech_stopped");
          break;
        case "response.created":
          useVoiceBridgeStore.getState().setConnectionState("thinking");
          break;
        case "output_audio_buffer.started":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("speaking", "assistant_speaking_started");
          break;
        case "output_audio_buffer.stopped":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("listening", "assistant_speaking_stopped");
          break;
        case "output_audio_buffer.cleared":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("interrupted", "assistant_interrupted", {
              reason: "output_audio_buffer.cleared",
            });
          break;
        case "error": {
          const maybeError =
            typeof rawEvent.error === "object" && rawEvent.error
              ? (rawEvent.error as { message?: string })
              : undefined;

          pushError(maybeError?.message ?? "Realtime session error");
          break;
        }
        default:
          break;
      }
    },
    [handleToolCall, interruptAssistant, pushError],
  );

  const stopVoiceMode = useCallback(() => {
    closeRealtimeResources();
    useVoiceBridgeStore.getState().setConnectionState("idle");
  }, [closeRealtimeResources]);

  const startVoiceMode = useCallback(async () => {
    if (activeRef.current) {
      return;
    }

    activeRef.current = true;
    useVoiceBridgeStore
      .getState()
      .setConnectionState("connecting", "session_connecting");

    try {
      const tokenResponse = await fetch("/api/realtime/session", {
        method: "POST",
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to bootstrap realtime session");
      }

      const tokenPayload =
        (await tokenResponse.json()) as SessionBootstrapResponse;
      const ephemeralToken = tokenPayload.clientSecret ?? tokenPayload.value;

      if (!ephemeralToken) {
        throw new Error("Realtime ephemeral token is missing");
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      const remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      peer.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          void remoteAudioRef.current.play().catch(() => {
            // ignored on purpose; autoplay can be blocked until user interaction
          });
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });

      const dataChannel = peer.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.addEventListener("open", () => {
        setConnectionState("listening");
      });

      dataChannel.addEventListener("error", () => {
        pushError("Realtime data channel error");
      });

      dataChannel.addEventListener("message", (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeServerEvent;
          handleServerEvent(parsed);
        } catch {
          pushError("Received malformed realtime event");
        }
      });

      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "disconnected"
        ) {
          pushError(`Peer connection ${peer.connectionState}`);
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error("Missing SDP offer payload");
      }

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`Realtime SDP negotiation failed: ${errorText}`);
      }

      const answerSdp = await sdpResponse.text();
      await peer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown voice startup error";
      pushError(message);
      closeRealtimeResources();
    }
  }, [closeRealtimeResources, handleServerEvent, pushError, setConnectionState]);

  return {
    isVoiceMode: connectionState !== "idle",
    connectionState,
    startVoiceMode,
    stopVoiceMode,
    interruptAssistant,
  };
};
