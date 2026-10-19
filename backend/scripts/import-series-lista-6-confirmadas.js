
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const UNMATCHED_FILE = path.join(
  DATA_DIR,
  "unmatched-series-lista-6.json"
);
const CATALOG_FILE = path.join(
  DATA_DIR,
  "series-streams-combined.json"
);

const APPLY = process.argv.includes("--apply");
const SOURCE = "lista-6";

// Solo estas asociaciones están autorizadas por este importador.
// La temporada 4 de Avatar queda excluida deliberadamente.
const TARGETS = [
  {
    name: "Avatar: La leyenda de Aang",
    tmdbId: "246",
    seasons: [1, 2, 3],
  },
  {
    name: "La casa de la pradera",
    tmdbId: "283304",
    seasons: [1],
  },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function getUrl(value) {
  if (typeof value === "string") return value;

  if (!value || typeof value !== "object") return "";

  return (
    value.streamUrl ||
    value.url ||
    value.stream_url ||
    ""
  );
}

function getSourceUrls(episode) {
  const urls = new Set();

  const mainUrl = getUrl(episode);
  if (mainUrl) urls.add(mainUrl);

  for (const source of episode.sources || []) {
    const url = getUrl(source);
    if (url) urls.add(url);
  }

  return urls;
}

function makeSource(existingSources, url) {
  // Reutiliza la estructura de una fuente existente cuando sea posible.
  const template = existingSources?.[0];

  if (template && typeof template === "object") {
    const result = { ...template, source: SOURCE };

    if ("streamUrl" in template) {
      result.streamUrl = url;
    } else if ("url" in template) {
      result.url = url;
    } else if ("stream_url" in template) {
      result.stream_url = url;
    } else {
      result.streamUrl = url;
    }

    return result;
  }

  return {
    source: SOURCE,
    streamUrl: url,
  };
}

function getSeason(series, seasonNumber) {
  const seasons = series.seasons || {};
  return seasons[String(seasonNumber)] || null;
}

function main() {
  if (!fs.existsSync(UNMATCHED_FILE)) {
    throw new Error(`No existe ${UNMATCHED_FILE}`);
  }

  if (!fs.existsSync(CATALOG_FILE)) {
    throw new Error(`No existe ${CATALOG_FILE}`);
  }

  const unmatched = readJson(UNMATCHED_FILE);
  const catalog = readJson(CATALOG_FILE);

  const report = {
    mode: APPLY ? "APLICAR CAMBIOS" : "SIMULACIÓN",
    source: SOURCE,
    series: [],
    addedSources: 0,
    skippedDuplicates: 0,
    skippedSeason4: 0,
    errors: [],
  };

  // Copia de trabajo: en modo simulación no se escribe al disco.
  for (const target of TARGETS) {
    const series = catalog[target.tmdbId];

    if (!series) {
      report.errors.push(
        `No existe el ID ${target.tmdbId} en el catálogo`
      );
      continue;
    }

    const entry = Object.values(unmatched).find(
      item => item.seriesName === target.name
    );

    if (!entry) {
      report.errors.push(
        `No se encontró "${target.name}" en el archivo de pendientes`
      );
      continue;
    }

    const seriesReport = {
      name: target.name,
      tmdbId: target.tmdbId,
      added: 0,
      duplicates: 0,
      createdEpisodes: 0,
      bySeason: {},
    };

    // Agrupa por temporada y episodio.
    const grouped = new Map();

    for (const item of entry.episodes || []) {
      const seasonNumber = Number(item.season);
      const episodeNumber = Number(item.episode);

      if (!Number.isInteger(seasonNumber) ||
          !Number.isInteger(episodeNumber) ||
          seasonNumber < 1 ||
          episodeNumber < 1 ||
          !item.url) {
        report.errors.push(
          `Entrada inválida en "${target.name}": ${item.name || "sin nombre"}`
        );
        continue;
      }

      // No incorporar temporadas que no estén expresamente autorizadas.
      if (!target.seasons.includes(seasonNumber)) {
        if (target.name.startsWith("Avatar") && seasonNumber === 4) {
          report.skippedSeason4++;
        }
        continue;
      }

      const key = `${seasonNumber}:${episodeNumber}`;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }

    for (const [key, items] of grouped) {
      const [seasonNumber, episodeNumber] = key
        .split(":")
        .map(Number);

      let season = getSeason(series, seasonNumber);

      if (!season) {
        // No inventar temporadas ni estructuras nuevas.
        report.errors.push(
          `${target.name}: no existe la temporada ${seasonNumber} en ${target.tmdbId}`
        );
        continue;
      }

      season.episodes ||= {};

      let episode = season.episodes[String(episodeNumber)];

      if (!episode) {
        const first = items[0];

        episode = {
          episode: episodeNumber,
          name: first.name,
          streamUrl: first.url,
          sources: [],
        };

        season.episodes[String(episodeNumber)] = episode;
        seriesReport.createdEpisodes++;
      }

      episode.sources ||= [];

      const knownUrls = getSourceUrls(episode);
      const seenInInput = new Set();

      for (const item of items) {
        const url = item.url;

        // Evitar repetir URLs idénticas en el archivo de entrada.
        if (seenInInput.has(url)) {
          seriesReport.duplicates++;
          report.skippedDuplicates++;
          continue;
        }

        seenInInput.add(url);

        // No añadir una URL que ya exista en el episodio.
        if (knownUrls.has(url)) {
          seriesReport.duplicates++;
          report.skippedDuplicates++;
          continue;
        }

        episode.sources.push(makeSource(episode.sources, url));
        knownUrls.add(url);

        seriesReport.added++;
        report.addedSources++;
      }

      const seasonKey = String(seasonNumber);
      seriesReport.bySeason[seasonKey] ||= {
        episodiosProcesados: 0,
        fuentesAgregadas: 0,
      };

      seriesReport.bySeason[seasonKey].episodiosProcesados++;
      seriesReport.bySeason[seasonKey].fuentesAgregadas +=
        items.filter(item => knownUrls.has(item.url)).length;
    }

    report.series.push(seriesReport);
  }

  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length) {
    console.error(
      "\nHay errores de validación. Revisá el informe antes de aplicar cambios."
    );
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log(
      "\nSIMULACIÓN: no se modificó ningún archivo."
    );
    console.log(
      "Si el informe es correcto, ejecutá el mismo script con --apply."
    );
    return;
  }

  const backupFile = `${CATALOG_FILE}.backup-lista-6-${Date.now()}`;

  fs.copyFileSync(CATALOG_FILE, backupFile);

  fs.writeFileSync(
    CATALOG_FILE,
    JSON.stringify(catalog, null, 2) + "\n",
    "utf8"
  );

  console.log("\nImportación terminada.");
  console.log(`Copia de seguridad: ${backupFile}`);
  console.log(`Catálogo actualizado: ${CATALOG_FILE}`);
}

main();