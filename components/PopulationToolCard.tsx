"use client";

type PopulationStatus = "inProgress" | "executing" | "complete";

type PopulationToolCardProps = {
  status: PopulationStatus;
  args: Record<string, unknown>;
  result?: unknown;
};

type PopulationResult = {
  ok?: boolean;
  location?: string;
  country?: string;
  population?: number;
  formattedPopulation?: string;
  scope?: string;
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

const normalizeResult = (result: unknown): PopulationResult => {
  if (!isRecord(result)) {
    return {};
  }

  return {
    ok: typeof result.ok === "boolean" ? result.ok : undefined,
    location: typeof result.location === "string" ? result.location : undefined,
    country: typeof result.country === "string" ? result.country : undefined,
    population: getNumber(result.population),
    formattedPopulation:
      typeof result.formattedPopulation === "string"
        ? result.formattedPopulation
        : undefined,
    scope: typeof result.scope === "string" ? result.scope : undefined,
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

const formatPopulation = (
  rawValue: number | undefined,
  prettyValue: string | undefined,
): string => {
  if (prettyValue) {
    return prettyValue;
  }

  if (rawValue === undefined) {
    return "--";
  }

  return new Intl.NumberFormat("en-US").format(rawValue);
};

export const PopulationToolCard = ({
  status,
  args,
  result,
}: PopulationToolCardProps) => {
  const cityFromArgs = getString(args.location, "Ciudad desconocida");

  if (status !== "complete") {
    return (
      <article className="population-card population-card-loading">
        <header>
          <p className="population-card-eyebrow">lookup_population</p>
          <h3>Consultando poblacion</h3>
        </header>
        <p className="population-card-loading-text">
          Buscando estimacion para <strong>{cityFromArgs}</strong>...
        </p>
        <div className="population-card-shimmer" aria-hidden="true" />
      </article>
    );
  }

  const normalized = normalizeResult(result);
  const hasError = normalized.ok === false || Boolean(normalized.error);

  if (hasError) {
    return (
      <article className="population-card population-card-error">
        <header>
          <p className="population-card-eyebrow">lookup_population</p>
          <h3>Error al consultar poblacion</h3>
        </header>
        <p>{getString(normalized.error, "No se pudo obtener la poblacion.")}</p>
      </article>
    );
  }

  const city = getString(normalized.location, cityFromArgs);
  const country = getString(normalized.country, "Pais no especificado");
  const totalPopulation = formatPopulation(
    normalized.population,
    normalized.formattedPopulation,
  );

  return (
    <article className="population-card population-card-ready">
      <header className="population-card-header">
        <div>
          <p className="population-card-eyebrow">lookup_population</p>
          <h3>{city}</h3>
          <p className="population-country">{country}</p>
        </div>
        <span className="population-card-tag">estimado</span>
      </header>

      <div className="population-card-main">
        <p className="population-total">{totalPopulation}</p>
        <p className="population-unit">habitantes</p>
      </div>

      <dl className="population-card-meta">
        <div>
          <dt>Alcance</dt>
          <dd>{getString(normalized.scope, "n/a")}</dd>
        </div>
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
