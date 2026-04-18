"use client";

type ToolInvocationCardProps = {
  name: string;
  args: unknown;
  status: "inProgress" | "executing" | "complete";
  result?: unknown;
};

const safeObject = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "object" && value && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
};

const prettyJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const ToolInvocationCard = ({
  name,
  args,
  status,
  result,
}: ToolInvocationCardProps) => {
  const resultRecord = safeObject(result);
  const isErrorResult =
    status === "complete" &&
    Boolean(resultRecord && (resultRecord.error || resultRecord.ok === false));

  const normalizedStatus =
    status === "complete"
      ? isErrorResult
        ? "error"
        : "complete"
      : "inProgress";

  return (
    <div className={`tool-card status-${normalizedStatus}`}>
      <div className="tool-card-header">
        <strong>{name}</strong>
        <span>{normalizedStatus}</span>
      </div>
      <div className="tool-card-body">
        <p>args</p>
        <pre>{prettyJson(args)}</pre>
        {status === "complete" ? (
          <>
            <p>result</p>
            <pre>{prettyJson(result)}</pre>
          </>
        ) : null}
      </div>
    </div>
  );
};
