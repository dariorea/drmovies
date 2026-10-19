
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import axios from "axios";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const listNumber = Number(process.argv[2] || 1);

if (!Number.isInteger(listNumber) || listNumber < 1) {
  console.error("Uso: node scripts/parse-series-m3u-structure.js NUMERO_LISTA");
  process.exit(1);
}

const outputFile = path.join(
  DATA_DIR,
  `series-m3u-structural-lista-${listNumber}.json`
);

const reportFile = path.join(
  DATA_DIR,
  `series-m3u-structural-lista-${listNumber}-report.json`
);

const m3uUrl =
  process.env[`IPTV_M3U_URL_${listNumber}`] ||
  process.env.IPTV_M3U_URL;

const user = process.env[`IPTV_USER_${listNumber}`] || "";
const password = process.env[`IPTV_PASSWORD_${listNumber}`] || "";

if (!m3uUrl) {
  console.error(
    `Falta IPTV_M3U_URL_${listNumber} o IPTV_M3U_URL en el archivo .env`
  );
  process.exit(1);
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function getAttribute(line, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `(?:^|\\s)${escaped}="([^"]*)"`,
    "i"
  );

  return decodeEntities(line.match(regex)?.[1] || "").trim();
}

function getDisplayName(line) {
  const comma = line.indexOf(",");

  if (comma === -1) {
    return "";
  }

  return decodeEntities(line.slice(comma + 1).trim());
}

function normalizeTitle(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Reconoce formatos como:
 * S01 E01
 * S01E01
 * S1E1
 * 1x01
 * Temporada 1 Episodio 1
 * Temporada 1 Capítulo 1
 */
function parseEpisode(name) {
  const value = String(name || "").trim();

  const patterns = [
    /^(.*?)\s+S(\d{1,3})\s*[-._ ]?\s*E(\d{1,4})\b/i,
    /^(.*?)\s+(\d{1,3})x(\d{1,4})\b/i,
    /^(.*?)\s+Temporada\s+(\d{1,3})\s+(?:Episodio|Cap[ií]tulo|Ep\.?)\s*(\d{1,4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (!match) continue;

    const title = match[1]
      .replace(/[\s\-–—:|]+$/, "")
      .trim();

    const season = Number(match[2]);
    const episode = Number(match[3]);

    if (!title || !Number.isInteger(season) || !Number.isInteger(episode)) {
      continue;
    }

    if (season < 0 || episode < 0) {
      continue;
    }

    return {
      title,
      season,
      episode,
    };
  }

  return null;
}

/**
 * Sustituye las credenciales en URLs con rutas IPTV:
 * /series/USUARIO/CONTRASENA/archivo.mkv
 *
 * También elimina credenciales que estén en la autoridad de una URL.
 * El resultado es para almacenamiento seguro, no necesariamente una
 * URL reproducible hasta restaurar las credenciales en el backend.
 */
function sanitizeStreamUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl.trim());

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        url: "",
        ok: false,
        reason: "PROTOCOLO_NO_PERMITIDO",
      };
    }

    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
    }

    const segments = parsed.pathname.split("/");
    const seriesIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "series"
    );

    if (seriesIndex >= 0 && segments.length > seriesIndex + 2) {
      segments[seriesIndex + 1] = "%7Buser%7D";
      segments[seriesIndex + 2] = "%7Bpassword%7D";
      parsed.pathname = segments.join("/");
    }

    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(username|user|password|pass|token|api_key)$/i.test(key)) {
        parsed.searchParams.set(
          key,
          `%7B${key.toLowerCase()}%7D`
        );
      }
    }

    return {
      url: parsed.toString(),
      ok: true,
      reason: null,
    };
  } catch {
    return {
      url: "",
      ok: false,
      reason: "URL_INVALIDA",
    };
  }
}

function getPosterPath(posterUrl) {
  if (!posterUrl) return null;

  try {
    const parsed = new URL(posterUrl);
    const match = parsed.pathname.match(
      /\/(w\d+|original)\/(.+)$/i
    );

    if (match && /image\.tmdb\.org$/i.test(parsed.hostname)) {
      return `/${match[2]}`;
    }
  } catch {
    // Puede haber un logo no válido o una URL de otra plataforma.
  }

  return null;
}

function createSeries(title) {
  return {
    name: title,
    normalizedName: normalizeTitle(title),
    poster: null,
    posterPath: null,
    group: null,
    seasons: {},
    stats: {
      episodes: 0,
      seasons: 0,
    },
  };
}

function getEpisodeKey(season, episode) {
  return `${season}:${episode}`;
}

function addEpisode(series, parsedEpisode, entry, sourceName) {
  const seasonKey = String(parsedEpisode.season);
  const episodeKey = String(parsedEpisode.episode);

  if (!series.seasons[seasonKey]) {
    series.seasons[seasonKey] = {
      season: parsedEpisode.season,
      episodes: {},
    };
  }

  const season = series.seasons[seasonKey];
  let episode = season.episodes[episodeKey];

  if (!episode) {
    episode = {
      episode: parsedEpisode.episode,
      name: entry.name,
      streamUrl: entry.url,
      poster: entry.poster || null,
      posterPath: getPosterPath(entry.poster),
      sources: [],
    };

    season.episodes[episodeKey] = episode;
    series.stats.episodes++;
  }

  if (!episode.poster && entry.poster) {
    episode.poster = entry.poster;
    episode.posterPath = getPosterPath(entry.poster);
  }

  // Conservamos cada URL única como una fuente.
  const exists = episode.sources.some(
    (source) => source.url === entry.url
  );

  if (!exists) {
    episode.sources.push({
      source: sourceName,
      url: entry.url,
    });
  }

  // Si el episodio tiene otra URL, no reemplazamos la principal.
  return exists ? "DUPLICADO" : "AGREGADO";
}

function parseM3U(content, sourceName) {
  const lines = content.split(/\r?\n/);
  const seriesMap = new Map();
  const rejected = [];

  let currentEntry = null;
  let totalEntries = 0;
  let acceptedEntries = 0;
  let duplicateEntries = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();

    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const tvgName = getAttribute(line, "tvg-name");
      const displayName = getDisplayName(line);

      currentEntry = {
        name: tvgName || displayName,
        poster: getAttribute(line, "tvg-logo") || null,
        group: getAttribute(line, "group-title") || null,
        line: index + 1,
      };

      continue;
    }

    // Ignorar comentarios y directivas que no sean URL.
    if (line.startsWith("#")) continue;

    if (!currentEntry) continue;

    totalEntries++;

    const originalName = currentEntry.name || "";
    const parsedEpisode = parseEpisode(originalName);

    if (!parsedEpisode) {
      rejected.push({
        line: currentEntry.line,
        name: originalName,
        reason: "NO_SE_PUDO_DETECTAR_TEMPORADA_Y_EPISODIO",
      });

      currentEntry = null;
      continue;
    }

    const sanitized = sanitizeStreamUrl(line);

    if (!sanitized.ok) {
      rejected.push({
        line: currentEntry.line,
        name: originalName,
        reason: sanitized.reason,
      });

      currentEntry = null;
      continue;
    }

    const titleKey = normalizeTitle(parsedEpisode.title);

    if (!titleKey) {
      rejected.push({
        line: currentEntry.line,
        name: originalName,
        reason: "TITULO_VACIO",
      });

      currentEntry = null;
      continue;
    }

    let series = seriesMap.get(titleKey);

    if (!series) {
      series = createSeries(parsedEpisode.title);
      seriesMap.set(titleKey, series);
    }

    if (!series.poster && currentEntry.poster) {
      series.poster = currentEntry.poster;
      series.posterPath = getPosterPath(currentEntry.poster);
    }

    if (!series.group && currentEntry.group) {
      series.group = currentEntry.group;
    }

    const result = addEpisode(
      series,
      parsedEpisode,
      {
        name: originalName,
        url: sanitized.url,
        poster: currentEntry.poster,
      },
      sourceName
    );

    if (result === "DUPLICADO") {
      duplicateEntries++;
    } else {
      acceptedEntries++;
    }

    currentEntry = null;
  }

  // Calcular temporadas y ordenar episodios numéricamente.
  for (const series of seriesMap.values()) {
    const sortedSeasons = {};

    for (const seasonKey of Object.keys(series.seasons).sort(
      (a, b) => Number(a) - Number(b)
    )) {
      const season = series.seasons[seasonKey];
      const sortedEpisodes = {};

      for (const episodeKey of Object.keys(season.episodes).sort(
        (a, b) => Number(a) - Number(b)
      )) {
        sortedEpisodes[episodeKey] = season.episodes[episodeKey];
      }

      season.episodes = sortedEpisodes;
      sortedSeasons[seasonKey] = season;
    }

    series.seasons = sortedSeasons;
    series.stats.seasons = Object.keys(sortedSeasons).length;
  }

  return {
    series: Object.fromEntries(
      [...seriesMap.entries()].sort((a, b) =>
        a[1].name.localeCompare(b[1].name, "es")
      )
    ),
    report: {
      source: sourceName,
      totalEntries,
      acceptedEntries,
      duplicateEntries,
      seriesCount: seriesMap.size,
      rejectedEntries: rejected.length,
      rejected,
    },
  };
}

async function downloadM3U() {
  const response = await axios.get(m3uUrl, {
    timeout: 120000,
    responseType: "text",
    maxContentLength: 1024 * 1024 * 1024,
    headers: {
      "User-Agent": "DRMovies-SeriesParser/1.0",
    },
    ...(user || password
      ? {
          auth: {
            username: user,
            password,
          },
        }
      : {}),
  });

  if (typeof response.data !== "string") {
    throw new Error("La respuesta de la lista no es texto M3U.");
  }

  if (!response.data.includes("#EXTINF:")) {
    throw new Error(
      "La respuesta no parece una lista M3U válida: no se encontró #EXTINF."
    );
  }

  return response.data;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  console.log("");
  console.log("======================================");
  console.log(" PARSER M3U — ESTRUCTURA DE SERIES");
  console.log("======================================");
  console.log(`Lista: ${listNumber}`);
  console.log("Descargando lista M3U...");

  const content = await downloadM3U();

  console.log(`Lista descargada: ${content.length.toLocaleString()} caracteres.`);
  console.log("Analizando series y episodios...");

  const result = parseM3U(content, `lista-${listNumber}`);

  if (result.report.totalEntries === 0) {
    throw new Error(
      "No se encontraron entradas M3U para procesar. No se guardó un catálogo vacío."
    );
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: `lista-${listNumber}`,
    seriesCount: result.report.seriesCount,
    series: result.series,
  };

  await fs.writeFile(
    outputFile,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  await fs.writeFile(
    reportFile,
    JSON.stringify(result.report, null, 2),
    "utf8"
  );

  console.log("");
  console.log("======================================");
  console.log(" PROCESO FINALIZADO");
  console.log("======================================");
  console.log(`Series: ${result.report.seriesCount}`);
  console.log(`Entradas M3U: ${result.report.totalEntries}`);
  console.log(`Episodios agregados: ${result.report.acceptedEntries}`);
  console.log(`Entradas duplicadas: ${result.report.duplicateEntries}`);
  console.log(`Entradas rechazadas: ${result.report.rejectedEntries}`);
  console.log("");
  console.log(`Catálogo: ${outputFile}`);
  console.log(`Informe:  ${reportFile}`);
  console.log("");
  console.log("El catálogo combinado existente no fue modificado.");
}

main().catch((error) => {
  console.error("");
  console.error("ERROR AL PROCESAR LA LISTA:");
  console.error(error.message || error);
  process.exitCode = 1;
});
