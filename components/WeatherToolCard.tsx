"use client";

type WeatherStatus = "inProgress" | "executing" | "complete";

type WeatherToolCardProps = {
  status: WeatherStatus;
  args: Record<string, unknown>;
  result?: unknown;
};

type WeatherResult = {
  ok?: boolean;
  location?: string;
  unit?: string;
  temperature?: number;
  summary?: string;
  source?: string;
  retrievedAt?: string;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown, fallback = "-"): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const getNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const normalizeResult = (result: unknown): WeatherResult => {
  if (!isRecord(result)) {
    return {};
  }

  return {
    ok: typeof result.ok === "boolean" ? result.ok : undefined,
    location: typeof result.location === "string" ? result.location : undefined,
    unit: typeof result.unit === "string" ? result.unit : undefined,
    temperature: getNumber(result.temperature),
    summary: typeof result.summary === "string" ? result.summary : undefined,
    source: typeof result.source === "string" ? result.source : undefined,
    retrievedAt:
      typeof result.retrievedAt === "string" ? result.retrievedAt : undefined,
    error: typeof result.error === "string" ? result.error : undefined,
  };
};

const formatHour = (iso: string | undefined): string => {
  if (!iso) {
    return "-";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleTimeString();
};

const getUnitSymbol = (unit: string | undefined): string => {
  if (unit === "f") {
    return "F";
  }

  return "C";
};

export const WeatherToolCard = ({ status, args, result }: WeatherToolCardProps) => {
  const locationFromArgs = getString(args.location, "Ubicacion desconocida");

  if (status !== "complete") {
    return (
      <article className="weather-card weather-card-loading">
        <header>
          <p className="weather-card-eyebrow">lookup_weather</p>
          <h3>Consultando clima</h3>
        </header>
        <p className="weather-card-loading-text">
          Buscando condiciones para <strong>{locationFromArgs}</strong>...
        </p>
        <div className="weather-card-shimmer" aria-hidden="true" />
      </article>
    );
  }

  const normalized = normalizeResult(result);
  const location = getString(normalized.location, locationFromArgs);
  const unit = getUnitSymbol(normalized.unit);
  const temperature = normalized.temperature;
  const summary = getString(normalized.summary, "Sin resumen");
  const hasError = normalized.ok === false || Boolean(normalized.error);

  if (hasError) {
    return (
      <article className="weather-card weather-card-error">
        <header>
          <p className="weather-card-eyebrow">lookup_weather</p>
          <h3>Error al consultar clima</h3>
        </header>
        <p>{getString(normalized.error, "No se pudo obtener el clima.")}</p>
      </article>
    );
  }

  return (
    <article className="weather-card weather-card-ready">
      <header className="weather-card-header">
        <div>
          <p className="weather-card-eyebrow">lookup_weather</p>
          <h3>{location}</h3>
        </div>
        <span className="weather-card-tag">actual</span>
      </header>

      <div className="weather-card-main">
        <p className="weather-temp">
          {temperature ?? "--"}
          <span>°{unit}</span>
        </p>
        <p className="weather-summary">{summary}</p>
      </div>

      <dl className="weather-card-meta">
        <div>
          <dt>Fuente</dt>
          <dd>{getString(normalized.source, "simulada")}</dd>
        </div>
        <div>
          <dt>Hora</dt>
          <dd>{formatHour(normalized.retrievedAt)}</dd>
        </div>
      </dl>
    </article>
  );
};
