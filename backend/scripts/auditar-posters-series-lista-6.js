
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

const LIST_NUMBER = 6;
const SOURCE_NAME = `lista-${LIST_NUMBER}`;

const AUDIT_FILE = path.join(
  DATA_DIR,
  "series-lista-6-match-audit-v2.json"
);

const CLEAN_FILE = path.join(
  DATA_DIR,
  "series-lista-6-clean-matches-reviewed.json"
);

const CACHE_FILE = path.join(
  DATA_DIR,
  "series-lista-6-poster-cache.json"
);

const OUTPUT_JSON = path.join(
  DATA_DIR,
  "series-lista-6-poster-audit.json"
);

const OUTPUT_TXT = path.join(
  DATA_DIR,
  "series-lista-6-poster-audit.txt"
);

const M3U_TIMEOUT = 10 * 60 * 1000;
const TMDB_TIMEOUT = 30000;
const DELAY_MS = 250;

const API_KEY =
  process.env.TMDB_API_KEY ||
  process.env.VITE_TMDB_API_KEY ||
  "";

const ACCESS_TOKEN =
  process.env.TMDB_ACCESS_TOKEN ||
  process.env.TMDB_BEARER_TOKEN ||
  "";

const TMDB_BASE = "https://api.themoviedb.org/3";

function log(message = "") {
  console.log(message);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJsonAtomic(file, data) {
  const temp = `${file}.tmp-${process.pid}`;

  await fs.writeFile(
    temp,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  await fs.rename(temp, file);
}

async function loadJsonIfExists(file, fallback) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

// ------------------------------------------------------------
// CONFIGURACIÓN IPTV
// ------------------------------------------------------------

function getListConfig() {
  const url = process.env[`IPTV_M3U_URL_${LIST_NUMBER}`];
  const username = process.env[`IPTV_USER_${LIST_NUMBER}`];
  const password = process.env[`IPTV_PASSWORD_${LIST_NUMBER}`];

  if (!url || !username || !password) {
    throw new Error(
      `Falta IPTV_M3U_URL_${LIST_NUMBER}, ` +
      `IPTV_USER_${LIST_NUMBER} o ` +
      `IPTV_PASSWORD_${LIST_NUMBER} en .env`
    );
  }

  return { url, username, password };
}

async function downloadM3U() {
  const config = getListConfig();

  log("Descargando M3U de lista 6...");

  const response = await axios.get(config.url, {
    params: {
      username: config.username,
      password: config.password,
      type: "m3u_plus",
      output: "m3u8"
    },
    timeout: M3U_TIMEOUT,
    responseType: "text",
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: status => status >= 200 && status < 400
  });

  if (!response.data || typeof response.data !== "string") {
    throw new Error("La respuesta M3U está vacía o no es texto.");
  }

  return response.data;
}

// ------------------------------------------------------------
// PARSER M3U
// ------------------------------------------------------------

function parseEpisodeName(rawName) {
  const name = String(rawName || "")
    .replace(/\s+/g, " ")
    .trim();

  const match = name.match(
    /^(.*?)\s*S(\d{1,3})\s*E(\d{1,3})\s*$/i
  );

  if (!match || !match[1].trim()) return null;

  return {
    rawName: name,
    seriesName: match[1].trim(),
    normalizedSeriesName: normalizeText(match[1]),
    season: Number(match[2]),
    episode: Number(match[3])
  };
}

function extractLogo(extinf) {
  const match = String(extinf || "").match(
    /\btvg-logo\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/i
  );

  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim() || null;
}

function parseM3U(content) {
  const lines = String(content)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const entries = [];
  let currentExtInf = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      currentExtInf = line;
      continue;
    }

    if (currentExtInf && !line.startsWith("#")) {
      const comma = currentExtInf.lastIndexOf(",");
      let name = comma >= 0
        ? currentExtInf.slice(comma + 1).trim()
        : "";

      if (!name) {
        const tvgName = currentExtInf.match(
          /\btvg-name="([^"]*)"/i
        );

        name = tvgName?.[1]?.trim() || "";
      }

      const parsed = parseEpisodeName(name);

      if (parsed) {
        entries.push({
          ...parsed,
          logo: extractLogo(currentExtInf)
        });
      }

      currentExtInf = null;
    }
  }

  return entries;
}

// ------------------------------------------------------------
// AGRUPAR LOGOS POR SERIE
// ------------------------------------------------------------

function buildM3USeriesIndex(entries) {
  const index = new Map();

  for (const entry of entries) {
    const key = entry.normalizedSeriesName;

    if (!index.has(key)) {
      index.set(key, {
        seriesName: entry.seriesName,
        normalizedSeriesName: key,
        totalEpisodes: 0,
        episodesWithLogo: 0,
        logoFiles: {},
        examples: []
      });
    }

    const item = index.get(key);
    item.totalEpisodes++;

    if (entry.logo) {
      const filename = getImageFilename(entry.logo);

      if (filename) {
        item.episodesWithLogo++;

        if (!item.logoFiles[filename]) {
          item.logoFiles[filename] = {
            filename,
            url: entry.logo,
            count: 0,
            examples: []
          };
        }

        const logo = item.logoFiles[filename];
        logo.count++;

        if (logo.examples.length < 3) {
          logo.examples.push(entry.rawName);
        }
      }
    }

    if (item.examples.length < 5) {
      item.examples.push(entry.rawName);
    }
  }

  for (const item of index.values()) {
    item.logoFiles = Object.values(item.logoFiles)
      .sort((a, b) => b.count - a.count);
  }

  return index;
}

function getImageFilename(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const filename = path.posix.basename(url.pathname);
    return filename && filename.includes(".") ? filename : null;
  } catch {
    const cleaned = String(value).split("?")[0].split("#")[0];
    const filename = path.posix.basename(cleaned);
    return filename && filename.includes(".") ? filename : null;
  }
}

// ------------------------------------------------------------
// IDENTIFICAR CANDIDATOS EN LOS JSON DE AUDITORÍA
// ------------------------------------------------------------

function getAuditResults(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.audits)) return data.audits;

  throw new Error(
    "No encuentro un array de resultados en el JSON de auditoría v2."
  );
}

function getSeriesName(item) {
  return (
    item?.seriesName ||
    item?.normalizedSeriesName ||
    item?.originalName ||
    item?.name ||
    item?.m3uName ||
    item?.serieLista ||
    item?.title ||
    ""
  );
}

function collectCandidates(item) {
  const found = new Map();

  function addCandidate(candidate, origin) {
    if (!candidate || typeof candidate !== "object") return;

    const rawId =
      candidate.tmdbId ??
      candidate.tmdb_id ??
      candidate.id;

    if (rawId === undefined || rawId === null) return;

    const id = String(rawId);

    if (!/^\d+$/.test(id)) return;

    const name =
      candidate.name ||
      candidate.title ||
      candidate.nombreTMDB ||
      candidate.originalName ||
      candidate.original_name ||
      null;

    if (!found.has(id)) {
      found.set(id, {
        tmdbId: id,
        name,
        origins: []
      });
    }

    const saved = found.get(id);

    if (!saved.name && name) saved.name = name;
    if (!saved.origins.includes(origin)) saved.origins.push(origin);
  }

  function visit(value, origin, depth = 0) {
    if (!value || typeof value !== "object" || depth > 8) return;

    if (Array.isArray(value)) {
      for (const child of value) visit(child, origin, depth + 1);
      return;
    }

    addCandidate(value, origin);

    for (const [key, child] of Object.entries(value)) {
      if (
        /candidate|alternative|structural|currentCandidate|bestMatch|secondMatch|bestCandidateAudit/i.test(key)
      ) {
        visit(child, key, depth + 1);
      }
    }
  }

  visit(item, "audit");

  return [...found.values()];
}

function buildAuditIndex(results) {
  const index = new Map();

  for (const item of results) {
    const name = getSeriesName(item);
    const key = normalizeText(name);

    if (!key) continue;

    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }

  return index;
}

// ------------------------------------------------------------
// TMDB: POSTER PRINCIPAL Y ALTERNATIVOS
// ------------------------------------------------------------

async function tmdbGet(endpoint) {
  const headers = {
    accept: "application/json"
  };

  const params = {};

  if (ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${ACCESS_TOKEN}`;
  } else if (API_KEY) {
    params.api_key = API_KEY;
  } else {
    throw new Error(
      "Falta TMDB_API_KEY, VITE_TMDB_API_KEY, " +
      "TMDB_ACCESS_TOKEN o TMDB_BEARER_TOKEN en .env."
    );
  }

  const response = await axios.get(
    `${TMDB_BASE}${endpoint}`,
    {
      headers,
      params,
      timeout: TMDB_TIMEOUT
    }
  );

  return response.data;
}

async function getCandidateImages(candidate, cache) {
  const id = String(candidate.tmdbId);

  if (cache[id]?.status === "ok") {
    return cache[id];
  }

  try {
    // Consulta principal: devuelve poster_path.
    const details = await tmdbGet(`/tv/${id}`);

    await sleep(DELAY_MS);

    // Consulta de imágenes: incluye todos los posters disponibles.
    const images = await tmdbGet(
      `/tv/${id}/images?include_image_language=en,null,es,ja,ko`
    );

    const mainPoster = details.poster_path || null;

    const alternativePosters = Array.isArray(images.posters)
      ? images.posters
          .map(poster => poster.file_path)
          .filter(Boolean)
      : [];

    const allPosterPaths = [...new Set([
      mainPoster,
      ...alternativePosters
    ].filter(Boolean))];

    const result = {
      status: "ok",
      tmdbId: id,
      name: details.name || candidate.name || null,
      mainPoster,
      alternativePosters,
      allPosterPaths,
      allPosterFilenames: allPosterPaths
        .map(getImageFilename)
        .filter(Boolean),
      fetchedAt: new Date().toISOString()
    };

    cache[id] = result;
    await writeJsonAtomic(CACHE_FILE, cache);

    return result;
  } catch (error) {
    const result = {
      status: "error",
      tmdbId: id,
      name: candidate.name || null,
      error: error.response?.status
        ? `HTTP ${error.response.status}`
        : error.message
    };

    cache[id] = result;
    await writeJsonAtomic(CACHE_FILE, cache);

    return result;
  }
}

// ------------------------------------------------------------
// COMPARAR LOGOS CON PÓSTERES
// ------------------------------------------------------------

function comparePosters(series, candidateImages) {
  const logos = series.logoFiles || [];

  if (candidateImages.status !== "ok") {
    return {
      status: "TMDB_ERROR",
      error: candidateImages.error || "No se pudieron consultar las imágenes."
    };
  }

  const mainFilename = getImageFilename(candidateImages.mainPoster);

  const alternativeFilenames = new Set(
    candidateImages.alternativePosters
      .map(getImageFilename)
      .filter(Boolean)
  );

  const matches = logos.map(logo => {
    let matchType = "NO_COINCIDE";

    if (logo.filename === mainFilename) {
      matchType = "POSTER_PRINCIPAL";
    } else if (alternativeFilenames.has(logo.filename)) {
      matchType = "POSTER_ALTERNATIVO";
    }

    return {
      filename: logo.filename,
      count: logo.count,
      matchType,
      examples: logo.examples
    };
  });

  const mainCount = matches
    .filter(match => match.matchType === "POSTER_PRINCIPAL")
    .reduce((sum, match) => sum + match.count, 0);

  const alternativeCount = matches
    .filter(match => match.matchType === "POSTER_ALTERNATIVO")
    .reduce((sum, match) => sum + match.count, 0);

  const unmatchedCount = matches
    .filter(match => match.matchType === "NO_COINCIDE")
    .reduce((sum, match) => sum + match.count, 0);

  return {
    status: "ok",
    mainPoster: candidateImages.mainPoster,
    mainPosterFilename: mainFilename,
    alternativePosterCount: candidateImages.alternativePosters.length,
    logoEpisodesCompared: logos.reduce((sum, logo) => sum + logo.count, 0),
    mainPosterEpisodes: mainCount,
    alternativePosterEpisodes: alternativeCount,
    unmatchedLogoEpisodes: unmatchedCount,
    matches
  };
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

async function main() {
  console.log("======================================");
  console.log(" AUDITORÍA DE PÓSTERES — LISTA 6");
  console.log(" SOLO LECTURA");
  console.log("======================================\n");

  const [auditData, cleanData, cache] = await Promise.all([
    readJson(AUDIT_FILE),
    loadJsonIfExists(CLEAN_FILE, []),
    loadJsonIfExists(CACHE_FILE, {})
  ]);

  const auditResults = getAuditResults(auditData);
  const auditIndex = buildAuditIndex(auditResults);

  log(`Resultados de auditoría estructural: ${auditResults.length}`);
  log(`Registros del JSON clean/reviewed: ${Array.isArray(cleanData) ? cleanData.length : "formato objeto"}`);

  const m3u = await downloadM3U();
  const entries = parseM3U(m3u);

  if (!entries.length) {
    throw new Error(
      "No se detectaron episodios con formato Sxx Exx en la M3U."
    );
  }

  const m3uIndex = buildM3USeriesIndex(entries);
  const seriesResults = [];

  log(`Episodios encontrados en M3U: ${entries.length}`);
  log(`Series agrupadas por nombre: ${m3uIndex.size}\n`);

  let processed = 0;
  let totalCandidates = 0;
  let mainMatches = 0;
  let alternativeMatches = 0;
  let withoutLogo = 0;
  let withoutAudit = 0;

  for (const [normalizedName, series] of m3uIndex) {
    processed++;

    if (!series.logoFiles.length) withoutLogo++;

    const auditMatches = auditIndex.get(normalizedName) || [];

    if (!auditMatches.length) {
      withoutAudit++;

      seriesResults.push({
        seriesName: series.seriesName,
        normalizedSeriesName: normalizedName,
        m3u: series,
        auditFound: false,
        candidates: []
      });

      continue;
    }

    const allCandidates = new Map();

    for (const auditItem of auditMatches) {
      for (const candidate of collectCandidates(auditItem)) {
        if (!allCandidates.has(candidate.tmdbId)) {
          allCandidates.set(candidate.tmdbId, {
            ...candidate,
            auditRecords: []
          });
        }

        allCandidates.get(candidate.tmdbId).auditRecords.push(auditItem);
      }
    }

    const candidateResults = [];

    for (const candidate of allCandidates.values()) {
      totalCandidates++;

      const images = await getCandidateImages(candidate, cache);
      const comparison = comparePosters(series, images);

      mainMatches += comparison.mainPosterEpisodes || 0;
      alternativeMatches += comparison.alternativePosterEpisodes || 0;

      candidateResults.push({
        tmdbId: candidate.tmdbId,
        name: images.name || candidate.name,
        candidateOrigins: candidate.origins,
        auditRecordCount: candidate.auditRecords.length,
        images,
        posterComparison: comparison
      });
    }

    candidateResults.sort((a, b) => {
      const score = item =>
        (item.posterComparison.mainPosterEpisodes || 0) * 2 +
        (item.posterComparison.alternativePosterEpisodes || 0);

      return score(b) - score(a);
    });

    seriesResults.push({
      seriesName: series.seriesName,
      normalizedSeriesName: normalizedName,
      m3u: series,
      auditFound: true,
      auditRecordCount: auditMatches.length,
      candidates: candidateResults
    });

    if (processed % 25 === 0 || processed === m3uIndex.size) {
      log(`Series analizadas: ${processed}/${m3uIndex.size}`);
    }
  }

  const output = {
    version: 1,
    source: SOURCE_NAME,
    generatedAt: new Date().toISOString(),
    safety: {
      downloadedM3U: true,
      queriedTMDB: true,
      modifiedCatalog: false,
      modifiedMatchDecisions: false
    },
    summary: {
      m3uEpisodes: entries.length,
      m3uSeries: m3uIndex.size,
      auditSeriesMatchedByExactNormalizedName:
        seriesResults.filter(item => item.auditFound).length,
      seriesWithoutAuditMatch: withoutAudit,
      seriesWithoutLogo: withoutLogo,
      candidatesQueried: totalCandidates,
      episodesMatchingMainPoster: mainMatches,
      episodesMatchingAlternativePoster: alternativeMatches
    },
    results: seriesResults
  };

  await writeJsonAtomic(OUTPUT_JSON, output);

  const lines = [
    "AUDITORÍA DE PÓSTERES — LISTA 6",
    `Generado: ${output.generatedAt}`,
    "",
    "SOLO LECTURA: no se modificó el catálogo ni las decisiones de matching.",
    "",
    `Episodios M3U: ${output.summary.m3uEpisodes}`,
    `Series M3U: ${output.summary.m3uSeries}`,
    `Series con auditoría coincidente: ${output.summary.auditSeriesMatchedByExactNormalizedName}`,
    `Series sin coincidencia en auditoría: ${withoutAudit}`,
    `Series sin logo recuperable: ${withoutLogo}`,
    `Candidatos consultados: ${totalCandidates}`,
    `Episodios cuyo logo coincide con póster principal: ${mainMatches}`,
    `Episodios cuyo logo coincide con póster alternativo: ${alternativeMatches}`,
    "",
    "NOTA: una coincidencia de archivo es evidencia adicional, no prueba definitiva de identidad.",
    ""
  ];

  for (const series of seriesResults) {
    lines.push("=".repeat(60));
    lines.push(`SERIE M3U: ${series.seriesName}`);
    lines.push(`Episodios: ${series.m3u.totalEpisodes}`);
    lines.push(`Episodios con logo: ${series.m3u.episodesWithLogo}`);

    if (!series.auditFound) {
      lines.push("SIN MATCH EXACTO EN LOS RESULTADOS DE AUDITORÍA.");
      continue;
    }

    if (!series.candidates.length) {
      lines.push("No se pudieron extraer candidatos TMDB del registro de auditoría.");
      continue;
    }

    for (const candidate of series.candidates) {
      const comparison = candidate.posterComparison;

      lines.push("");
      lines.push(`TMDB ${candidate.tmdbId}: ${candidate.name || "(sin nombre)"}`);

      if (comparison.status !== "ok") {
        lines.push(`Consulta de imágenes fallida: ${comparison.error || comparison.status}`);
        continue;
      }

      lines.push(`Póster principal: ${comparison.mainPoster || "ninguno"}`);
      lines.push(`Coincidencias con póster principal: ${comparison.mainPosterEpisodes}`);
      lines.push(`Coincidencias con póster alternativo: ${comparison.alternativePosterEpisodes}`);
      lines.push(`Logos sin coincidencia: ${comparison.unmatchedLogoEpisodes}`);

      for (const match of comparison.matches) {
        lines.push(
          `  ${match.matchType} | ${match.filename} | episodios: ${match.count}`
        );
      }
    }

    lines.push("");
  }

  await fs.writeFile(OUTPUT_TXT, lines.join("\n"), "utf8");

  console.log("\n======================================");
  console.log(" AUDITORÍA TERMINADA");
  console.log("======================================");
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`TXT:  ${OUTPUT_TXT}`);
  console.log("Catálogo modificado: NO");
  console.log("Decisiones de matching modificadas: NO");
}

main().catch(error => {
  console.error("\nERROR EN AUDITORÍA:");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
