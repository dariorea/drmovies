import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const CATALOG_FILE = path.join(DATA_DIR, "series-streams-combined.json");
const MATCHES_FILE = path.join(DATA_DIR, "series-lista-6-clean-matches-reviewed.json");
const UNMATCHED_FILE = path.join(DATA_DIR, "unmatched-series-lista-6.json");

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

function records(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  throw new Error("Formato JSON inesperado.");
}

function originalName(item) {
  return item?.seriesName || item?.normalizedSeriesName || item?.name || "";
}

function tmdbId(match) {
  const value = match?.bestMatch?.tmdbId ?? match?.bestMatch?.id ?? match?.tmdbId;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}

function urlsFromEpisode(episode) {
  const urls = new Set();

  if (typeof episode?.streamUrl === "string" && episode.streamUrl) {
    urls.add(episode.streamUrl);
  }

  for (const source of Array.isArray(episode?.sources) ? episode.sources : []) {
    const url = typeof source === "string"
      ? source
      : source?.url || source?.streamUrl || source?.stream_url;

    if (typeof url === "string" && url) urls.add(url);
  }

  return urls;
}

function main() {
  for (const file of [CATALOG_FILE, MATCHES_FILE, UNMATCHED_FILE]) {
    if (!fs.existsSync(file)) throw new Error(`No existe: ${file}`);
  }

  // La lectura y el parseo no modifican los archivos.
  const catalogText = fs.readFileSync(CATALOG_FILE, "utf8");
  const catalog = JSON.parse(catalogText);
  const matches = records(readJson(MATCHES_FILE));
  const unmatched = records(readJson(UNMATCHED_FILE));

  const originalByName = new Map();
  for (const entry of unmatched) {
    const key = normalizeName(originalName(entry));
    if (key && !originalByName.has(key)) originalByName.set(key, entry);
  }

  const expected = new Map();
  for (const match of matches) {
    if (match?.decision !== "MATCH_FUERTE") continue;
    const id = tmdbId(match);
    if (!id || expected.has(id)) continue;

    const key = normalizeName(
      match?.seriesName || match?.normalizedSeriesName ||
      match?.bestMatch?.name || ""
    );

    expected.set(id, {
      id,
      name: match?.bestMatch?.name || match?.seriesName || "",
      original: originalByName.get(key),
    });
  }

  const report = {
    archivoJSONValido: true,
    seriesEsperadasNuevas: 0,
    seriesEncontradas: 0,
    seriesFaltantes: [],
    seriesConNombreDiferente: [],
    temporadasRevisadas: 0,
    episodiosRevisados: 0,
    episodiosSinStreamUrl: 0,
    episodiosSinFuentes: 0,
    episodiosSinFuenteLista6: 0,
    fuentesLista6: 0,
    urlsLista6Vacias: 0,
    urlsLista6DiferentesDelOriginal: [],
    episodiosDuplicadosEnCatalogo: [],
    erroresEstructura: [],
    muestras: [],
  };

  for (const [id, item] of expected) {
    // La importación omitió los IDs que ya existían antes.
    // Para distinguirlos, si no hay datos suficientes en el respaldo,
    // auditamos la presencia actual contra el archivo de respaldo.
    const backupPath = `${CATALOG_FILE}.backup-lista-6-nuevas-1791609420536`;
    let existedBefore = false;

    if (fs.existsSync(backupPath)) {
      const backup = readJson(backupPath);
      existedBefore = Boolean(backup[id]);
    }

    if (existedBefore) continue;

    report.seriesEsperadasNuevas++;

    const series = catalog[id];
    if (!series) {
      report.seriesFaltantes.push({ id, nombre: item.name });
      continue;
    }

    report.seriesEncontradas++;

    if (
      normalizeName(series.name) !== normalizeName(item.name)
    ) {
      report.seriesConNombreDiferente.push({
        id,
        esperado: item.name,
        catalogo: series.name,
      });
    }

    if (!series.seasons || typeof series.seasons !== "object") {
      report.erroresEstructura.push({
        id,
        nombre: series.name,
        error: "No tiene objeto seasons",
      });
      continue;
    }

    const originalEpisodes = new Map();
    for (const episode of item.original?.episodes || []) {
      const key = `${Number(episode.season)}:${Number(episode.episode)}`;
      if (!originalEpisodes.has(key)) originalEpisodes.set(key, new Set());
      if (episode.url) originalEpisodes.get(key).add(episode.url);
    }

    const seenEpisodes = new Set();

    for (const [seasonKey, season] of Object.entries(series.seasons)) {
      report.temporadasRevisadas++;

      if (!season || typeof season !== "object" || !season.episodes ||
          typeof season.episodes !== "object") {
        report.erroresEstructura.push({
          id,
          temporada: seasonKey,
          error: "Temporada sin objeto episodes",
        });
        continue;
      }

      for (const [episodeKey, episode] of Object.entries(season.episodes)) {
        report.episodiosRevisados++;

        const compoundKey = `${Number(seasonKey)}:${Number(episodeKey)}`;

        if (seenEpisodes.has(compoundKey)) {
          report.episodiosDuplicadosEnCatalogo.push({
            id,
            episodio: compoundKey,
          });
        }
        seenEpisodes.add(compoundKey);

        if (!episode || typeof episode !== "object") {
          report.erroresEstructura.push({
            id,
            episodio: compoundKey,
            error: "Episodio inválido",
          });
          continue;
        }

        if (typeof episode.streamUrl !== "string" || !episode.streamUrl) {
          report.episodiosSinStreamUrl++;
        }

        const sources = Array.isArray(episode.sources) ? episode.sources : [];
        if (sources.length === 0) report.episodiosSinFuentes++;

        const list6Sources = sources.filter(source =>
          source && typeof source === "object" && source.source === SOURCE
        );

        if (list6Sources.length === 0) {
          report.episodiosSinFuenteLista6++;
        }

        for (const source of list6Sources) {
          report.fuentesLista6++;

          if (typeof source.url !== "string" || !source.url) {
            report.urlsLista6Vacias++;
            continue;
          }

          const expectedUrls = originalEpisodes.get(compoundKey);
          if (expectedUrls && !expectedUrls.has(source.url)) {
            report.urlsLista6DiferentesDelOriginal.push({
              id,
              nombre: series.name,
              episodio: compoundKey,
              url: source.url,
            });
          }
        }
      }
    }

    if (report.muestras.length < 10) {
      report.muestras.push({
        id,
        nombre: series.name,
        temporadas: Object.keys(series.seasons).length,
        episodios: Object.values(series.seasons).reduce(
          (sum, season) => sum + Object.keys(season.episodes || {}).length,
          0
        ),
      });
    }
  }

  console.log("\n======================================");
  console.log(" AUDITORÍA LISTA 6 — SOLO LECTURA");
  console.log("======================================\n");
  console.log(JSON.stringify(report, null, 2));
  console.log("\nAuditoría terminada. No se modificó ningún archivo.");
}

main();
