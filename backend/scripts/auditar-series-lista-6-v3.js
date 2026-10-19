import fs from "node:fs";

const INPUT = "data/series-lista-6-audit-v2.json";
const OUTPUT = "data/series-lista-6-audit-v3.json";
const TXT = "data/series-lista-6-audit-v3.txt";

if (!fs.existsSync(INPUT)) {
  console.error(`No existe el informe: ${INPUT}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(INPUT, "utf8"));

if (!Array.isArray(report.results)) {
  console.error("El informe no contiene un array results válido.");
  process.exit(1);
}

const REVIEW_STATUSES = new Set(["REVISAR", "AMBIGUO"]);

function getStructureStats(candidate) {
  const checks = candidate.structure?.seasonChecks || [];

  const exact = checks.filter(
    x => x.status === "ESTRUCTURA_EXACTA"
  ).length;

  const partial = checks.filter(
    x => x.status === "COMPATIBLE_PARCIAL"
  ).length;

  const incompatible = checks.filter(
    x =>
      x.status === "CANTIDAD_INCOMPATIBLE" ||
      x.status === "EPISODIOS_INCOMPATIBLES"
  ).length;

  const missing = checks.filter(
    x => x.status === "TEMPORADA_NO_ENCONTRADA"
  ).length;

  const checked = checks.length;
  const supported = exact + partial;

  // La estructura pesa más que la coincidencia literal del título.
  const score =
    exact * 10 +
    partial * 5 -
    incompatible * 2 -
    missing * 7 +
    (candidate.titleExact ? 3 : 0);

  return {
    exact,
    partial,
    incompatible,
    missing,
    checked,
    supported,
    score
  };
}

function enrichCandidate(candidate) {
  return {
    ...candidate,
    secondPass: getStructureStats(candidate)
  };
}

function evaluate(item) {
  const candidates = (item.candidates || [])
    .map(enrichCandidate)
    .sort((a, b) =>
      b.secondPass.score - a.secondPass.score
    );

  const base = {
    originalStatus: item.status,
    originalReason: item.reason,
    recommendation: "MANTENER_REVISION",
    proposedTmdbId: null,
    proposedName: null,
    confidence: "BAJA",
    requiresManualReview: true,
    explanation: "",
    ranking: candidates.map(c => ({
      tmdbId: c.tmdbId,
      name: c.name,
      originalName: c.originalName,
      year: c.year,
      titleExact: c.titleExact,
      ...c.secondPass
    }))
  };

  if (candidates.length === 0) {
    return {
      ...base,
      recommendation: "SIN_CANDIDATOS",
      explanation:
        "No hay candidatos en el informe original. " +
        "Esta segunda pasada no realiza búsquedas nuevas."
    };
  }

  const best = candidates[0];
  const stats = best.secondPass;

  if (candidates.length === 1) {
    const hasStructuralEvidence = stats.supported > 0;
    const hasTitleEvidence =
      best.titleExact === true ||
      (best.titleEvidence || []).some(e => e.exact === true);

    if (
      (hasStructuralEvidence || hasTitleEvidence) &&
      stats.score >= 0
    ) {
      return {
        ...base,
        recommendation: "PROPUESTA_CANDIDATO_UNICO",
        proposedTmdbId: best.tmdbId,
        proposedName: best.name,
        confidence:
          stats.exact >= 2 ? "ALTA_PARA_REVISION" :
          stats.supported > 0 ? "MEDIA" : "BAJA",
        explanation:
          "Solo hay un candidato disponible y presenta evidencia " +
          "de título o estructura. Requiere confirmación manual."
      };
    }

    return {
      ...base,
      recommendation: "CANDIDATO_UNICO_PARA_REVISAR",
      proposedTmdbId: best.tmdbId,
      proposedName: best.name,
      explanation:
        "Solo hay un candidato, pero la evidencia disponible " +
        "no permite recomendarlo con suficiente seguridad."
    };
  }

  const second = candidates[1];
  const margin = stats.score - second.secondPass.score;

  // Una estructura dominante debe tener evidencia real de varias
  // temporadas; un título exacto por sí solo no puede ganar.
  const strongStructure =
    stats.exact >= 2 ||
    (stats.exact >= 1 && stats.partial >= 1) ||
    stats.partial >= 3;

  if (
    strongStructure &&
    stats.score > 0 &&
    margin >= 8
  ) {
    return {
      ...base,
      recommendation: "PROPUESTA_ESTRUCTURA_DOMINANTE",
      proposedTmdbId: best.tmdbId,
      proposedName: best.name,
      confidence: "ALTA_PARA_REVISION",
      explanation:
        `El candidato lidera por estructura: ${stats.exact} ` +
        `temporadas exactas, ${stats.partial} parciales y ` +
        `${stats.incompatible} incompatibles. Ventaja de puntuación: ` +
        `${margin} puntos. La selección todavía requiere revisión.`
    };
  }

  if (margin >= 8 && stats.supported >= 1 && stats.score > 0) {
    return {
      ...base,
      recommendation: "PROPUESTA_CON_EVIDENCIA_LIMITADA",
      proposedTmdbId: best.tmdbId,
      proposedName: best.name,
      confidence: "MEDIA",
      explanation:
        `El candidato mejor puntuado tiene una ventaja de ${margin} ` +
        "puntos, pero la evidencia estructural no alcanza el umbral " +
        "de dominancia fuerte."
    };
  }

  return {
    ...base,
    recommendation: "AMBIGUO_CONSERVADO",
    explanation:
      "Los candidatos no tienen una ventaja suficientemente sólida. " +
      "Se conserva la revisión manual."
  };
}

const result = {
  ...report,
  secondPassInfo: {
    version: 3,
    generatedAt: new Date().toISOString(),
    input: INPUT,
    description:
      "Análisis de candidatos existentes. No consulta TMDB " +
      "y no modifica el catálogo original.",
    scoring: {
      estructuraExacta: 10,
      estructuraParcial: 5,
      incompatible: -2,
      temporadaNoEncontrada: -7,
      tituloExacto: 3,
      minimumStructuralMargin: 8
    }
  },
  secondPassSummary: {},
  results: report.results.map(item => {
    if (!REVIEW_STATUSES.has(item.status)) {
      return {
        ...item,
        secondPass: {
          originalStatus: item.status,
          recommendation: "NO_EVALUADO_ESTADO_ORIGINAL",
          requiresManualReview: false
        }
      };
    }

    return {
      ...item,
      secondPass: evaluate(item)
    };
  })
};

const summary = {};

for (const item of result.results) {
  const recommendation =
    item.secondPass?.recommendation || "SIN_RECOMENDACION";

  summary[recommendation] = (summary[recommendation] || 0) + 1;
}

result.secondPassSummary = summary;

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(result, null, 2),
  "utf8"
);

const lines = [
  "AUDITORÍA DE SERIES LISTA 6 — SEGUNDA PASADA",
  "============================================",
  `Fecha: ${result.secondPassInfo.generatedAt}`,
  `Total de series: ${result.results.length}`,
  "",
  "RESUMEN:",
  ...Object.entries(summary).map(
    ([key, value]) => `${key}: ${value}`
  ),
  ""
];

for (const item of result.results) {
  const pass = item.secondPass;

  if (
    !pass ||
    pass.recommendation === "NO_EVALUADO_ESTADO_ORIGINAL"
  ) {
    continue;
  }

  lines.push("--------------------------------------------");
  lines.push(`Serie: ${item.seriesName || item.name || "Sin nombre"}`);
  lines.push(`Estado original: ${pass.originalStatus}`);
  lines.push(`Recomendación: ${pass.recommendation}`);
  lines.push(`Confianza: ${pass.confidence}`);
  lines.push(`Motivo: ${pass.explanation}`);

  if (pass.proposedTmdbId != null) {
    lines.push(
      `Propuesta: ${pass.proposedName} (TMDB ${pass.proposedTmdbId})`
    );
  }

  if (pass.ranking?.length) {
    lines.push("Candidatos ordenados:");

    for (const c of pass.ranking) {
      lines.push(
        `  - ${c.name} (${c.tmdbId}) | ` +
        `puntos=${c.score} | exactas=${c.exact} | ` +
        `parciales=${c.partial} | incompatibles=${c.incompatible} | ` +
        `no encontradas=${c.missing} | título exacto=${c.titleExact}`
      );
    }
  }

  lines.push("");
}

fs.writeFileSync(TXT, lines.join("\n"), "utf8");

console.log("\n============================================");
console.log(" AUDITORÍA LISTA 6 — SEGUNDA PASADA");
console.log("============================================");
console.log(`Total: ${result.results.length}`);
console.log("\nResumen de recomendaciones:");

for (const [key, value] of Object.entries(summary)) {
  console.log(`  ${key}: ${value}`);
}

console.log(`\nJSON: ${OUTPUT}`);
console.log(`TXT:  ${TXT}`);
console.log("\nNo se modificó el catálogo de series.");
