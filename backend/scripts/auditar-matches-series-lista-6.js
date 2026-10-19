import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const INPUT = path.join(
  ROOT,
  "data/series-lista-6-clean-matches-reviewed.json"
);

const OUTPUT_JSON = path.join(
  ROOT,
  "data/series-lista-6-match-audit-v2.json"
);

const OUTPUT_TXT = path.join(
  ROOT,
  "data/series-lista-6-match-audit-v2.txt"
);

// Una diferencia pequeña de episodios puede deberse
// a capítulos especiales, listados incompletos o diferencias de catálogo.
const MIN_EPISODE_TOLERANCE = 2;
const EPISODE_TOLERANCE_RATIO = 0.10;
const ALTERNATIVE_ADVANTAGE = 15;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

/**
 * Convierte una temporada en su cantidad de episodios.
 * Admite formatos como:
 *   "1": 12
 *   "1": [ ... ]
 *   "1": { episodeCount: 12 }
 *   "1": { episodes: { "1": {}, "2": {} } }
 */
function countEpisodes(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  if (!isObject(value)) {
    return null;
  }

  for (const field of [
    "episodeCount",
    "episodesCount",
    "numberOfEpisodes",
    "totalEpisodes",
  ]) {
    const n = Number(value[field]);

    if (
      value[field] !== undefined &&
      value[field] !== null &&
      Number.isFinite(n)
    ) {
      return n;
    }
  }

  if (Array.isArray(value.episodes)) {
    return value.episodes.length;
  }

  if (isObject(value.episodes)) {
    return Object.keys(value.episodes).length;
  }

  return null;
}

/**
 * Normaliza estructuras del tipo:
 * { "1": 12, "2": 10 }
 *
 * También admite temporadas representadas como objetos.
 */
function normalizeStructure(structure) {
  if (!isObject(structure) || Array.isArray(structure)) {
    return null;
  }

  const result = {};

  for (const [seasonKey, seasonValue] of Object.entries(structure)) {
    // Ignorar propiedades que no representen temporadas.
    if (!/^\d+$/.test(String(seasonKey))) {
      continue;
    }

    const seasonNumber = Number(seasonKey);
    const episodes = countEpisodes(seasonValue);

    if (
      Number.isInteger(seasonNumber) &&
      seasonNumber >= 0 &&
      episodes !== null &&
      episodes >= 0
    ) {
      result[String(seasonNumber)] = episodes;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function getCandidateId(candidate) {
  return candidate?.tmdbId ?? candidate?.id ?? null;
}

function getCandidateName(candidate) {
  return (
    candidate?.name ??
    candidate?.originalName ??
    candidate?.title ??
    "Sin nombre"
  );
}

function getCandidateStructure(candidate) {
  return normalizeStructure(
    candidate?.tmdbStructure ??
    candidate?.seasonStructure ??
    candidate?.structure ??
    null
  );
}

function getTolerance(m3uEpisodes) {
  return Math.max(
    MIN_EPISODE_TOLERANCE,
    Math.ceil(m3uEpisodes * EPISODE_TOLERANCE_RATIO)
  );
}

/**
 * Compara exclusivamente las temporadas presentes en M3U.
 *
 * Las temporadas adicionales de TMDB se informan, pero no
 * se consideran una contradicción.
 */
function compareStructures(m3uStructureRaw, tmdbStructureRaw) {
  const m3uStructure = normalizeStructure(m3uStructureRaw);
  const tmdbStructure = normalizeStructure(tmdbStructureRaw);

  if (!m3uStructure || !tmdbStructure) {
    return {
      status: "EVIDENCIA_INSUFICIENTE",
      evidenceAvailable: false,
      seasonCoverage: null,
      exactRatio: null,
      compatibleRatio: null,
      structureScore: null,
      m3uSeasonCount: m3uStructure
        ? Object.keys(m3uStructure).length
        : 0,
      tmdbSeasonCount: tmdbStructure
        ? Object.keys(tmdbStructure).length
        : 0,
      exactSeasons: [],
      closeSeasons: [],
      incompatibleSeasons: [],
      missingSeasons: [],
      extraTmdbSeasons: [],
      seasonDetails: [],
    };
  }

  const m3uSeasons = Object.keys(m3uStructure);
  const tmdbSeasons = Object.keys(tmdbStructure);

  const exactSeasons = [];
  const closeSeasons = [];
  const incompatibleSeasons = [];
  const missingSeasons = [];
  const seasonDetails = [];

  for (const season of m3uSeasons) {
    const m3uEpisodes = m3uStructure[season];

    if (!Object.hasOwn(tmdbStructure, season)) {
      missingSeasons.push(Number(season));

      seasonDetails.push({
        season: Number(season),
        m3uEpisodes,
        tmdbEpisodes: null,
        difference: null,
        tolerance: getTolerance(m3uEpisodes),
        result: "TEMPORADA_NO_ENCONTRADA",
      });

      continue;
    }

    const tmdbEpisodes = tmdbStructure[season];
    const difference = Math.abs(m3uEpisodes - tmdbEpisodes);
    const tolerance = getTolerance(m3uEpisodes);

    let result;

    if (difference === 0) {
      result = "EXACTA";
      exactSeasons.push(Number(season));
    } else if (difference <= tolerance) {
      result = "CERCANA";
      closeSeasons.push(Number(season));
    } else {
      result = "INCOMPATIBLE";
      incompatibleSeasons.push(Number(season));
    }

    seasonDetails.push({
      season: Number(season),
      m3uEpisodes,
      tmdbEpisodes,
      difference,
      tolerance,
      result,
    });
  }

  const m3uSeasonCount = m3uSeasons.length;
  const presentCount =
    m3uSeasonCount - missingSeasons.length;

  const compatibleCount =
    exactSeasons.length + closeSeasons.length;

  const seasonCoverage =
    m3uSeasonCount > 0
      ? presentCount / m3uSeasonCount
      : 0;

  const exactRatio =
    m3uSeasonCount > 0
      ? exactSeasons.length / m3uSeasonCount
      : 0;

  const compatibleRatio =
    m3uSeasonCount > 0
      ? compatibleCount / m3uSeasonCount
      : 0;

  // No se penalizan temporadas extra de TMDB ni diferencias
  // entre los totales globales de ambas fuentes.
  const structureScore = Math.round(
    seasonCoverage * 35 +
    compatibleRatio * 45 +
    exactRatio * 20
  );

  let status;

  if (
    exactSeasons.length === m3uSeasonCount &&
    missingSeasons.length === 0
  ) {
    status = "EXACTA_EN_TEMPORADAS_DISPONIBLES";
  } else if (
    incompatibleSeasons.length === 0 &&
    missingSeasons.length === 0
  ) {
    status = "ESTRUCTURA_MUY_CERCANA";
  } else {
    status = "REVISAR_ESTRUCTURA";
  }

  const extraTmdbSeasons = tmdbSeasons
    .filter((season) => !Object.hasOwn(m3uStructure, season))
    .map(Number)
    .sort((a, b) => a - b);

  return {
    status,
    evidenceAvailable: true,
    seasonCoverage: Number(seasonCoverage.toFixed(4)),
    exactRatio: Number(exactRatio.toFixed(4)),
    compatibleRatio: Number(compatibleRatio.toFixed(4)),
    structureScore,
    m3uSeasonCount,
    tmdbSeasonCount: tmdbSeasons.length,
    exactSeasons,
    closeSeasons,
    incompatibleSeasons,
    missingSeasons,
    extraTmdbSeasons,
    seasonDetails,
  };
}

function uniqueCandidates(candidates) {
  const result = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const id = getCandidateId(candidate);
    const key = id !== null ? String(id) : getCandidateName(candidate);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

function summarizeCandidate(candidate, m3uStructure) {
  const structure = getCandidateStructure(candidate);
  const comparison = compareStructures(m3uStructure, structure);

  return {
    tmdbId: getCandidateId(candidate),
    name: getCandidateName(candidate),
    originalName: candidate?.originalName ?? null,
    firstAirDate: candidate?.firstAirDate ?? null,
    originCountry: candidate?.originCountry ?? null,
    originalScore: candidate?.score ?? null,
    titleMatch: candidate?.titleMatch ?? null,
    titleMatches: candidate?.titleMatches ?? null,
    shortTitle: getCandidateName(candidate).trim().length <= 3,
    tmdbTotal: candidate?.tmdbTotal ?? null,
    ...comparison,
  };
}

function getCandidateList(record) {
  const candidates = Array.isArray(record.candidates)
    ? record.candidates
    : [];

  return uniqueCandidates([
    record.bestMatch,
    record.secondMatch,
    ...candidates,
  ]);
}

function auditRecord(record) {
  const m3uStructure = normalizeStructure(record.m3uStructure);

  const candidates = getCandidateList(record).map((candidate) =>
    summarizeCandidate(candidate, m3uStructure)
  );

  const bestId = getCandidateId(record.bestMatch);

  const bestAudit =
    candidates.find(
      (candidate) =>
        bestId !== null &&
        String(candidate.tmdbId) === String(bestId)
    ) ?? null;

  const alternatives = candidates
    .filter(
      (candidate) =>
        candidate.tmdbId !== null &&
        (bestId === null ||
          String(candidate.tmdbId) !== String(bestId))
    )
    .sort((a, b) => {
      const aScore = a.structureScore ?? -1;
      const bScore = b.structureScore ?? -1;
      return bScore - aScore;
    });

  const bestAlternative = alternatives.find(
    (candidate) => candidate.evidenceAvailable
  ) ?? null;

  const alternativeIsBetter = Boolean(
    bestAudit?.evidenceAvailable &&
    bestAlternative?.evidenceAvailable &&
    bestAlternative.structureScore >= 85 &&
    bestAudit.structureScore !== null &&
    bestAlternative.structureScore - bestAudit.structureScore >=
      ALTERNATIVE_ADVANTAGE
  );

  const issues = [];

  if (!bestAudit) {
    issues.push("NO_SE_PUDO_EVALUAR_EL_CANDIDATO_PRINCIPAL");
  } else if (!bestAudit.evidenceAvailable) {
    issues.push("ESTRUCTURA_DEL_CANDIDATO_PRINCIPAL_INSUFICIENTE");
  } else {
    if (bestAudit.missingSeasons.length > 0) {
      issues.push("TEMPORADAS_M3U_NO_ENCONTRADAS_EN_TMDB");
    }

    if (bestAudit.incompatibleSeasons.length > 0) {
      issues.push("CANTIDADES_DE_EPISODIOS_INCOMPATIBLES");
    }
  }

  if (alternativeIsBetter) {
    issues.push("ALTERNATIVA_CON_ESTRUCTURA_MUY_SUPERIOR");
  }

  return {
    seriesName: record.seriesName ?? null,
    groupTitle: record.groupTitle ?? null,
    logo: record.logo ?? null,
    m3uYear: record.m3uYear ?? null,
    m3uTotal: record.m3uTotal ?? null,
    m3uStructure,
    originalDecision: record.decision ?? null,
    originalBestMatch: record.bestMatch
      ? {
          tmdbId: getCandidateId(record.bestMatch),
          name: getCandidateName(record.bestMatch),
          score: record.bestMatch.score ?? null,
        }
      : null,
    bestCandidateAudit: bestAudit,
    bestStructuralAlternative: bestAlternative,
    alternativeIsBetter,
    issues,
    candidates,
  };
}

function formatSeasonList(seasons) {
  return seasons?.length ? seasons.join(", ") : "ninguna";
}

function formatCandidate(candidate) {
  if (!candidate) {
    return "Sin candidato evaluable";
  }

  if (!candidate.evidenceAvailable) {
    return `${candidate.name} (TMDB ${candidate.tmdbId ?? "?"}): evidencia estructural insuficiente`;
  }

  return [
    `${candidate.name} (TMDB ${candidate.tmdbId ?? "?"})`,
    `estado=${candidate.status}`,
    `puntuación estructural=${candidate.structureScore}/100`,
    `exactas=[${formatSeasonList(candidate.exactSeasons)}]`,
    `cercanas=[${formatSeasonList(candidate.closeSeasons)}]`,
    `incompatibles=[${formatSeasonList(candidate.incompatibleSeasons)}]`,
    `no encontradas=[${formatSeasonList(candidate.missingSeasons)}]`,
    `temporadas extra en TMDB=${candidate.extraTmdbSeasons.length}`,
  ].join(" | ");
}

function buildTextReport(audit, summary) {
  const lines = [
    "AUDITORÍA DE MATCHES DE SERIES — LISTA 6 — VERSIÓN 2",
    "=".repeat(64),
    "",
    "Este informe no modifica el catálogo ni consulta TMDB.",
    "Las temporadas extra en TMDB no se consideran contradicción.",
    "La comparación usa las temporadas presentes en la lista M3U.",
    "",
    `Matches auditados: ${summary.totalMatchesAuditados}`,
    "",
    "Estados estructurales del candidato principal:",
  ];

  for (const [status, count] of Object.entries(summary.estadosAuditoria)) {
    lines.push(`  ${status}: ${count}`);
  }

  lines.push(
    "",
    `Casos con alternativa estructural claramente superior: ${summary.alternativaIsMejor}`,
    `Casos sin estructura suficiente para evaluar: ${summary.evidenciaInsuficiente}`,
    "",
    "=".repeat(64),
    "CASOS QUE REQUIEREN ATENCIÓN",
    "=".repeat(64),
    ""
  );

  const flagged = audit.filter(
    (item) =>
      item.issues.length > 0 ||
      item.originalDecision === "MATCH_PROBABLE"
  );

  for (const item of flagged) {
    lines.push(
      `Serie M3U: ${item.seriesName ?? "Sin título"}`,
      `Decisión original: ${item.originalDecision ?? "Sin decisión"}`,
      `Estructura M3U: ${JSON.stringify(item.m3uStructure)}`,
      `Total M3U: ${item.m3uTotal ?? "desconocido"}`,
      `Candidato original: ${item.originalBestMatch?.name ?? "ninguno"} (TMDB ${item.originalBestMatch?.tmdbId ?? "?"})`,
      `Auditoría principal: ${formatCandidate(item.bestCandidateAudit)}`,
      `Mejor alternativa estructural: ${formatCandidate(item.bestStructuralAlternative)}`,
      `Alertas: ${item.issues.length ? item.issues.join(", ") : "ninguna"}`,
      "-".repeat(64),
      ""
    );
  }

  lines.push(
    `Total de casos detallados: ${flagged.length}`,
    "",
    "IMPORTANTE:",
    "- Una estructura exacta es evidencia fuerte, no una prueba absoluta de identidad.",
    "- Las temporadas extra de TMDB no bajan la puntuación.",
    "- Las discrepancias se deben revisar antes de cambiar cualquier ID.",
    ""
  );

  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error(`No se encontró el archivo de entrada: ${INPUT}`);
  }

  const input = readJson(INPUT);

  if (!Array.isArray(input)) {
    throw new Error("El archivo de entrada debe contener un array JSON.");
  }

  const eligible = input.filter(
    (record) =>
      record.decision === "MATCH_FUERTE" ||
      record.decision === "MATCH_PROBABLE"
  );

  const audit = eligible.map(auditRecord);

  const estadosAuditoria = {};

  for (const item of audit) {
    const status =
      item.bestCandidateAudit?.status ?? "EVIDENCIA_INSUFICIENTE";

    estadosAuditoria[status] =
      (estadosAuditoria[status] ?? 0) + 1;
  }

  const summary = {
    totalRegistrosEntrada: input.length,
    totalMatchesAuditados: audit.length,
    matchFuerteOriginal: eligible.filter(
      (record) => record.decision === "MATCH_FUERTE"
    ).length,
    matchProbableOriginal: eligible.filter(
      (record) => record.decision === "MATCH_PROBABLE"
    ).length,
    estadosAuditoria,
    alternativaIsMejor: audit.filter(
      (item) => item.alternativeIsBetter
    ).length,
    evidenciaInsuficiente: audit.filter(
      (item) => !item.bestCandidateAudit?.evidenceAvailable
    ).length,
    reglas: {
      temporadasExtraTmdbPenalizadas: false,
      comparacionDeTotalesGlobalesComoContradiccion: false,
      toleranciaEpisodios: `máximo entre ${MIN_EPISODE_TOLERANCE} episodios y el ${EPISODE_TOLERANCE_RATIO * 100}% de la temporada M3U`,
      diferenciaMinimaParaAlternativa: ALTERNATIVE_ADVANTAGE,
      modificaCatalogo: false,
      consultaTmdb: false,
    },
  };

  const output = {
    generatedAt: new Date().toISOString(),
    summary,
    results: audit,
  };

  writeJson(OUTPUT_JSON, output);
  fs.writeFileSync(
    OUTPUT_TXT,
    buildTextReport(audit, summary),
    "utf8"
  );

  console.log("\n==============================================");
  console.log(" AUDITORÍA TMDB — LISTA 6 — VERSIÓN 2");
  console.log("==============================================");
  console.log(`Registros de entrada: ${input.length}`);
  console.log(`Matches auditados: ${audit.length}`);
  console.log("\nEstados:");

  for (const [status, count] of Object.entries(estadosAuditoria)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log(
    `\nAlternativas estructuralmente superiores: ${summary.alternativaIsMejor}`
  );
  console.log(
    `Evidencia insuficiente: ${summary.evidenciaInsuficiente}`
  );

  console.log("\nInformes generados:");
  console.log(`  ${OUTPUT_JSON}`);
  console.log(`  ${OUTPUT_TXT}`);

  console.log("\nEl catálogo original no fue modificado.");
}

try {
  main();
} catch (error) {
  console.error("\nError en la auditoría:", error.message);
  process.exitCode = 1;
}