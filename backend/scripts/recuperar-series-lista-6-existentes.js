import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE = path.resolve(__dirname, "..");

const MATCHES_FILE = path.join(
  BASE,
  "data/series-lista-6-clean-matches-reviewed.json"
);

const UNMATCHED_FILE = path.join(
  BASE,
  "data/unmatched-series-lista-6.json"
);

const CATALOG_FILE = path.join(
  BASE,
  "data/series-streams-combined.json"
);

const SOURCE = "lista-6";
const APPLY = process.argv.includes("--apply");

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}

function validNumber(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0;
}

function getEpisode(seasons, seasonNumber, episodeNumber) {
  const season = seasons?.[String(seasonNumber)];
  return season?.episodes?.[String(episodeNumber)] || null;
}

function getExistingEpisodeUrls(episode) {
  const urls = new Set();

  if (typeof episode?.streamUrl === "string" && episode.streamUrl.trim()) {
    urls.add(episode.streamUrl.trim());
  }

  if (Array.isArray(episode?.sources)) {
    for (const source of episode.sources) {
      const url =
        typeof source === "string"
          ? source
          : source?.url;

      if (typeof url === "string" && url.trim()) {
        urls.add(url.trim());
      }
    }
  }

  return urls;
}

function getOriginalSeries(unmatched, seriesName) {
  const wanted = normalizeName(seriesName);
  if (!wanted) return null;

  if (unmatched && !Array.isArray(unmatched)) {
    for (const [key, value] of Object.entries(unmatched)) {
      if (
        normalizeName(key) === wanted ||
        normalizeName(value?.seriesName) === wanted ||
        normalizeName(value?.normalizedSeriesName) === wanted
      ) {
        return value;
      }
    }
  }

  if (Array.isArray(unmatched)) {
    return unmatched.find((item) =>
      normalizeName(item?.seriesName) === wanted ||
      normalizeName(item?.normalizedSeriesName) === wanted
    ) || null;
  }

  return null;
}

function ensureSeason(catalogSeries, seasonNumber) {
  catalogSeries.seasons ||= {};

  const key = String(seasonNumber);

  if (!catalogSeries.seasons[key]) {
    catalogSeries.seasons[key] = {
      season: seasonNumber,
      episodes: {},
    };
  }

  catalogSeries.seasons[key].episodes ||= {};

  return catalogSeries.seasons[key];
}

function main() {
  if (!fs.existsSync(MATCHES_FILE)) {
    throw new Error(`No existe el archivo: ${MATCHES_FILE}`);
  }

  if (!fs.existsSync(UNMATCHED_FILE)) {
    throw new Error(`No existe el archivo: ${UNMATCHED_FILE}`);
  }

  if (!fs.existsSync(CATALOG_FILE)) {
    throw new Error(`No existe el catálogo: ${CATALOG_FILE}`);
  }

  // Conservamos el texto exacto para comprobar que nadie haya modificado
  // el catálogo mientras se prepara la importación.
  const initialCatalogText = fs.readFileSync(CATALOG_FILE, "utf8");

  const matches = readJSON(MATCHES_FILE);
  const unmatched = readJSON(UNMATCHED_FILE);
  const catalog = JSON.parse(initialCatalogText);

  if (!Array.isArray(matches)) {
    throw new Error("El archivo de coincidencias no contiene un array.");
  }

  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("El catálogo no tiene la estructura de objeto esperada.");
  }

  const report = {
    modo: APPLY ? "APLICACIÓN" : "SIMULACIÓN",
    coincidenciasFuertes: 0,
    seriesExistentesCandidatas: 0,
    seriesNuevasIgnoradas: 0,
    originalesNoEncontrados: 0,
    episodiosOriginalesInvalidos: 0,
    idsDuplicadosEnMatches: 0,
    episodiosExistentesEncontrados: 0,
    episodiosNuevos: 0,
    fuentesNuevas: 0,
    fuentesDuplicadas: 0,
    seriesConCambios: 0,
    errores: [],
    cambios: [],
  };

  const processedIds = new Set();
  const plans = [];

  for (const match of matches) {
    if (match?.decision !== "MATCH_FUERTE") continue;

    report.coincidenciasFuertes++;

    const id = validId(match?.bestMatch?.tmdbId);

    if (!id) {
      report.errores.push({
        serie: match?.seriesName || "(sin nombre)",
        error: "TMDB ID inválido",
      });
      continue;
    }

    if (processedIds.has(id)) {
      report.idsDuplicadosEnMatches++;
      continue;
    }

    processedIds.add(id);

    // Este script solo recupera contenido para series que ya existen.
    if (!catalog[id]) {
      report.seriesNuevasIgnoradas++;
      continue;
    }

    report.seriesExistentesCandidatas++;

    const seriesName = match.seriesName;
    const original = getOriginalSeries(unmatched, seriesName);

    if (!original || !Array.isArray(original.episodes)) {
      report.originalesNoEncontrados++;
      report.errores.push({
        id,
        serie: seriesName,
        error: "No se encontró el registro original o su lista de episodios",
      });
      continue;
    }

    // Primero validamos la serie completa. Si un episodio está mal formado,
    // no importamos parcialmente esa serie.
    let invalid = false;
    const episodePlans = new Map();

    for (const ep of original.episodes) {
      const seasonNumber = Number(ep?.season);
      const episodeNumber = Number(ep?.episode);
      const url = typeof ep?.url === "string" ? ep.url.trim() : "";

      if (
        !validNumber(seasonNumber) ||
        !validNumber(episodeNumber) ||
        !url
      ) {
        invalid = true;
        break;
      }

      const key = `${seasonNumber}:${episodeNumber}`;

      if (!episodePlans.has(key)) {
        episodePlans.set(key, {
          seasonNumber,
          episodeNumber,
          name: ep?.name || `${seriesName} S${seasonNumber} E${episodeNumber}`,
          urls: new Set(),
        });
      }

      episodePlans.get(key).urls.add(url);
    }

    if (invalid || episodePlans.size === 0) {
      report.episodiosOriginalesInvalidos++;
      report.errores.push({
        id,
        serie: seriesName,
        error: "Hay episodios inválidos o sin URL; se omite la serie completa",
      });
      continue;
    }

    const series = catalog[id];
    let newEpisodesForSeries = 0;
    let newSourcesForSeries = 0;
    let existingEpisodesForSeries = 0;
    const plannedEpisodes = [];

    for (const episodePlan of episodePlans.values()) {
      const existing = getEpisode(
        series.seasons,
        episodePlan.seasonNumber,
        episodePlan.episodeNumber
      );

      const existingUrls = getExistingEpisodeUrls(existing);
      const urlsToAdd = [];

      for (const url of episodePlan.urls) {
        // Evita duplicar una URL que ya figure como streamUrl o en sources,
        // aunque actualmente esté etiquetada con otra lista.
        if (existingUrls.has(url)) {
          report.fuentesDuplicadas++;
          continue;
        }

        existingUrls.add(url);
        urlsToAdd.push(url);
      }

      if (existing) {
        existingEpisodesForSeries++;
      } else {
        newEpisodesForSeries++;
      }

      newSourcesForSeries += urlsToAdd.length;

      plannedEpisodes.push({
        ...episodePlan,
        existing: Boolean(existing),
        urlsToAdd,
      });
    }

    report.episodiosExistentesEncontrados += existingEpisodesForSeries;
    report.episodiosNuevos += newEpisodesForSeries;
    report.fuentesNuevas += newSourcesForSeries;

    if (newEpisodesForSeries > 0 || newSourcesForSeries > 0) {
      report.seriesConCambios++;

      report.cambios.push({
        id,
        serie: series.name || seriesName,
        episodiosExistentes: existingEpisodesForSeries,
        episodiosNuevos: newEpisodesForSeries,
        fuentesNuevas: newSourcesForSeries,
      });

      plans.push({
        id,
        seriesName,
        episodes: plannedEpisodes,
      });
    }
  }

  console.log("\n======================================");
  console.log(" RECUPERAR SERIES — LISTA 6");
  console.log("======================================\n");

  console.log(JSON.stringify(report, null, 2));

  if (!APPLY) {
    console.log("\nSIMULACIÓN FINALIZADA.");
    console.log("El catálogo NO fue modificado.");
    console.log("Revisá los resultados antes de usar --apply.\n");
    return;
  }

  if (report.errores.length > 0) {
    throw new Error(
      "Se encontraron errores. No se aplicaron cambios; revisá la simulación."
    );
  }

  // Comprobación optimista: abortar si el catálogo cambió desde el inicio.
  const currentCatalogText = fs.readFileSync(CATALOG_FILE, "utf8");

  if (currentCatalogText !== initialCatalogText) {
    throw new Error(
      "El catálogo cambió durante la ejecución. No se escribió ningún cambio."
    );
  }

  // Aplicamos únicamente los episodios y fuentes que faltan.
  for (const plan of plans) {
    const series = catalog[plan.id];

    if (!series) {
      throw new Error(
        `La serie ${plan.id} ya no existe en el catálogo cargado.`
      );
    }

    for (const epPlan of plan.episodes) {
      const season = ensureSeason(series, epPlan.seasonNumber);
      const episodeKey = String(epPlan.episodeNumber);

      let episode = season.episodes[episodeKey];

      if (!episode) {
        episode = {
          episode: epPlan.episodeNumber,
          name: epPlan.name,
          sources: [],
        };

        season.episodes[episodeKey] = episode;
      }

      episode.sources ||= [];

      const currentUrls = getExistingEpisodeUrls(episode);

      for (const url of epPlan.urlsToAdd) {
        if (currentUrls.has(url)) continue;

        episode.sources.push({
          source: SOURCE,
          url,
        });

        currentUrls.add(url);

        // No reemplazamos nunca un streamUrl que ya existía.
        if (!episode.streamUrl) {
          episode.streamUrl = url;
        }
      }
    }
  }

  // Última comprobación antes de crear el respaldo y escribir.
  const lastCatalogText = fs.readFileSync(CATALOG_FILE, "utf8");

  if (lastCatalogText !== initialCatalogText) {
    throw new Error(
      "El catálogo cambió antes de escribir. Se canceló la operación."
    );
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupPath = `${CATALOG_FILE}.${timestamp}.bak`;
  const tempPath = `${CATALOG_FILE}.${process.pid}.tmp`;

  fs.copyFileSync(CATALOG_FILE, backupPath);

  try {
    fs.writeFileSync(
      tempPath,
      JSON.stringify(catalog, null, 2) + "\n",
      "utf8"
    );

    // El temporal está en el mismo directorio para hacer el reemplazo
    // final de forma atómica.
    fs.renameSync(tempPath, CATALOG_FILE);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }

  console.log("\nIMPORTACIÓN COMPLETADA.");
  console.log(`Respaldo anterior: ${backupPath}`);
  console.log(`Catálogo actualizado: ${CATALOG_FILE}`);
}

try {
  main();
} catch (error) {
  console.error("\nERROR:", error.message);
  process.exitCode = 1;
}
