import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");

const MATCHES_FILE = path.join(
  DATA_DIR,
  "series-lista-6-clean-matches-reviewed.json"
);

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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getRecords(data) {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    return Object.values(data);
  }

  throw new Error("El archivo JSON no contiene una lista u objeto válido.");
}

function getOriginalName(item) {
  return (
    item?.seriesName ||
    item?.normalizedSeriesName ||
    item?.name ||
    ""
  );
}

function getTmdbId(match) {
  const value =
    match?.bestMatch?.tmdbId ??
    match?.bestMatch?.id ??
    match?.tmdbId;

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? String(id)
    : null;
}

function getDisplayName(match) {
  return String(
    match?.bestMatch?.name ||
    match?.seriesName ||
    match?.normalizedSeriesName ||
    ""
  ).trim();
}

function makeEpisodeName(item, seriesName, season, episode) {
  return (
    String(item?.name || "").trim() ||
    `${seriesName} S${String(season).padStart(2, "0")} E${String(episode).padStart(2, "0")}`
  );
}

function validateOriginal(entry, seriesName) {
  const errors = [];
  const episodes = entry?.episodes;

  if (!Array.isArray(episodes) || episodes.length === 0) {
    return {
      errors: [`"${seriesName}": no contiene episodios.`],
      episodes: [],
    };
  }

  for (let i = 0; i < episodes.length; i++) {
    const item = episodes[i];
    const season = Number(item?.season);
    const episode = Number(item?.episode);

    if (
      !Number.isInteger(season) ||
      season < 1 ||
      !Number.isInteger(episode) ||
      episode < 1 ||
      typeof item?.url !== "string" ||
      !item.url.trim()
    ) {
      errors.push(
        `"${seriesName}": episodio inválido en la posición ${i + 1}.`
      );
    }
  }

  return { errors, episodes };
}

function buildSeries(match, entry) {
  const id = getTmdbId(match);
  const seriesName = getDisplayName(match);
  const grouped = new Map();
  let duplicateUrls = 0;

  for (const item of entry.episodes) {
    const seasonNumber = Number(item.season);
    const episodeNumber = Number(item.episode);
    const key = `${seasonNumber}:${episodeNumber}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        seasonNumber,
        episodeNumber,
        items: [],
        urls: new Set(),
      });
    }

    const group = grouped.get(key);
    group.items.push(item);

    if (group.urls.has(item.url)) {
      duplicateUrls++;
    } else {
      group.urls.add(item.url);
    }
  }

  const seasons = {};
  let episodeCount = 0;
  let sourceCount = 0;

  for (const group of grouped.values()) {
    const seasonKey = String(group.seasonNumber);
    const episodeKey = String(group.episodeNumber);

    seasons[seasonKey] ||= {
      season: group.seasonNumber,
      episodes: {},
    };

    const urls = [...group.urls];
    const firstItem = group.items[0];

    seasons[seasonKey].episodes[episodeKey] = {
      episode: group.episodeNumber,
      name: makeEpisodeName(
        firstItem,
        seriesName,
        group.seasonNumber,
        group.episodeNumber
      ),
      streamUrl: urls[0],
      sources: urls.map(url => ({
        source: SOURCE,
        url,
      })),
    };

    episodeCount++;
    sourceCount += urls.length;
  }

  return {
    id,
    series: {
      tmdbId: Number(id),
      name: seriesName,
      seasons,
    },
    episodeCount,
    sourceCount,
    duplicateUrls,
  };
}

function main() {
  for (const file of [MATCHES_FILE, UNMATCHED_FILE, CATALOG_FILE]) {
    if (!fs.existsSync(file)) {
      throw new Error(`No existe el archivo: ${file}`);
    }
  }

  const matches = getRecords(readJson(MATCHES_FILE));
  const unmatched = getRecords(readJson(UNMATCHED_FILE));
  const catalog = readJson(CATALOG_FILE);

  if (
    !catalog ||
    typeof catalog !== "object" ||
    Array.isArray(catalog)
  ) {
    throw new Error("El catálogo no tiene el formato esperado de objeto por TMDB ID.");
  }

  const originalByName = new Map();

  for (const entry of unmatched) {
    const key = normalizeName(getOriginalName(entry));
    if (!key) continue;

    if (!originalByName.has(key)) {
      originalByName.set(key, entry);
    } else {
      console.warn(
        `Aviso: hay más de una entrada original para "${getOriginalName(entry)}". Se usará la primera.`
      );
    }
  }

  const report = {
    modo: APPLY ? "APLICAR" : "SIMULACIÓN",
    decisionesFuertes: 0,
    originalesEncontrados: 0,
    originalesFaltantes: 0,
    idsInvalidos: 0,
    nombresInvalidos: 0,
    seriesExistentesOmitidas: 0,
    idsDuplicadosEnMatches: 0,
    seriesNuevas: 0,
    episodiosNuevos: 0,
    fuentesNuevas: 0,
    urlsDuplicadasOmitidas: 0,
    errores: [],
    omitidas: [],
    nuevas: [],
  };

  const seenIds = new Map();
  const planned = [];

  for (const match of matches) {
    if (match?.decision !== "MATCH_FUERTE") continue;

    report.decisionesFuertes++;

    const id = getTmdbId(match);
    const seriesName = getDisplayName(match);

    if (!id) {
      report.idsInvalidos++;
      report.errores.push(
        `ID TMDB inválido para "${match?.seriesName || "sin nombre"}".`
      );
      continue;
    }

    if (!seriesName) {
      report.nombresInvalidos++;
      report.errores.push(`Nombre vacío para el ID TMDB ${id}.`);
      continue;
    }

    if (seenIds.has(id)) {
      report.idsDuplicadosEnMatches++;
      const previousName = seenIds.get(id);

      if (normalizeName(previousName) !== normalizeName(seriesName)) {
        report.errores.push(
          `El ID ${id} aparece asociado a "${previousName}" y "${seriesName}".`
        );
      }

      continue;
    }

    seenIds.set(id, seriesName);

    const originalKey = normalizeName(
      match?.seriesName ||
      match?.normalizedSeriesName ||
      seriesName
    );

    const entry = originalByName.get(originalKey);

    if (!entry) {
      report.originalesFaltantes++;
      report.errores.push(
        `No se encontraron episodios originales para "${match?.seriesName || seriesName}" (TMDB ${id}).`
      );
      continue;
    }

    report.originalesEncontrados++;

    const validation = validateOriginal(entry, seriesName);

    if (validation.errors.length) {
      report.errores.push(...validation.errors);
      continue;
    }

    if (catalog[id]) {
      report.seriesExistentesOmitidas++;
      report.omitidas.push({
        id,
        nombre: seriesName,
        motivo: "El ID TMDB ya existe en el catálogo",
      });
      continue;
    }

    const result = buildSeries(match, {
      ...entry,
      episodes: validation.episodes,
    });

    planned.push(result);
  }

  report.seriesNuevas = planned.length;
  report.episodiosNuevos = planned.reduce(
    (total, item) => total + item.episodeCount,
    0
  );
  report.fuentesNuevas = planned.reduce(
    (total, item) => total + item.sourceCount,
    0
  );
  report.urlsDuplicadasOmitidas = planned.reduce(
    (total, item) => total + item.duplicateUrls,
    0
  );

  report.nuevas = planned.slice(0, 15).map(item => ({
    id: item.id,
    nombre: item.series.name,
    temporadas: Object.keys(item.series.seasons).length,
    episodios: item.episodeCount,
    fuentes: item.sourceCount,
  }));

  console.log("\n======================================");
  console.log(" IMPORTADOR DE SERIES — LISTA 6");
  console.log("======================================\n");
  console.log(JSON.stringify(report, null, 2));

  if (report.errores.length > 0) {
    console.error(
      "\nSe detectaron errores de validación. No se modificó el catálogo."
    );
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("\nSIMULACIÓN: no se modificó ningún archivo.");
    console.log(
      "Revisá los totales. Para importar, ejecutá el mismo script con --apply."
    );
    return;
  }

  // Protección ante cambios en el catálogo mientras se revisaba el plan.
  const currentCatalogText = fs.readFileSync(CATALOG_FILE, "utf8");
  const initialCatalogText = JSON.stringify(catalog, null, 2) + "\n";

  // Se compara el contenido JSON normalizado para evitar sobrescribir
  // modificaciones concurrentes realizadas después de la lectura inicial.
  const currentCatalog = JSON.parse(currentCatalogText);

  for (const item of planned) {
    if (currentCatalog[item.id]) {
      console.error(
        `El ID ${item.id} (${item.series.name}) apareció en el catálogo durante la ejecución. Abortando sin escribir.`
      );
      process.exitCode = 1;
      return;
    }
  }

  // Verifica que el archivo no haya cambiado desde la lectura inicial.
  const initialParsedText = JSON.stringify(catalog, null, 2) + "\n";
  if (initialCatalogText !== initialParsedText) {
    console.error("El catálogo cambió durante la ejecución. Se abortó la importación.");
    process.exitCode = 1;
    return;
  }

  for (const item of planned) {
    currentCatalog[item.id] = item.series;
  }

  const backupFile = `${CATALOG_FILE}.backup-lista-6-nuevas-${Date.now()}`;
  const tempFile = `${CATALOG_FILE}.tmp-${process.pid}`;

  fs.copyFileSync(CATALOG_FILE, backupFile);

  try {
    fs.writeFileSync(
      tempFile,
      JSON.stringify(currentCatalog, null, 2) + "\n",
      "utf8"
    );
    fs.renameSync(tempFile, CATALOG_FILE);
  } catch (error) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    throw error;
  }

  console.log("\nImportación terminada correctamente.");
  console.log(`Series agregadas: ${planned.length}`);
  console.log(`Episodios agregados: ${report.episodiosNuevos}`);
  console.log(`Fuentes agregadas: ${report.fuentesNuevas}`);
  console.log(`Copia de seguridad: ${backupFile}`);
  console.log(`Catálogo actualizado: ${CATALOG_FILE}`);
}

main();
