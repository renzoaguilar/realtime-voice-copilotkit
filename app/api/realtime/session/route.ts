import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/server/openai";
import { getRealtimeToolDefinitions } from "@/lib/server/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async () => {
  try {
    const openai = getOpenAIClient();

    const secret = await openai.realtime.clientSecrets.create({
      expires_after: {
        anchor: "created_at",
        seconds: 60,
      },
      session: {
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
        instructions:
          "You are a concise real-time voice assistant. If a tool is useful, call it, then continue speaking with the tool result.",
        output_modalities: ["audio"],
        audio: {
          output: {
            voice: process.env.OPENAI_REALTIME_VOICE ?? "marin",
          },
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 450,
              create_response: true,
              interrupt_response: true,
            },
          },
        },
        tool_choice: "auto",
        tools: getRealtimeToolDefinitions(),
      },
    });

    return NextResponse.json({
      value: secret.value,
      expiresAt: secret.expires_at,
      session: secret.session,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create realtime session token";

    return NextResponse.json({ error: message }, { status: 500 });
  }
};
