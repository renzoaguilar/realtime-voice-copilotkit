import { NextResponse } from "next/server";
import { z } from "zod";
import { executeServerTool } from "@/lib/server/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toolRequestSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  callId: z.string().optional(),
});

export const POST = async (request: Request) => {
  try {
    const payload = toolRequestSchema.parse(await request.json());
    const result = await executeServerTool(payload.name, payload.args);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server tool error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 400 },
    );
  }
};
