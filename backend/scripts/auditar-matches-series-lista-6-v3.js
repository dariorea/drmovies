import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

dotenv.config({
  path: path.join(ROOT, ".env"),
  quiet: true,
});

const INPUT = path.join(
  ROOT,
  "data/series-lista-6-clean-matches-reviewed.json"
);

const AUDIT_V2 = path.join(
  ROOT,
  "data/series-lista-6-match-audit-v2.json"
);

const OUTPUT_JSON = path.join(
  ROOT,
  "data/series-lista-6-match-audit-v3.json"
);

const OUTPUT_TXT = path.join(
  ROOT,
  "data/series-lista-6-match-audit-v3.txt"
);

const POSTER_CACHE = path.join(
  ROOT,
  "data/series-lista-6-tmdb-poster-cache.json"
);

const TMDB_API_KEY =
  process.env.TMDB_API_KEY ||
  process.env.VITE_TMDB_API_KEY ||
  "";

const TMDB_ACCESS_TOKEN =
  process.env.TMDB_ACCESS_TOKEN ||
  process.env.TMDB_BEARER_TOKEN ||
  "";

const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 20000;

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`No se encontró el archivo: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function candidateId(candidate) {
  return candidate?.tmdbId ?? candidate?.id ?? null;
}

function candidateName(candidate) {
  return (
    candidate?.name ??
    candidate?.originalName ??
    candidate?.title ??
    "Sin nombre"
  );
}

function candidateCountry(candidate) {
  const country = candidate?.originCountry;

  if (Array.isArray(country)) {
    return country.join(", ");
  }

  return country ?? "desconocido";
}

function getSeasonDetails(candidate) {
  return Array.isArray(candidate?.seasonDetails)
    ? candidate.seasonDetails
    : [];
}

function getStructureMetrics(candidate) {
  if (!candidate?.evidenceAvailable) {
    return {
      exact: 0,
      close: 0,
      incompatible: 0,
      missing: 0,
      coverage: 0,
      score: null,
    };
  }

  return {
    exact: candidate.exactSeasons?.length ?? 0,
    close: candidate.closeSeasons?.length ?? 0,
    incompatible: candidate.incompatibleSeasons?.length ?? 0,
    missing: candidate.missingSeasons?.length ?? 0,
    coverage: candidate.seasonCoverage ?? 0,
    score: candidate.structureScore ?? null,
  };
}

/* =========================================================
   LOGO DE LA LISTA M3U
   ========================================================= */

function extractLogo(item) {
  const values = [
    item?.logo,
    item?.tvgLogo,
    item?.tvg_logo,
    item?.posterUrl,
    item?.posterURL,
  ];

  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (value && typeof value === "object") {
      const url = value.url ?? value.src ?? value.logo;

      if (typeof url === "string" && url.trim()) {
        return url.trim();
      }
    }
  }

  return null;
}

function getImageFilename(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value, "https://image.tmdb.org");
    const filename = path.posix.basename(url.pathname);

    return filename && filename.includes(".")
      ? filename.toLowerCase()
      : null;
  } catch {
    const cleaned = value.split("?")[0].split("#")[0];
    const filename = path.posix.basename(cleaned);

    return filename && filename.includes(".")
      ? filename.toLowerCase()
      : null;
  }
}

function getPosterPath(candidate) {
  return (
    candidate?.posterPath ??
    candidate?.poster_path ??
    null
  );
}

/* =========================================================
   CACHÉ DE IMÁGENES TMDB
   ========================================================= */

function loadPosterCache() {
  if (!fs.existsSync(POSTER_CACHE)) {
    return {};
  }

  try {
    return readJson(POSTER_CACHE);
  } catch {
    console.warn(
      "⚠️ La caché de pósteres no se pudo leer; se creará otra."
    );

    return {};
  }
}

const posterCache = loadPosterCache();

let cacheDirty = false;
let requestCount = 0;
let cacheHits = 0;
let apiErrors = 0;

function savePosterCache() {
  if (!cacheDirty) return;

  writeJson(POSTER_CACHE, posterCache);
  cacheDirty = false;
}

function getTmdbHeaders() {
  const headers = {
    Accept: "application/json",
  };

  if (TMDB_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_ACCESS_TOKEN}`;
  }

  return headers;
}

async function fetchTmdbImages(id) {
  const url = new URL(
    `https://api.themoviedb.org/3/tv/${id}/images`
  );

  if (TMDB_API_KEY && !TMDB_ACCESS_TOKEN) {
    url.searchParams.set("api_key", TMDB_API_KEY);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: getTmdbHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      status: "OK",
      fetchedAt: new Date().toISOString(),
      posters: Array.isArray(data.posters)
        ? data.posters.map((poster) => ({
            filePath: poster.file_path,
            iso6391: poster.iso_639_1 ?? null,
            width: poster.width ?? null,
            height: poster.height ?? null,
            voteAverage: poster.vote_average ?? null,
          }))
        : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getTmdbImages(id) {
  const key = String(id);

  if (posterCache[key]) {
    cacheHits++;
    return posterCache[key];
  }

  if (!TMDB_API_KEY && !TMDB_ACCESS_TOKEN) {
    return {
      status: "NO_API_KEY",
      posters: [],
    };
  }

  requestCount++;

  try {
    const result = await fetchTmdbImages(key);

    posterCache[key] = result;
    cacheDirty = true;

    return result;
  } catch (error) {
    apiErrors++;

    const message =
      error.name === "AbortError"
        ? "Tiempo de espera agotado"
        : error.message;

    return {
      status: "API_ERROR",
      error: message,
      posters: [],
    };
  }
}

/* =========================================================
   COMPARACIÓN DE PÓSTERES
   ========================================================= */

function comparePoster(logo, candidate, tmdbImages) {
  const logoFilename = getImageFilename(logo);
  const mainPosterPath = getPosterPath(candidate);
  const mainFilename = getImageFilename(mainPosterPath);

  const base = {
    logo,
    logoFilename,
    tmdbId: candidateId(candidate),
    candidateName: candidateName(candidate),
    mainPosterPath,
    mainPosterFilename: mainFilename,
    status: "UNKNOWN",
    matchType: null,
    matchedFilePath: null,
    language: null,
    registeredPosters: tmdbImages?.posters?.length ?? 0,
    error: tmdbImages?.error ?? null,
  };

  if (!logoFilename) {
    return {
      ...base,
      status: "NO_LOGO",
    };
  }

  if (!candidateId(candidate)) {
    return {
      ...base,
      status: "NO_TMDB_ID",
    };
  }

  if (tmdbImages?.status === "NO_API_KEY") {
    return {
      ...base,
      status: "NO_API_KEY",
    };
  }

  if (tmdbImages?.status === "API_ERROR") {
    return {
      ...base,
      status: "API_ERROR",
    };
  }

  // La comparación por nombre de archivo evita diferencias
  // de tamaño, dominio o parámetros de la URL.
  if (mainFilename && logoFilename === mainFilename) {
    return {
      ...base,
      status: "MATCH",
      matchType: "PRINCIPAL",
      matchedFilePath: mainPosterPath,
    };
  }

  const alternatives = (tmdbImages?.posters ?? []).filter(
    (poster) => poster?.filePath
  );

  const alternative = alternatives.find(
    (poster) =>
      getImageFilename(poster.filePath) === logoFilename
  );

  if (alternative) {
    return {
      ...base,
      status: "MATCH",
      matchType: "ALTERNATIVO",
      matchedFilePath: alternative.filePath,
      language: alternative.iso6391,
    };
  }

  if (tmdbImages?.status === "OK") {
    return {
      ...base,
      status: "NOT_REGISTERED",
    };
  }

  return {
    ...base,
    status: "UNKNOWN",
  };
}

function collectCandidates(item) {
  const candidates = [
    item.bestCandidateAudit,
    item.bestStructuralAlternative,
    ...(Array.isArray(item.candidates) ? item.candidates : []),
  ].filter(Boolean);

  const unique = new Map();

  for (const candidate of candidates) {
    const id = candidateId(candidate);

    if (id !== null && id !== undefined) {
      unique.set(String(id), candidate);
    }
  }

  return [...unique.values()];
}

async function auditItemPosters(item) {
  const logo = extractLogo(item);

  const candidates = collectCandidates(item);

  const posterAudits = [];

  for (const candidate of candidates) {
    const id = candidateId(candidate);
    const images = id
      ? await getTmdbImages(id)
      : { status: "UNKNOWN", posters: [] };

    posterAudits.push(
      comparePoster(logo, candidate, images)
    );
  }

  const currentId = candidateId(item.bestCandidateAudit);
  const alternativeId = candidateId(item.bestStructuralAlternative);

  const currentPosterAudit =
    posterAudits.find(
      (audit) => String(audit.tmdbId) === String(currentId)
    ) ?? null;

  const alternativePosterAudit =
    posterAudits.find(
      (audit) =>
        String(audit.tmdbId) === String(alternativeId)
    ) ?? null;

  return {
    m3uLogo: logo,
    currentPosterAudit,
    alternativePosterAudit,
    candidatePosterAudits: posterAudits,
  };
}

/* =========================================================
   EVALUACIÓN ESTRUCTURAL EXISTENTE
   ========================================================= */

function assessCase(item) {
  const candidate = item.bestCandidateAudit;
  const metrics = getStructureMetrics(candidate);

  const totalSeasons = candidate?.m3uSeasonCount ?? 0;

  const incompatibleDetails = getSeasonDetails(candidate).filter(
    (season) => season.result === "INCOMPATIBLE"
  );

  const incompatibleEpisodes = incompatibleDetails.reduce(
    (sum, season) => sum + (season.difference ?? 0),
    0
  );

  const missing = metrics.missing;
  const incompatible = metrics.incompatible;

  const alternative = item.bestStructuralAlternative;
  const alternativeMetrics = getStructureMetrics(alternative);

  const alternativeAdvantage =
    metrics.score !== null && alternativeMetrics.score !== null
      ? alternativeMetrics.score - metrics.score
      : null;

  const alternativePlausible =
    alternative &&
    alternative.evidenceAvailable &&
    alternativeMetrics.score >= 80 &&
    alternativeAdvantage >= 15;

  const title = normalizeName(item.seriesName);
  const candidateTitle = normalizeName(candidate?.name);
  const shortTitle = title.length <= 3;

  let priority = "BAJA";
  const reasons = [];

  if (!candidate?.evidenceAvailable) {
    priority = "MEDIA";
    reasons.push(
      "No hay suficiente estructura para verificar el candidato"
    );
  } else {
    if (missing > 0) {
      priority = "ALTA";
      reasons.push(
        `${missing} temporada(s) M3U no encontradas en TMDB`
      );
    }

    if (incompatible > 0) {
      const severe = incompatibleDetails.some((season) => {
        const m3u = season.m3uEpisodes ?? 0;
        const tmdb = season.tmdbEpisodes ?? 0;
        const difference = season.difference ?? 0;

        return (
          difference >= 8 ||
          (Math.max(m3u, tmdb) > 0 &&
            difference / Math.max(m3u, tmdb) >= 0.35)
        );
      });

      if (severe) {
        priority = "ALTA";
        reasons.push(
          "Hay diferencias importantes en el número de episodios"
        );
      } else if (priority !== "ALTA") {
        priority = "MEDIA";
        reasons.push("Hay discrepancias aisladas de episodios");
      }
    }
  }

  if (alternativePlausible) {
    priority = "ALTA";
    reasons.push(
      `La alternativa ${candidateName(alternative)} tiene mejor estructura`
    );
  }

  if (shortTitle) {
    reasons.push(
      "Título M3U corto; el título por sí solo es poco discriminante"
    );
  }

  if (
    candidate &&
    title &&
    candidateTitle &&
    title !== candidateTitle
  ) {
    reasons.push(
      "El nombre normalizado difiere del título del candidato"
    );
  }

  if (metrics.exact === totalSeasons && totalSeasons > 0) {
    priority = "BAJA";

    if (alternativePlausible) {
      priority = "ALTA";
    }

    reasons.push("Todas las temporadas M3U coinciden exactamente");
  }

  if (
    metrics.incompatible === 0 &&
    metrics.missing === 0 &&
    metrics.close > 0 &&
    metrics.exact + metrics.close === totalSeasons
  ) {
    if (priority !== "ALTA") {
      priority = "BAJA";
    }

    reasons.push(
      "Estructura exacta o cercana en todas las temporadas disponibles"
    );
  }

  return {
    priority,
    reasons: [...new Set(reasons)],
    incompatibleEpisodes,
    alternativeAdvantage,
    alternativePlausible: Boolean(alternativePlausible),
    shortTitle,
    structureMetrics: metrics,
  };
}

function buildResult(item, originalItem) {
  const assessment = assessCase(item);
  const posterAudit = item.posterAudit;

  return {
    seriesName: item.seriesName,
    groupTitle: item.groupTitle,

    // Información original de la lista M3U.
    logo: posterAudit?.m3uLogo ?? extractLogo(originalItem),

    originalDecision: item.originalDecision,
    m3uYear: item.m3uYear,
    m3uTotal: item.m3uTotal,
    m3uStructure: item.m3uStructure,

    currentCandidate: item.originalBestMatch,
    currentCandidateAudit: item.bestCandidateAudit,

    bestStructuralAlternative: item.bestStructuralAlternative,
    alternativeIsBetter: item.alternativeIsBetter,

    priority: assessment.priority,
    reasons: assessment.reasons,
    incompatibleEpisodes: assessment.incompatibleEpisodes,
    alternativeAdvantage: assessment.alternativeAdvantage,
    alternativePlausible: assessment.alternativePlausible,
    shortTitle: assessment.shortTitle,
    structureMetrics: assessment.structureMetrics,

    // Auditoría de imágenes de TMDB.
    posterAudit,

    // Todos los candidatos, con su auditoría individual.
    candidates: item.candidates,
  };
}

/* =========================================================
   INFORME DE TEXTO
   ========================================================= */

function formatCandidate(candidate) {
  if (!candidate) {
    return "Sin candidato";
  }

  const metrics = getStructureMetrics(candidate);

  return [
    `${candidateName(candidate)} (TMDB ${candidateId(candidate) ?? "?"})`,
    `país=${candidateCountry(candidate)}`,
    `año=${candidate.firstAirDate?.slice(0, 4) ?? "?"}`,
    `score estructural=${metrics.score ?? "sin datos"}`,
    `exactas=${metrics.exact}`,
    `cercanas=${metrics.close}`,
    `incompatibles=${metrics.incompatible}`,
    `ausentes=${metrics.missing}`,
  ].join(" | ");
}

function formatPosterAudit(audit) {
  if (!audit) {
    return "Sin auditoría de póster";
  }

  const descriptions = {
    PRINCIPAL: "COINCIDE CON EL PÓSTER PRINCIPAL",
    ALTERNATIVO: "COINCIDE CON UN PÓSTER ALTERNATIVO",
    NOT_REGISTERED: "NO APARECE ENTRE LOS PÓSTERES REGISTRADOS",
    NO_LOGO: "LA M3U NO TIENE LOGO",
    NO_TMDB_ID: "CANDIDATO SIN ID DE TMDB",
    NO_API_KEY: "SIN CLAVE DE API",
    API_ERROR: `ERROR DE API: ${audit.error ?? "desconocido"}`,
    UNKNOWN: "RESULTADO DESCONOCIDO",
  };

  return [
    descriptions[audit.matchType] ??
      descriptions[audit.status] ??
      audit.status,
    `archivo M3U=${audit.logoFilename ?? "?"}`,
    `archivo principal=${audit.mainPosterFilename ?? "?"}`,
    `pósteres TMDB=${audit.registeredPosters ?? 0}`,
  ].join(" | ");
}

function makeTextReport(results, summary) {
  const lines = [
    "AUDITORÍA DE MATCHES — LISTA 6 — VERSIÓN 3",
    "=".repeat(76),
    "",
    `Total auditado: ${summary.total}`,
    `Prioridad alta: ${summary.high}`,
    `Prioridad media: ${summary.medium}`,
    `Prioridad baja: ${summary.low}`,
    `Alternativas estructurales plausibles: ${summary.plausibleAlternatives}`,
    "",
    "AUDITORÍA DE PÓSTERES",
    "=".repeat(76),
    `Coincide con el principal: ${summary.posterPrincipal}`,
    `Coincide con un alternativo: ${summary.posterAlternativo}`,
    `No registrado: ${summary.posterNoRegistrado}`,
    `Sin logo: ${summary.posterSinLogo}`,
    `Sin clave API: ${summary.posterSinApiKey}`,
    `Errores API: ${summary.posterErroresApi}`,
    "",
    "PRIORIDAD ALTA",
    "=".repeat(76),
    "",
  ];

  for (const item of results.filter((x) => x.priority === "ALTA")) {
    lines.push(
      `Serie M3U: ${item.seriesName ?? "Sin título"}`,
      `Decisión original: ${item.originalDecision ?? "?"}`,
      `Estructura M3U: ${JSON.stringify(item.m3uStructure)}`,
      `Candidato actual: ${formatCandidate(item.currentCandidateAudit)}`,
      `Póster del candidato: ${formatPosterAudit(item.posterAudit?.currentPosterAudit)}`,
      `Mejor alternativa: ${formatCandidate(item.bestStructuralAlternative)}`,
      `Póster de la alternativa: ${formatPosterAudit(item.posterAudit?.alternativePosterAudit)}`,
      `Motivos: ${item.reasons.join("; ") || "Sin motivos registrados"}`,
      "-".repeat(76),
      ""
    );
  }

  lines.push(
    "",
    "PRIORIDAD MEDIA",
    "=".repeat(76),
    ""
  );

  for (const item of results.filter((x) => x.priority === "MEDIA")) {
    lines.push(
      `Serie: ${item.seriesName ?? "Sin título"}`,
      `Candidato: ${formatCandidate(item.currentCandidateAudit)}`,
      `Póster: ${formatPosterAudit(item.posterAudit?.currentPosterAudit)}`,
      `Motivos: ${item.reasons.join("; ") || "Sin motivos registrados"}`,
      "-".repeat(76),
      ""
    );
  }

  lines.push(
    "",
    "PRIORIDAD BAJA",
    "=".repeat(76),
    "Los detalles completos de estos casos están disponibles en el JSON.",
    "",
    "NOTA: la prioridad indica qué conviene revisar; no confirma un ID incorrecto.",
    "La auditoría de pósteres no modifica IDs ni el catálogo.",
    ""
  );

  return lines.join("\n");
}

/* =========================================================
   RESUMEN DE PÓSTERES
   ========================================================= */

function summarizePosters(results) {
  const audits = results.flatMap(
    (item) => item.posterAudit?.candidatePosterAudits ?? []
  );

  return {
    posterPrincipal: audits.filter(
      (x) => x.matchType === "PRINCIPAL"
    ).length,

    posterAlternativo: audits.filter(
      (x) => x.matchType === "ALTERNATIVO"
    ).length,

    posterNoRegistrado: audits.filter(
      (x) => x.status === "NOT_REGISTERED"
    ).length,

    posterSinLogo: audits.filter(
      (x) => x.status === "NO_LOGO"
    ).length,

    posterSinApiKey: audits.filter(
      (x) => x.status === "NO_API_KEY"
    ).length,

    posterErroresApi: audits.filter(
      (x) => x.status === "API_ERROR"
    ).length,

    posterDesconocido: audits.filter(
      (x) => x.status === "UNKNOWN"
    ).length,
  };
}

/* =========================================================
   EJECUCIÓN
   ========================================================= */

async function main() {
  const original = readJson(INPUT);
  const auditV2 = readJson(AUDIT_V2);

  if (!Array.isArray(original) || !Array.isArray(auditV2.results)) {
    throw new Error("Formato inesperado en los archivos de entrada.");
  }

  const originalByName = new Map();

  for (const item of original) {
    const key = normalizeName(item.seriesName);

    if (key && !originalByName.has(key)) {
      originalByName.set(key, item);
    }
  }

  const pending = auditV2.results.map((item) => ({
    ...item,
    originalSource: originalByName.get(
      normalizeName(item.seriesName)
    ) ?? null,
  }));

  const uniqueIds = new Set();

  for (const item of pending) {
    for (const candidate of collectCandidates(item)) {
      const id = candidateId(candidate);

      if (id !== null && id !== undefined) {
        uniqueIds.add(String(id));
      }
    }
  }

  console.log("\n==========================================");
  console.log(" AUDITORÍA DE SERIES — LISTA 6 — V3");
  console.log("==========================================");
  console.log(`Series a auditar: ${pending.length}`);
  console.log(`IDs TMDB únicos entre los candidatos: ${uniqueIds.size}`);
  console.log(
    `Autenticación TMDB: ${
      TMDB_ACCESS_TOKEN || TMDB_API_KEY ? "configurada" : "NO CONFIGURADA"
    }`
  );

  if (!TMDB_ACCESS_TOKEN && !TMDB_API_KEY) {
    console.warn(
      "\n⚠️ Se generará el informe estructural, pero los pósteres quedarán sin verificar."
    );
  }

  // Precarga cada ID una sola vez. La caché evita repetir consultas
  // en ejecuciones posteriores.
  const ids = [...uniqueIds];
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < ids.length) {
      const index = nextIndex++;
      const id = ids[index];

      await getTmdbImages(id);

      completed++;

      if (completed % 25 === 0 || completed === ids.length) {
        console.log(
          `TMDB: ${completed}/${ids.length} IDs procesados`
        );

        // Persistir la caché durante la ejecución.
        savePosterCache();
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCY, ids.length) },
      () => worker()
    )
  );

  savePosterCache();

  const auditedItems = [];

  for (const item of pending) {
    const logo = extractLogo(item.originalSource);

    const posterAudits = collectCandidates(item).map((candidate) => {
      const id = candidateId(candidate);

      const images = id
        ? posterCache[String(id)] ?? {
            status: TMDB_API_KEY || TMDB_ACCESS_TOKEN
              ? "UNKNOWN"
              : "NO_API_KEY",
            posters: [],
          }
        : { status: "UNKNOWN", posters: [] };

      return comparePoster(logo, candidate, images);
    });

    const currentId = candidateId(item.bestCandidateAudit);
    const alternativeId = candidateId(item.bestStructuralAlternative);

    item.posterAudit = {
      m3uLogo: logo,
      currentPosterAudit:
        posterAudits.find(
          (x) => String(x.tmdbId) === String(currentId)
        ) ?? null,
      alternativePosterAudit:
        posterAudits.find(
          (x) => String(x.tmdbId) === String(alternativeId)
        ) ?? null,
      candidatePosterAudits: posterAudits,
    };

    auditedItems.push(buildResult(item, item.originalSource));
  }

  const results = auditedItems.sort((a, b) => {
    const order = { ALTA: 0, MEDIA: 1, BAJA: 2 };

    return (
      order[a.priority] - order[b.priority] ||
      (b.incompatibleEpisodes ?? 0) -
        (a.incompatibleEpisodes ?? 0) ||
      String(a.seriesName ?? "").localeCompare(
        String(b.seriesName ?? ""),
        "es"
      )
    );
  });

  const posterSummary = summarizePosters(results);

  const summary = {
    total: results.length,
    high: results.filter((x) => x.priority === "ALTA").length,
    medium: results.filter((x) => x.priority === "MEDIA").length,
    low: results.filter((x) => x.priority === "BAJA").length,
    plausibleAlternatives: results.filter(
      (x) => x.alternativePlausible
    ).length,

    uniqueTmdbIds: uniqueIds.size,
    apiRequestsThisRun: requestCount,
    cacheHits,
    apiErrors,

    ...posterSummary,

    modifiedCatalog: false,
    queriedTmdb: Boolean(TMDB_API_KEY || TMDB_ACCESS_TOKEN),
  };

  writeJson(OUTPUT_JSON, {
    generatedAt: new Date().toISOString(),
    summary,
    results,
  });

  fs.writeFileSync(
    OUTPUT_TXT,
    makeTextReport(results, summary),
    "utf8"
  );

  console.log("\n==========================================");
  console.log(" RESULTADO DE LA AUDITORÍA");
  console.log("==========================================");
  console.log(`Total auditado: ${summary.total}`);
  console.log(`Prioridad alta: ${summary.high}`);
  console.log(`Prioridad media: ${summary.medium}`);
  console.log(`Prioridad baja: ${summary.low}`);
  console.log(`Coincide con el póster principal: ${summary.posterPrincipal}`);
  console.log(`Coincide con un póster alternativo: ${summary.posterAlternativo}`);
  console.log(`No registrado: ${summary.posterNoRegistrado}`);
  console.log(`Sin logo: ${summary.posterSinLogo}`);
  console.log(`Sin clave API: ${summary.posterSinApiKey}`);
  console.log(`Errores API: ${summary.posterErroresApi}`);
  console.log(`Consultas realizadas: ${summary.apiRequestsThisRun}`);
  console.log(`Resultados recuperados de caché: ${summary.cacheHits}`);

  console.log("\nArchivos generados:");
  console.log(`  ${OUTPUT_JSON}`);
  console.log(`  ${OUTPUT_TXT}`);
  console.log(`  ${POSTER_CACHE}`);
  console.log("\nEl catálogo original no fue modificado.");
}

main().catch((error) => {
  console.error("\nError:", error.message);
  process.exitCode = 1;
});