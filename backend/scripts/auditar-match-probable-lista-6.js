import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data');

const MATCHES_FILE = path.join(
  DATA_DIR,
  'series-lista-6-clean-matches.json'
);

const CATALOG_FILE = path.join(
  DATA_DIR,
  'series-streams-combined.json'
);

const REPORT_JSON = path.join(
  DATA_DIR,
  'auditoria-match-probable-lista-6.json'
);

const REPORT_TXT = path.join(
  DATA_DIR,
  'auditoria-match-probable-lista-6.txt'
);

function readJSON(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`No existe el archivo: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeStructure(structure = {}) {
  const result = {};

  for (const [season, episodes] of Object.entries(structure || {})) {
    const s = String(Number(season));

    if (
      s === 'NaN' ||
      !Number.isFinite(Number(episodes)) ||
      Number(episodes) < 0
    ) {
      continue;
    }

    result[s] = Number(episodes);
  }

  return Object.fromEntries(
    Object.entries(result).sort(
      ([a], [b]) => Number(a) - Number(b)
    )
  );
}

function catalogStructure(series) {
  const result = {};

  for (const [seasonKey, season] of Object.entries(series?.seasons || {})) {
    const seasonNumber = Number(season?.season ?? seasonKey);

    if (!Number.isFinite(seasonNumber)) continue;

    result[String(seasonNumber)] = Object.keys(
      season?.episodes || {}
    ).length;
  }

  return normalizeStructure(result);
}

function totalEpisodes(structure) {
  return Object.values(structure).reduce(
    (sum, count) => sum + count,
    0
  );
}

function compareStructures(expectedInput, actualInput) {
  const expected = normalizeStructure(expectedInput);
  const actual = normalizeStructure(actualInput);

  const allSeasons = [
    ...new Set([
      ...Object.keys(expected),
      ...Object.keys(actual),
    ]),
  ].sort((a, b) => Number(a) - Number(b));

  const sameSeasonSet =
    Object.keys(expected).length === Object.keys(actual).length &&
    Object.keys(expected).every(season =>
      Object.hasOwn(actual, season)
    );

  let expectedTotal = 0;
  let actualTotal = 0;
  let matchingEpisodes = 0;

  const differences = [];

  for (const season of allSeasons) {
    const expectedCount = expected[season] ?? 0;
    const actualCount = actual[season] ?? 0;

    expectedTotal += expectedCount;
    actualTotal += actualCount;

    matchingEpisodes += Math.min(expectedCount, actualCount);

    if (expectedCount !== actualCount) {
      differences.push({
        temporada: Number(season),
        lista: expectedCount,
        candidato: actualCount,
        diferencia: actualCount - expectedCount,
      });
    }
  }

  const denominator = Math.max(expectedTotal, actualTotal, 1);
  const similarity = matchingEpisodes / denominator;

  return {
    listaTemporadas: Object.keys(expected).length,
    candidatoTemporadas: Object.keys(actual).length,
    episodiosLista: expectedTotal,
    episodiosCandidato: actualTotal,
    mismaListaDeTemporadas: sameSeasonSet,
    estructuraExacta:
      sameSeasonSet && differences.length === 0,
    similitudEstructura: Number(similarity.toFixed(4)),
    diferencias: differences,
  };
}

function getCandidateOptions(item) {
  const options = Array.isArray(item.candidates)
    ? item.candidates
    : [];

  const byId = new Map();

  for (const candidate of [
    item.bestMatch,
    item.secondMatch,
    ...options,
  ]) {
    if (candidate?.tmdbId == null) continue;

    const id = String(candidate.tmdbId);

    if (!byId.has(id)) {
      byId.set(id, candidate);
    }
  }

  return [...byId.values()];
}

function classify(item, candidateComparison, catalogComparison, scoreGap) {
  const best = item.bestMatch || {};
  const similarity = candidateComparison?.similitudEstructura ?? 0;
  const exact = candidateComparison?.estructuraExacta === true;
  const titleMatches = best.titleMatch !== false;
  const ambiguous = scoreGap !== null && scoreGap < 8;

  let classification;
  let reason;

  if (exact && titleMatches && !ambiguous) {
    classification = 'ALTA_ESTRUCTURA';
    reason = 'Coinciden exactamente las cantidades por temporada.';
  } else if (
    similarity >= 0.90 &&
    candidateComparison?.mismaListaDeTemporadas &&
    titleMatches &&
    !ambiguous
  ) {
    classification = 'ALTA_ESTRUCTURA';
    reason = 'Coinciden las temporadas y las cantidades son muy similares.';
  } else if (
    catalogComparison?.estructuraExacta &&
    titleMatches
  ) {
    classification = 'REVISAR_CATALOGO';
    reason = 'La estructura de la lista coincide con la del catálogo actual.';
  } else if (similarity >= 0.65 && titleMatches) {
    classification = 'REVISAR';
    reason = 'Hay similitud estructural, pero faltan comprobaciones.';
  } else {
    classification = 'BAJA_COINCIDENCIA';
    reason = 'La estructura no ofrece suficiente respaldo.';
  }

  if (ambiguous && classification === 'ALTA_ESTRUCTURA') {
    classification = 'REVISAR';
    reason = 'Hay otro candidato con puntuación muy cercana.';
  }

  return {
    classification,
    reason,
    posibleAmbiguedad: ambiguous,
  };
}

function safeName(value) {
  return String(value || '').trim();
}

function analyze(item, catalog) {
  const best = item.bestMatch || {};
  const tmdbId = best.tmdbId == null
    ? null
    : String(best.tmdbId);

  const m3uStructure = normalizeStructure(
    item.m3uStructure || best.m3uStructure || {}
  );

  const candidateStructure = normalizeStructure(
    best.tmdbStructure || {}
  );

  const candidateComparison = compareStructures(
    m3uStructure,
    candidateStructure
  );

  const catalogSeries = tmdbId ? catalog[tmdbId] : null;
  const inCatalog = Boolean(catalogSeries);

  const currentCatalogStructure = inCatalog
    ? catalogStructure(catalogSeries)
    : {};

  const catalogComparison = inCatalog
    ? compareStructures(m3uStructure, currentCatalogStructure)
    : null;

  const candidates = getCandidateOptions(item)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const nextCandidate = candidates.find(
    candidate => String(candidate.tmdbId) !== String(tmdbId)
  );

  const scoreGap =
    best.score != null && nextCandidate?.score != null
      ? Number(best.score) - Number(nextCandidate.score)
      : null;

  const decision = classify(
    item,
    candidateComparison,
    catalogComparison,
    scoreGap
  );

  const candidateList = candidates.map(candidate => ({
    tmdbId: candidate.tmdbId,
    nombre: candidate.name,
    nombreOriginal: candidate.originalName,
    puntuacion: candidate.score ?? null,
    tituloCoincide: candidate.titleMatch ?? null,
    paises: candidate.originCountry || [],
    estreno: candidate.firstAirDate || null,
    episodiosTMDB: candidate.numberOfEpisodes ?? null,
    temporadasTMDB: candidate.numberOfSeasons ?? null,
    estructura: normalizeStructure(candidate.tmdbStructure || {}),
  }));

  return {
    serieLista: safeName(item.seriesName),
    decisionOriginal: item.decision,
    tmdbIdPropuesto: tmdbId,
    nombreTMDB: best.name || null,
    nombreOriginalTMDB: best.originalName || null,
    puntuacion: best.score ?? null,
    segundoCandidato: nextCandidate
      ? {
          tmdbId: nextCandidate.tmdbId,
          nombre: nextCandidate.name,
          puntuacion: nextCandidate.score ?? null,
        }
      : null,
    diferenciaPuntuacion: scoreGap,
    fechaEstreno: best.firstAirDate || null,
    paises: best.originCountry || [],
    estructuraLista: m3uStructure,
    estructuraCandidato: candidateStructure,
    comparacionCandidato: candidateComparison,
    existeEnCatalogo: inCatalog,
    nombreEnCatalogo: catalogSeries?.name || catalogSeries?.title || null,
    estructuraCatalogo: inCatalog ? currentCatalogStructure : null,
    comparacionCatalogo: catalogComparison,
    episodiosEnCatalogo: inCatalog
      ? totalEpisodes(currentCatalogStructure)
      : 0,
    clasificacionAuditoria: decision.classification,
    motivo: decision.reason,
    posibleAmbiguedad: decision.posibleAmbiguedad,
    candidatos: candidateList,
  };
}

function main() {
  const matchesData = readJSON(MATCHES_FILE);
  const catalog = readJSON(CATALOG_FILE);

  const matches = Array.isArray(matchesData)
    ? matchesData
    : Object.values(matchesData);

  const probable = matches.filter(
    item => item?.decision === 'MATCH_PROBABLE'
  );

  const report = probable
    .map(item => analyze(item, catalog))
    .sort((a, b) => {
      const order = {
        ALTA_ESTRUCTURA: 0,
        REVISAR_CATALOGO: 1,
        REVISAR: 2,
        BAJA_COINCIDENCIA: 3,
      };

      return (
        order[a.clasificacionAuditoria] -
          order[b.clasificacionAuditoria] ||
        (b.puntuacion || 0) - (a.puntuacion || 0)
      );
    });

  const counts = {};

  for (const item of report) {
    const key = item.clasificacionAuditoria;
    counts[key] = (counts[key] || 0) + 1;
  }

  const summary = {
    modo: 'SOLO LECTURA',
    archivoAnalizado: MATCHES_FILE,
    catalogoConsultado: CATALOG_FILE,
    probablesAnalizados: report.length,
    clasificaciones: counts,
    existentesEnCatalogo: report.filter(
      item => item.existeEnCatalogo
    ).length,
    noExistentesEnCatalogo: report.filter(
      item => !item.existeEnCatalogo
    ).length,
    estructurasExactasConCandidato: report.filter(
      item => item.comparacionCandidato.estructuraExacta
    ).length,
    estructurasExactasConCatalogo: report.filter(
      item => item.comparacionCatalogo?.estructuraExacta
    ).length,
    candidatosAmbiguos: report.filter(
      item => item.posibleAmbiguedad
    ).length,
  };

  const output = {
    resumen: summary,
    resultados: report,
  };

  fs.writeFileSync(
    REPORT_JSON,
    JSON.stringify(output, null, 2) + '\n',
    'utf8'
  );

  const lines = [
    'AUDITORÍA MATCH_PROBABLE — LISTA 6',
    '==================================',
    '',
    JSON.stringify(summary, null, 2),
    '',
  ];

  for (const item of report) {
    lines.push(
      `[${item.clasificacionAuditoria}] ${item.serieLista}`,
      `  TMDB: ${item.tmdbIdPropuesto ?? 'SIN ID'} — ${item.nombreTMDB || 'SIN NOMBRE'}`,
      `  Puntuación: ${item.puntuacion ?? 'N/D'} | Segundo candidato: ${item.segundoCandidato?.nombre || 'N/D'}`,
      `  Episodios lista/candidato: ${item.comparacionCandidato.episodiosLista}/${item.comparacionCandidato.episodiosCandidato}`,
      `  Similitud estructura: ${item.comparacionCandidato.similitudEstructura}`,
      `  Estructura exacta: ${item.comparacionCandidato.estructuraExacta}`,
      `  Existe en catálogo: ${item.existeEnCatalogo}`,
      `  Motivo: ${item.motivo}`,
      ''
    );
  }

  fs.writeFileSync(REPORT_TXT, lines.join('\n'), 'utf8');

  console.log('\n======================================');
  console.log(' AUDITORÍA MATCH_PROBABLE — LISTA 6');
  console.log('======================================');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nArchivos generados:');
  console.log(`- ${REPORT_JSON}`);
  console.log(`- ${REPORT_TXT}`);
  console.log('\nEl catálogo no fue modificado.');
}

try {
  main();
} catch (error) {
  console.error('\nERROR:', error.message);
  process.exitCode = 1;
}
