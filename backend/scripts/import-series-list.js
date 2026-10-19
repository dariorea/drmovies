import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const CATALOG_FILE = path.join(DATA_DIR, "series-streams-combined.json");
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

const LIST_NUMBER = Number(process.argv[2]);
const APPLY = process.argv.includes("--apply");
const REQUEST_DELAY = Math.max(0, Number(process.env.TMDB_REQUEST_DELAY_MS || 250));
const MAX_CANDIDATES = Math.max(5, Number(process.env.SERIES_IMPORT_MAX_CANDIDATES || 25));
const MAX_SEARCH_RESULTS = Math.max(MAX_CANDIDATES, Number(process.env.SERIES_IMPORT_MAX_SEARCH_RESULTS || 80));
const MIN_CONFIDENCE_GAP = Math.max(0, Number(process.env.SERIES_IMPORT_MIN_MARGIN || 12));
const SOURCE_NAME = `lista-${LIST_NUMBER}`;

const REPORT_TXT = path.join(DATA_DIR, `series-import-report-lista-${LIST_NUMBER}.txt`);
const REPORT_JSON = path.join(DATA_DIR, `series-import-report-lista-${LIST_NUMBER}.json`);
const UNMATCHED_FILE = path.join(DATA_DIR, `unmatched-series-lista-${LIST_NUMBER}.json`);

const RUN_MODE = APPLY ? "apply" : "analysis";

const CHECKPOINT_FILE = path.join(
  DATA_DIR,
  `series-streams-combined.import-checkpoint-lista-${LIST_NUMBER}-${RUN_MODE}.json`
);

const BACKUP_FILE = path.join(
  DATA_DIR,
  `series-streams-combined.import-backup-lista-${LIST_NUMBER}.json`
);

const CACHE_FILE = path.join(
  DATA_DIR,
  `series-import-cache-lista-${LIST_NUMBER}.json`
);

const TMDB_API_KEY =
  process.env.TMDB_API_KEY ||
  process.env.VITE_TMDB_API_KEY ||
  "";

const TMDB_TOKEN =
  process.env.TMDB_ACCESS_TOKEN ||
  process.env.TMDB_BEARER_TOKEN ||
  "";

const SEARCH_LANGUAGES = [
  "es-ES",
  "es-MX",
  "es-AR",
  "en-US",
  "ko-KR",
  "ja-JP",
  "zh-CN",
  "pt-BR",
  "fr-FR",
  "de-DE"
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const cache = {
  requests: {},
  posterHashes: {}
};

let sharpModule = null;

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function similarity(a, b) {
  const left = Array.from(normalize(a));
  const right = Array.from(normalize(b));

  if (!left.length || !right.length) return 0;
  if (left.join("") === right.join("")) return 1;

  let previous = Array.from(
    { length: right.length + 1 },
    (_, i) => i
  );

  for (let i = 1; i <= left.length; i++) {
    const current = [i];

    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] +
          (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }

    previous = current;
  }

  return 1 -
    previous[right.length] /
    Math.max(left.length, right.length);
}

function getAttribute(extinf, attribute) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const match = extinf.match(
    new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`, "i")
  );

  return match?.[1]?.trim() || "";
}

/*
 * Solo reconoce formatos explícitos de episodios.
 * No interpreta números sueltos como temporadas o episodios.
 */
function parseEpisodeName(name) {
  const value = String(name || "").trim();

  const patterns = [
    /^(.*?)\s+S(\d{1,3})\s*E(?:P)?\s*(\d{1,4})(?=$|[\s._-])/i,
    /^(.*?)\s+(\d{1,3})x(\d{1,4})(?=$|[\s._-])/i,
    /^(.*?)\s+Temporada\s*(\d{1,3})\s*(?:Cap[ií]tulo|Episodio|Episódio)\s*(\d{1,4})(?=$|[\s._-])/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (!match || !match[1]?.trim()) continue;

    const seriesName = match[1]
      .trim()
      .replace(/[|:–—-]+$/, "")
      .trim();

    const season = Number(match[2]);
    const episode = Number(match[3]);

    if (
      seriesName.length < 2 ||
      !Number.isInteger(season) ||
      !Number.isInteger(episode) ||
      season < 1 ||
      episode < 1
    ) {
      continue;
    }

    return {
      seriesName,
      season,
      episode
    };
  }

  return null;
}

function posterFilename(value) {
  if (!value) return "";

  try {
    const pathname = /^https?:\/\//i.test(value)
      ? new URL(value).pathname
      : value.split("?")[0].split("#")[0];

    return path.posix.basename(pathname).toLowerCase();
  } catch {
    return "";
  }
}

function buildM3UUrl(listNumber) {
  const direct =
    process.env[`IPTV_M3U_URL_${listNumber}`] ||
    process.env[`IPTV_URL_${listNumber}`];

  const username = process.env[`IPTV_USER_${listNumber}`];
  const password = process.env[`IPTV_PASSWORD_${listNumber}`];

  if (!direct) {
    throw new Error(
      `Falta IPTV_M3U_URL_${listNumber} o IPTV_URL_${listNumber} en .env.`
    );
  }

  const url = direct
    .replaceAll("{username}", username || "")
    .replaceAll("{password}", password || "");

  const parsed = new URL(url);

  if (username && password) {
    if (!parsed.searchParams.has("username")) {
      parsed.searchParams.set("username", username);
    }

    if (!parsed.searchParams.has("password")) {
      parsed.searchParams.set("password", password);
    }

    if (!parsed.searchParams.has("type")) {
      parsed.searchParams.set("type", "m3u_plus");
    }

    if (!parsed.searchParams.has("output")) {
      parsed.searchParams.set("output", "m3u8");
    }
  }

  return parsed.toString();
}

async function readJSON(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== null) {
      return fallback;
    }

    throw error;
  }
}

async function writeJSONAtomic(file, data) {
  const temporary = `${file}.tmp`;

  await fs.writeFile(
    temporary,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  await fs.rename(temporary, file);
}

async function loadCache() {
  const saved = await readJSON(CACHE_FILE, {});

  // No guardamos miles de resultados de búsqueda en memoria.
  cache.requests = Object.fromEntries(
    Object.entries(saved.requests || {}).filter(
      ([key]) => !key.includes("/search/tv?")
    )
  );

  cache.posterHashes = saved.posterHashes || {};
}

async function saveCache() {
  await writeJSONAtomic(CACHE_FILE, {
    updatedAt: new Date().toISOString(),
    requests: cache.requests,
    posterHashes: cache.posterHashes
  });
}

async function downloadM3U() {
  const url = buildM3UUrl(LIST_NUMBER);

  console.log(`Descargando M3U de ${SOURCE_NAME}...`);

  const response = await axios.get(url, {
    timeout: 180000,
    responseType: "text",
    maxContentLength: 1024 * 1024 * 1024
  });

  if (
    typeof response.data !== "string" ||
    !response.data.includes("#EXTINF")
  ) {
    throw new Error(
      "La respuesta no parece ser una lista M3U válida."
    );
  }

  return response.data;
}

/*
 * No descartamos categorías genéricas como "Series" o "VOD".
 * Solo bloqueamos categorías claramente identificadas como canales en vivo.
 */
function isClearlyLiveGroup(groupTitle = "") {
  return /\b(live tv|tv en vivo|canales en vivo|live channels|radio en vivo|radio stations)\b/i
    .test(String(groupTitle));
}

function parseM3U(content) {
  const lines = content.split(/\r?\n/);
  const episodes = [];
  let extinf = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      extinf = line;
      continue;
    }

    if (line.startsWith("#")) continue;
    if (!extinf) continue;

    const currentExtinf = extinf;
    extinf = null;

    // Excluir rutas inequívocas de películas y televisión en vivo.
    if (/\/movie\//i.test(line) || /\/live\//i.test(line)) {
      continue;
    }

    const groupTitle = getAttribute(
      currentExtinf,
      "group-title"
    );

    if (isClearlyLiveGroup(groupTitle)) continue;

    const comma = currentExtinf.indexOf(",");

    const displayName = comma >= 0
      ? currentExtinf.slice(comma + 1).trim()
      : "";

    const tvgName = getAttribute(currentExtinf, "tvg-name");

    // Algunos proveedores ponen el episodio en tvg-name y otros
    // solamente en el nombre visible después de la coma.
    const possibleNames = [
      ...new Set([tvgName, displayName].filter(Boolean))
    ];

    let parsed = null;
    let selectedName = "";

    for (const candidateName of possibleNames) {
      const result = parseEpisodeName(candidateName);

      if (result) {
        parsed = result;
        selectedName = candidateName;
        break;
      }
    }

    // Sin temporada y episodio explícitos, no se procesa.
    if (!parsed) continue;

    episodes.push({
      ...parsed,
      name: selectedName,
      url: line,
      tvgId: getAttribute(currentExtinf, "tvg-id"),
      tvgLogo: getAttribute(currentExtinf, "tvg-logo"),
      groupTitle,
      urlIdentifiesSeries: /\/series\//i.test(line)
    });
  }

  return episodes;
}

function groupEpisodes(episodes) {
  const groups = new Map();

  for (const episode of episodes) {
    const key = normalize(episode.seriesName);

    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: episode.seriesName,
        episodes: [],
        posters: new Map()
      });
    }

    const group = groups.get(key);
    group.episodes.push(episode);

    const filename = posterFilename(episode.tvgLogo);

    if (filename) {
      const existing = group.posters.get(filename);

      group.posters.set(filename, {
        filename,
        url: episode.tvgLogo,
        occurrences: (existing?.occurrences || 0) + 1
      });
    }
  }

  return [...groups.values()].map(group => {
    const structure = {};

    for (const episode of group.episodes) {
      structure[episode.season] ??= new Set();
      structure[episode.season].add(episode.episode);
    }

    return {
      ...group,
      structure: Object.fromEntries(
        Object.entries(structure).map(([season, numbers]) => [
          season,
          [...numbers].sort((a, b) => a - b)
        ])
      ),
      totalEpisodes: group.episodes.length
    };
  });
}

async function tmdbRequest(url, params = {}) {
  const headers = {};
  const query = { ...params };

  if (TMDB_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  }

  if (TMDB_API_KEY) {
    query.api_key = TMDB_API_KEY;
  }

  if (!TMDB_TOKEN && !TMDB_API_KEY) {
    throw new Error(
      "Falta TMDB_API_KEY, VITE_TMDB_API_KEY o TMDB_ACCESS_TOKEN en .env."
    );
  }

  const isSearchRequest = url.includes("/search/tv");

  // La clave incluye la URL y los parámetros excepto la API key.
  const cacheParams = { ...query };
  delete cacheParams.api_key;

  const cacheKey = `${url}?${new URLSearchParams(
    Object.entries(cacheParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, String(value)])
  ).toString()}`;

  if (
    !isSearchRequest &&
    Object.hasOwn(cache.requests, cacheKey)
  ) {
    return cache.requests[cacheKey];
  }

  const response = await axios.get(url, {
    params: query,
    headers,
    timeout: 30000
  });

  // No acumular miles de resultados de búsqueda en memoria.
  if (!isSearchRequest) {
    cache.requests[cacheKey] = response.data;
  }

  await sleep(REQUEST_DELAY);

  return response.data;
}

function cleanSearchTitle(name) {
  return String(name || "")
    .replace(/\b(latino|castellano|espanol|español|subtitulado|doblado|dual audio|multi audio|hd|4k|1080p|720p)\b/gi, " ")
    .replace(/[\[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchCandidates(seriesName) {
  const queries = [
    ...new Set([
      seriesName,
      cleanSearchTitle(seriesName)
    ].filter(Boolean))
  ];

  const candidates = new Map();

  for (const query of queries) {
    for (const language of SEARCH_LANGUAGES) {
      const result = await tmdbRequest(
        `${TMDB_BASE}/search/tv`,
        {
          query,
          language,
          include_adult: false
        }
      ).catch(error => {
        console.warn(
          `Búsqueda fallida (${language}): ${error.message}`
        );

        return null;
      });

      for (const [rank, item] of (result?.results || []).entries()) {
        if (!item.id) continue;

        const current = candidates.get(item.id) || {
          ...item,
          id: item.id,
          searchLanguages: [],
          searchRanks: [],
          searchQueries: []
        };

        current.searchLanguages = [
          ...new Set([
            ...current.searchLanguages,
            language
          ])
        ];

        current.searchRanks.push(rank + 1);
        current.searchQueries.push(query);

        candidates.set(item.id, {
          ...current,
          ...item,
          id: item.id,
          searchLanguages: current.searchLanguages,
          searchRanks: current.searchRanks,
          searchQueries: current.searchQueries
        });
      }
    }
  }

  return [...candidates.values()]
    .map(candidate => {
      const sim = Math.max(
        similarity(seriesName, candidate.name || ""),
        similarity(seriesName, candidate.original_name || "")
      );

      const exactSearchTitle =
        normalize(seriesName) === normalize(candidate.name || "") ||
        normalize(seriesName) === normalize(candidate.original_name || "");

      const rank = Math.min(
        ...candidate.searchRanks,
        1000
      );

      const retrievalScore =
        (exactSearchTitle ? 100 : 0) +
        sim * 50 +
        Math.max(0, 20 - rank) +
        Math.log10(1 + Number(candidate.popularity || 0));

      return {
        ...candidate,
        titleSimilarity: sim,
        retrievalScore
      };
    })
    .sort((a, b) => b.retrievalScore - a.retrievalScore)
    .slice(0, MAX_SEARCH_RESULTS);
}
async function getCandidateDetails(candidate) {
    const details = await tmdbRequest(
      `${TMDB_BASE}/tv/${candidate.id}`,
      { language: "es-ES" }
    );
  
    const optional = await Promise.allSettled([
      tmdbRequest(`${TMDB_BASE}/tv/${candidate.id}/images`),
      tmdbRequest(`${TMDB_BASE}/tv/${candidate.id}/alternative_titles`)
    ]);
  
    const images = optional[0].status === "fulfilled"
      ? optional[0].value
      : { posters: [] };
  
    const alt = optional[1].status === "fulfilled"
      ? optional[1].value
      : { results: [], titles: [] };
  
    const alternativeTitles = [
      ...new Set([
        ...(alt.results || []).map(item => item.title || item.name || ""),
        ...(alt.titles || []).map(item => item.title || item.name || ""),
        ...(details.also_known_as || [])
      ].filter(Boolean))
    ];
  
    const posters = [
      ...new Set([
        details.poster_path,
        ...(images.posters || []).map(item => item.file_path)
      ].filter(Boolean))
    ];
  
    return {
      ...details,
      alternativeTitles,
      posterPaths: posters,
      posterLookupFailed: optional[0].status === "rejected",
      aliasesLookupFailed: optional[1].status === "rejected",
      searchLanguages: candidate.searchLanguages || [],
      searchRanks: candidate.searchRanks || [],
      searchQueries: candidate.searchQueries || [],
      searchTitleSimilarity: candidate.titleSimilarity || 0
    };
  }
  
  async function getSeasonDetails(tmdbId, seasonNumber) {
    return tmdbRequest(
      `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}`,
      { language: "es-ES" }
    );
  }
  
  async function loadSharp() {
    if (sharpModule !== null) return sharpModule;
  
    try {
      const mod = await import("sharp");
      sharpModule = mod.default || mod;
    } catch {
      sharpModule = false;
    }
  
    return sharpModule;
  }
  
  async function imageDHash(url) {
    if (!url) return null;
  
    if (Object.hasOwn(cache.posterHashes, url)) {
      return cache.posterHashes[url];
    }
  
    const sharp = await loadSharp();
    if (!sharp) return null;
  
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 12000,
        maxContentLength: 8 * 1024 * 1024,
        maxBodyLength: 8 * 1024 * 1024
      });
  
      const { data, info } = await sharp(Buffer.from(response.data))
        .greyscale()
        .resize(9, 8, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true });
  
      if (info.width !== 9 || info.height !== 8 || data.length < 72) {
        return null;
      }
  
      let bits = "";
  
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          bits += data[y * 9 + x] > data[y * 9 + x + 1]
            ? "1"
            : "0";
        }
      }
  
      cache.posterHashes[url] = bits;
      return bits;
    } catch {
      cache.posterHashes[url] = null;
      return null;
    }
  }
  
  function hashSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return null;
  
    let same = 0;
  
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) same++;
    }
  
    return same / a.length;
  }
  
  function imageUrl(value, isTmdbPath = false) {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
  
    return isTmdbPath
      ? `${TMDB_IMAGE_BASE}${value}`
      : null;
  }
  
  async function comparePosters(group, candidate) {
    const listPosters = [...group.posters.values()];
  
    if (!listPosters.length) {
      return {
        status: "UNKNOWN_NO_LIST_POSTER",
        matched: false,
        bestSimilarity: null,
        comparisons: 0
      };
    }
  
    if (!candidate.posterPaths?.length) {
      return {
        status: candidate.posterLookupFailed
          ? "UNKNOWN_TMDB_IMAGES_FAILED"
          : "UNKNOWN_NO_TMDB_POSTER",
        matched: false,
        bestSimilarity: null,
        comparisons: 0
      };
    }
  
    for (const listPoster of listPosters) {
      for (const tmdbPath of candidate.posterPaths) {
        if (
          listPoster.filename &&
          listPoster.filename === posterFilename(tmdbPath)
        ) {
          return {
            status: "MATCH_FILENAME",
            matched: true,
            bestSimilarity: 1,
            comparisons: 1,
            listPoster: listPoster.filename,
            tmdbPoster: tmdbPath
          };
        }
      }
    }
  
    let best = 0;
    let comparisons = 0;
  
    for (const listPoster of listPosters.slice(0, 3)) {
      const listUrl = imageUrl(listPoster.url);
      if (!listUrl) continue;
  
      const listHash = await imageDHash(listUrl);
      if (!listHash) continue;
  
      for (const tmdbPath of candidate.posterPaths.slice(0, 5)) {
        const tmdbHash = await imageDHash(
          imageUrl(tmdbPath, true)
        );
  
        const score = hashSimilarity(listHash, tmdbHash);
  
        if (score !== null) {
          comparisons++;
          best = Math.max(best, score);
        }
      }
    }
  
    if (best >= 0.90) {
      return {
        status: "MATCH_PERCEPTUAL",
        matched: true,
        bestSimilarity: best,
        comparisons
      };
    }
  
    if (comparisons > 0) {
      return {
        status: "IMAGES_DIFFER",
        matched: false,
        bestSimilarity: best,
        comparisons,
        note: "Las imágenes difieren; pueden existir pósteres regionales distintos."
      };
    }
  
    return {
      status: "UNKNOWN_COMPARISON_UNAVAILABLE",
      matched: false,
      bestSimilarity: null,
      comparisons: 0,
      note: "No se pudo comparar el contenido de las imágenes."
    };
  }
  
  function scoreCandidate(group, candidate, poster, structure) {
    const evidence = [];
    const contradictions = [];
    let score = 0;
  
    const titles = [
      ...new Set([
        candidate.name,
        candidate.original_name,
        ...(candidate.alternativeTitles || []),
        ...(candidate.also_known_as || [])
      ].filter(Boolean))
    ];
  
    const exactTitle = titles.some(
      title => normalize(title) === normalize(group.name)
    );
  
    const bestTitle = titles
      .map(title => ({
        title,
        similarity: similarity(group.name, title)
      }))
      .sort((a, b) => b.similarity - a.similarity)[0];
  
    const bestSimilarity = bestTitle?.similarity || 0;
  
    if (exactTitle) {
      score += 45;
      evidence.push(
        `Título exacto: ${bestTitle?.title || candidate.name}`
      );
    } else if (bestSimilarity >= 0.88) {
      score += 30;
      evidence.push(
        `Título muy similar (${Math.round(bestSimilarity * 100)}%): ${bestTitle.title}`
      );
    } else if (bestSimilarity >= 0.72) {
      score += 15;
      evidence.push(
        `Título parcialmente similar (${Math.round(bestSimilarity * 100)}%): ${bestTitle.title}`
      );
    } else {
      contradictions.push(
        "No se encontró título principal/alternativo suficientemente parecido"
      );
    }
  
    if (poster.matched) {
      score += 30;
  
      evidence.push(
        `Póster coincide (${poster.status}${poster.bestSimilarity !== null
          ? `, ${Math.round(poster.bestSimilarity * 100)}%`
          : ""})`
      );
    } else if (poster.status.startsWith("UNKNOWN")) {
      evidence.push(
        `Póster sin verificación concluyente: ${poster.status}`
      );
    } else {
      evidence.push(
        `Póster no coincidente: ${poster.status}; no se considera contradicción definitiva`
      );
    }
  
    score += structure.score;
    evidence.push(...structure.evidence);
    contradictions.push(...structure.contradictions);
  
    const countries = candidate.origin_country || [];
  
    if (countries.length) {
      evidence.push(
        `País(es) de origen TMDB: ${countries.join(", ")}`
      );
    }
  
    if (candidate.first_air_date) {
      evidence.push(
        `Primera emisión TMDB: ${candidate.first_air_date}`
      );
    }
  
    if (candidate.searchLanguages?.length) {
      evidence.push(
        `Encontrado en búsquedas: ${[...new Set(candidate.searchLanguages)].join(", ")}`
      );
    }
  
    if (candidate.aliasesLookupFailed) {
      evidence.push(
        "No se pudieron consultar los títulos alternativos; resultado incompleto"
      );
    }
  
    return {
      tmdbId: candidate.id,
      name: candidate.name,
      originalName: candidate.original_name,
      posterPath: candidate.poster_path,
      firstAirDate: candidate.first_air_date,
      originCountry: countries,
      score,
      evidence,
      contradictions,
      exactTitle,
      bestTitle: bestTitle?.title || null,
      bestSimilarity,
      poster,
      structure,
      searchLanguages: candidate.searchLanguages || []
    };
  }
  
  async function compareStructure(group, candidate) {
    const seasons = Object.entries(group.structure)
      .map(([season, episodes]) => ({
        season: Number(season),
        episodes
      }))
      .filter(item => item.season >= 0);
  
    const result = {
      status: "UNKNOWN",
      score: 0,
      evidence: [],
      contradictions: [],
      checkedSeasons: [],
      matchedEpisodes: 0,
      checkedEpisodes: 0
    };
  
    if (!seasons.length) {
      result.evidence.push(
        "La lista no contiene temporadas/episodios analizables"
      );
  
      return result;
    }
  
    let validSeasonCount = 0;
    let mismatchCount = 0;
    let checked = 0;
    let matched = 0;
  
    for (const item of seasons) {
      let seasonData;
  
      try {
        seasonData = await getSeasonDetails(
          candidate.id,
          item.season
        );
      } catch (error) {
        result.checkedSeasons.push({
          season: item.season,
          status: "QUERY_FAILED",
          error: error.message
        });
  
        result.evidence.push(
          `No se pudo consultar temporada ${item.season} en TMDB`
        );
  
        continue;
      }
  
      const tmdbEpisodes = new Set(
        (seasonData.episodes || []).map(
          ep => Number(ep.episode_number)
        )
      );
  
      const missing = item.episodes.filter(
        number => !tmdbEpisodes.has(Number(number))
      );
  
      checked += item.episodes.length;
      matched += item.episodes.length - missing.length;
  
      if (missing.length) {
        mismatchCount += missing.length;
  
        result.checkedSeasons.push({
          season: item.season,
          status: "EPISODES_MISSING_IN_TMDB",
          listEpisodes: item.episodes.length,
          tmdbEpisodes: tmdbEpisodes.size,
          missingEpisodes: missing
        });
  
        result.contradictions.push(
          `Temporada ${item.season}: episodios de la lista que no existen en TMDB: ${missing.join(", ")}`
        );
      } else {
        validSeasonCount++;
  
        result.checkedSeasons.push({
          season: item.season,
          status: "COMPATIBLE",
          listEpisodes: item.episodes.length,
          tmdbEpisodes: tmdbEpisodes.size,
          verifiedEpisodes: item.episodes.length
        });
  
        result.evidence.push(
          `Temporada ${item.season}: los ${item.episodes.length} episodios listados existen en TMDB`
        );
      }
    }
  
    result.checkedEpisodes = checked;
    result.matchedEpisodes = matched;
  
    if (checked === 0) {
      result.status = "UNKNOWN";
      result.evidence.push(
        "No se pudo verificar ninguna temporada en TMDB"
      );
  
      return result;
    }
  
    if (mismatchCount === 0 && matched > 0) {
      result.status = "COMPATIBLE";
  
      result.score = Math.min(
        30,
        12 +
          validSeasonCount * 4 +
          Math.min(checked, 20) * 0.4
      );
  
      result.evidence.push(
        `Estructura compatible: ${matched}/${checked} episodios de la lista verificados; la lista puede estar incompleta`
      );
    } else {
      result.status = matched > 0
        ? "PARTIAL_MISMATCH"
        : "MISMATCH";
  
      result.score = matched > 0 ? 2 : 0;
    }
  
    return result;
  }
  
  async function identifySeries(group) {
    const found = await searchCandidates(group.name);
  
    if (!found.length) {
      return {
        seriesName: group.name,
        classification: "NO_MATCH",
        reason: "TMDB no devolvió candidatos para las búsquedas realizadas.",
        totalEpisodes: group.totalEpisodes,
        structure: group.structure,
        posters: [...group.posters.values()],
        candidates: []
      };
    }
  
    const detailCandidates = found.slice(0, MAX_CANDIDATES);
    const evaluated = [];
  
    for (const candidate of detailCandidates) {
      try {
        const details = await getCandidateDetails(candidate);
  
        const [poster, structure] = await Promise.all([
          comparePosters(group, details),
          compareStructure(group, details)
        ]);
  
        evaluated.push({
          details,
          result: scoreCandidate(
            group,
            details,
            poster,
            structure
          )
        });
      } catch (error) {
        evaluated.push({
          details: candidate,
          result: {
            tmdbId: candidate.id,
            name: candidate.name,
            originalName: candidate.original_name,
            score: 0,
            evidence: [],
            contradictions: [
              `No se pudo completar la evaluación: ${error.message}`
            ],
            evaluationFailed: true
          }
        });
      }
  
      await saveCache().catch(() => {});
    }
  
    evaluated.sort((a, b) => b.result.score - a.result.score);
  
    const candidates = evaluated.map(item => item.result);
    const best = candidates[0] || null;
    const second = candidates[1] || null;
  
    const margin = best
      ? best.score - (second?.score ?? 0)
      : 0;
  
    const titleStrong = !!best &&
      (best.exactTitle || best.bestSimilarity >= 0.88);
  
    const structureStrong = !!best &&
      best.structure?.status === "COMPATIBLE" &&
      best.structure.checkedEpisodes > 0;
  
    const posterStrong = !!best && best.poster?.matched;
  
    const hasHardContradictions = !!best &&
      (best.contradictions || []).some(
        item => item.startsWith("Temporada ")
      );
  
    const rivalPlausible = !!second &&
      second.score >= Math.max(45, best.score - MIN_CONFIDENCE_GAP) &&
      (second.exactTitle || second.bestSimilarity >= 0.72) &&
      second.structure?.status !== "MISMATCH";
  
    let classification = "NO_MATCH";
    let reason = "No hay evidencia suficiente para asociar la serie con seguridad.";
  
    if (
      candidates.length &&
      candidates.every(item => item.evaluationFailed)
    ) {
      classification = "NEEDS_REVIEW";
      reason = "Fallaron las consultas necesarias para evaluar los candidatos.";
    } else if (
      best &&
      rivalPlausible &&
      margin < MIN_CONFIDENCE_GAP
    ) {
      classification = "AMBIGUOUS";
      reason = "Hay más de un candidato plausible y la evidencia no permite distinguirlos con seguridad.";
    } else if (
      best &&
      hasHardContradictions &&
      best.structure?.status === "MISMATCH"
    ) {
      classification = "NO_MATCH";
      reason = "La estructura de episodios contradice al candidato principal.";
    } else if (
      best &&
      titleStrong &&
      structureStrong &&
      !rivalPlausible &&
      (posterStrong || best.exactTitle) &&
      !hasHardContradictions &&
      margin >= MIN_CONFIDENCE_GAP
    ) {
      classification = "MATCH_CONFIRMED";
      reason = "Título exacto o muy sólido, estructura de episodios verificada y sin candidato rival comparable.";
    } else if (
      best &&
      best.score >= 35 &&
      (titleStrong || posterStrong || structureStrong)
    ) {
      classification = "MATCH_PROBABLE";
      reason = "Hay señales compatibles, pero falta una prueba independiente o la separación frente a otros candidatos no es suficiente.";
    } else if (best && best.evaluationFailed) {
      classification = "NEEDS_REVIEW";
      reason = "No se pudo completar la evaluación del candidato.";
    }
  
    return {
      seriesName: group.name,
      classification,
      reason,
      confidenceGap: margin,
      totalEpisodes: group.totalEpisodes,
      structure: Object.fromEntries(
        Object.entries(group.structure).map(([season, episodes]) => [
          season,
          episodes.length
        ])
      ),
      posters: [...group.posters.values()],
      bestMatch: best,
      secondMatch: second,
      candidates
    };
  }
  function ensureSeriesShape(series, tmdbId, details) {
    if (!series.seasons || typeof series.seasons !== "object") {
      series.seasons = {};
    }
  
    series.tmdbId ??= Number(tmdbId);
    series.name ??= details.name;
    series.originalName ??= details.original_name || details.name;
    series.posterPath ??= details.poster_path || null;
    series.overview ??= details.overview || "";
    series.firstAirDate ??= details.first_air_date || null;
    series.originCountry ??= details.origin_country || [];
  
    return series;
  }
  
  function decodePathSegment(value = "") {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  
  function isPlaceholder(value, allowed) {
    return allowed.includes(
      String(value || "").trim().toLowerCase()
    );
  }
  
  /*
   * Devuelve true cuando una URL todavía contiene credenciales reales,
   * es inválida o no cumple las reglas de seguridad.
   */
  function hasUnsanitizedCredentials(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return true;
    }
  
    let parsed;
  
    try {
      parsed = new URL(rawUrl);
    } catch {
      return true;
    }
  
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return true;
    }
  
    // No aceptar credenciales dentro del host.
    if (parsed.username || parsed.password) {
      return true;
    }
  
    const segments = parsed.pathname.split("/");
  
    const seriesIndex = segments.findIndex(
      segment =>
        decodePathSegment(segment).toLowerCase() === "series"
    );
  
    if (seriesIndex >= 0) {
      const user = decodePathSegment(
        segments[seriesIndex + 1] || ""
      );
  
      const password = decodePathSegment(
        segments[seriesIndex + 2] || ""
      );
  
      if (!isPlaceholder(user, ["{user}", "{username}"])) {
        return true;
      }
  
      if (!isPlaceholder(password, ["{password}", "{pass}"])) {
        return true;
      }
    }
  
    for (const [key, value] of parsed.searchParams.entries()) {
      const normalizedKey = key.toLowerCase();
  
      if (
        ["username", "user", "usr"].includes(normalizedKey) &&
        !isPlaceholder(value, ["{user}", "{username}"])
      ) {
        return true;
      }
  
      if (
        ["password", "pass", "pwd"].includes(normalizedKey) &&
        !isPlaceholder(value, ["{password}", "{pass}"])
      ) {
        return true;
      }
    }
  
    return false;
  }
  
  /*
   * Sanitiza las URL antes de agregarlas al catálogo.
   *
   * En rutas /series/usuario/clave/ reemplaza las credenciales
   * por %7Buser%7D y %7Bpassword%7D.
   *
   * Retorna un objeto con url, ok, changed y reason.
   */
  function sanitizeStreamUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return {
        url: "",
        ok: false,
        changed: false,
        reason: "URL_VACIA"
      };
    }
  
    const original = rawUrl.trim();
    let parsed;
  
    try {
      parsed = new URL(original);
    } catch {
      return {
        url: "",
        ok: false,
        changed: false,
        reason: "URL_INVALIDA"
      };
    }
  
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        url: "",
        ok: false,
        changed: false,
        reason: "PROTOCOLO_NO_PERMITIDO"
      };
    }
  
    // Rechazar estas URL en lugar de eliminar silenciosamente
    // credenciales que podrían ser necesarias para reproducir.
    if (parsed.username || parsed.password) {
      return {
        url: "",
        ok: false,
        changed: false,
        reason: "CREDENCIALES_EN_HOST"
      };
    }
  
    const segments = parsed.pathname.split("/");
  
    const seriesIndex = segments.findIndex(
      segment =>
        decodePathSegment(segment).toLowerCase() === "series"
    );
  
    if (seriesIndex >= 0) {
      if (
        !segments[seriesIndex + 1] ||
        !segments[seriesIndex + 2]
      ) {
        return {
          url: "",
          ok: false,
          changed: false,
          reason: "RUTA_SERIES_INCOMPLETA"
        };
      }
  
      segments[seriesIndex + 1] = "%7Buser%7D";
      segments[seriesIndex + 2] = "%7Bpassword%7D";
  
      parsed.pathname = segments.join("/");
    }
  
    // Sanitizar también credenciales que vengan en parámetros.
    for (const key of [...parsed.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
  
      if (["username", "user", "usr"].includes(normalizedKey)) {
        parsed.searchParams.set(key, "{user}");
      } else if (
        ["password", "pass", "pwd"].includes(normalizedKey)
      ) {
        parsed.searchParams.set(key, "{password}");
      }
    }
  
    const sanitizedUrl = parsed.toString();
  
    if (hasUnsanitizedCredentials(sanitizedUrl)) {
      return {
        url: "",
        ok: false,
        changed: false,
        reason: "CREDENCIALES_SIN_SANITIZAR"
      };
    }
  
    return {
      url: sanitizedUrl,
      ok: true,
      changed: sanitizedUrl !== original,
      reason: "OK"
    };
  }
  
  /*
   * Agrega una fuente sin reemplazar el stream principal.
   * No duplica una fuente de la misma lista ni una URL existente.
   */
  function addEpisodeSource(series, episode, sourceName) {
    const seasonKey = String(episode.season);
    const episodeKey = String(episode.episode);
  
    const existingSeason = series.seasons?.[seasonKey];
    const existingEpisode = existingSeason?.episodes?.[episodeKey];
  
    if (
      existingEpisode &&
      Array.isArray(existingEpisode.sources) &&
      existingEpisode.sources.some(
        source => source.source === sourceName
      )
    ) {
      return {
        added: false,
        reason: "SOURCE_YA_EXISTENTE"
      };
    }
  
    const sanitized = sanitizeStreamUrl(episode.url);
  
    if (
      !sanitized.ok ||
      !sanitized.url ||
      hasUnsanitizedCredentials(sanitized.url)
    ) {
      return {
        added: false,
        reason: "URL_NO_SANITIZADA"
      };
    }
  
    series.seasons ??= {};
  
    series.seasons[seasonKey] ??= {
      season: episode.season,
      episodes: {}
    };
  
    const season = series.seasons[seasonKey];
    season.episodes ??= {};
  
    season.episodes[episodeKey] ??= {
      episode: episode.episode,
      name: episode.name,
      streamUrl: "",
      sources: []
    };
  
    const target = season.episodes[episodeKey];
    target.sources ??= [];
  
    const duplicateUrl =
      target.sources.some(source => source.url === sanitized.url) ||
      target.streamUrl === sanitized.url;
  
    if (duplicateUrl) {
      return {
        added: false,
        reason: "URL_YA_EXISTENTE"
      };
    }
  
    target.sources.push({
      source: sourceName,
      url: sanitized.url
    });
  
    // No reemplazar el stream principal si ya tiene uno.
    if (!target.streamUrl) {
      target.streamUrl = sanitized.url;
    }
  
    return {
      added: true,
      reason: "FUENTE_AGREGADA",
      sanitized: sanitized.changed
    };
  }
  
  async function applyConfirmedMatch(catalog, group, result) {
    const id = String(result.bestMatch.tmdbId);
    const existing = catalog[id];
  
    const previous = existing
      ? JSON.parse(JSON.stringify(existing))
      : null;
  
    try {
      let series = existing;
  
      if (!series) {
        const detail = await tmdbRequest(
          `${TMDB_BASE}/tv/${id}`,
          { language: "es-ES" }
        );
  
        series = {
          tmdbId: Number(id),
          name: detail.name,
          originalName: detail.original_name || detail.name,
          overview: detail.overview || "",
          posterPath: detail.poster_path || null,
          backdropPath: detail.backdrop_path || null,
          firstAirDate: detail.first_air_date || null,
          originCountry: detail.origin_country || [],
          seasons: {}
        };
  
        catalog[id] = series;
      } else {
        ensureSeriesShape(series, id, {
          name: result.bestMatch.name,
          original_name: result.bestMatch.originalName,
          poster_path: result.bestMatch.posterPath
        });
      }
  
      let added = 0;
      let alreadyPresent = 0;
      let urlAlreadyPresent = 0;
      let notSanitized = 0;
      let sanitizedUrlsAdded = 0;
  
      for (const episode of group.episodes) {
        const outcome = addEpisodeSource(
          series,
          episode,
          SOURCE_NAME
        );
  
        if (outcome.added) {
          added++;
  
          if (outcome.sanitized) {
            sanitizedUrlsAdded++;
          }
        } else if (outcome.reason === "SOURCE_YA_EXISTENTE") {
          alreadyPresent++;
        } else if (outcome.reason === "URL_YA_EXISTENTE") {
          urlAlreadyPresent++;
        } else if (outcome.reason === "URL_NO_SANITIZADA") {
          notSanitized++;
        }
      }
  
      result.episodesAdded = added;
      result.sourcesAlreadyPresent = alreadyPresent;
      result.urlsAlreadyPresent = urlAlreadyPresent;
      result.urlsRejectedNotSanitized = notSanitized;
      result.sanitizedUrlsAdded = sanitizedUrlsAdded;
  
      result.destination =
        `${path.basename(CATALOG_FILE)} → ${id}`;
  
      result.importResult = !existing
        ? "SERIE NUEVA; FUENTES AGREGADAS"
        : added
          ? "SERIE EXISTENTE; FUENTES AGREGADAS"
          : "SIN CAMBIOS; FUENTES YA EXISTENTES";
    } catch (error) {
      if (previous) {
        catalog[id] = previous;
      } else {
        delete catalog[id];
      }
  
      result.importResult = "ERROR DE IMPORTACIÓN";
      result.importError = error.message;
      result.destination = null;
      result.episodesAdded = 0;
      result.sourcesAlreadyPresent = 0;
      result.urlsAlreadyPresent = 0;
      result.urlsRejectedNotSanitized = 0;
      result.sanitizedUrlsAdded = 0;
    }
  }
  
  function formatReport(results, applied) {
    const lines = [
      `INFORME DE IMPORTACIÓN DE SERIES — ${SOURCE_NAME}`,
      `Fecha: ${new Date().toISOString()}`,
      `Modo: ${applied ? "APLICACIÓN" : "ANÁLISIS / SIN CAMBIOS"}`,
      "",
      "=".repeat(72),
      ""
    ];
  
    for (const result of results) {
      lines.push(
        `SERIE: ${result.seriesName}`,
        `CLASIFICACIÓN: ${result.classification}`,
        `MOTIVO: ${result.reason}`
      );
  
      if (result.bestMatch) {
        lines.push(
          `TMDB ID: ${result.bestMatch.tmdbId}`,
          `NOMBRE TMDB: ${result.bestMatch.name}`,
          `PUNTUACIÓN: ${result.bestMatch.score}`,
          `BRECHA CON SEGUNDO CANDIDATO: ${result.confidenceGap ?? "N/D"}`
        );
      }
  
      lines.push(
        `RESULTADO: ${result.importResult || "NO IMPORTADA"}`,
        `DESTINO: ${result.destination || "Sin destino"}`
      );
  
      if (result.episodesAdded !== undefined) {
        lines.push(
          `EPISODIOS CON FUENTE NUEVA: ${result.episodesAdded}`,
          `FUENTES YA EXISTENTES: ${result.sourcesAlreadyPresent || 0}`,
          `URLS DUPLICADAS: ${result.urlsAlreadyPresent || 0}`,
          `URLS RECHAZADAS POR SEGURIDAD: ${result.urlsRejectedNotSanitized || 0}`,
          `URLS NUEVAS SANITIZADAS: ${result.sanitizedUrlsAdded || 0}`
        );
      }
  
      lines.push("EVIDENCIAS DEL MEJOR CANDIDATO:");
  
      for (const item of result.bestMatch?.evidence || []) {
        lines.push(`  - ${item}`);
      }
  
      lines.push("CONTRADICCIONES:");
  
      const contradictions = result.bestMatch?.contradictions || [];
  
      if (contradictions.length) {
        for (const item of contradictions) {
          lines.push(`  - ${item}`);
        }
      } else {
        lines.push("  - Ninguna detectada");
      }
  
      if (result.bestMatch?.poster) {
        lines.push(
          `COMPARACIÓN DE PÓSTER: ${JSON.stringify(result.bestMatch.poster)}`
        );
      }
  
      if (result.bestMatch?.structure) {
        lines.push(
          `COMPARACIÓN DE ESTRUCTURA: ${JSON.stringify(result.bestMatch.structure)}`
        );
      }
  
      lines.push("CANDIDATOS EVALUADOS:");
  
      for (const candidate of (result.candidates || []).slice(0, 8)) {
        lines.push(
          `  - TMDB ${candidate.tmdbId} | ${candidate.name} | score=${candidate.score} | exact=${candidate.exactTitle} | estructura=${candidate.structure?.status || "N/D"} | poster=${candidate.poster?.status || "N/D"}`
        );
      }
  
      if (result.importError) {
        lines.push(`ERROR DE IMPORTACIÓN: ${result.importError}`);
      }
  
      lines.push("", "-".repeat(72), "");
    }
  
    return lines.join("\n");
  }
  
  async function main() {
    if (!Number.isInteger(LIST_NUMBER) || LIST_NUMBER < 1) {
      throw new Error(
        "Indicá el número de lista. Ejemplo: node scripts/import-series-list.js 6"
      );
    }
  
    if (!TMDB_TOKEN && !TMDB_API_KEY) {
      throw new Error(
        "Configurá TMDB_API_KEY o TMDB_ACCESS_TOKEN en .env."
      );
    }
  
    await fs.mkdir(DATA_DIR, { recursive: true });
    await loadCache();
  
    const catalog = await readJSON(CATALOG_FILE, {});
  
    if (
      !catalog ||
      typeof catalog !== "object" ||
      Array.isArray(catalog)
    ) {
      throw new Error(
        "El catálogo principal no tiene la estructura esperada."
      );
    }
  
    const originalCatalog = JSON.stringify(catalog);
  
    console.log("=".repeat(65));
    console.log(`IMPORTADOR INTELIGENTE DE SERIES — ${SOURCE_NAME}`);
    console.log(
      `Modo: ${APPLY ? "APLICAR CAMBIOS" : "ANÁLISIS; CATÁLOGO SIN CAMBIOS"}`
    );
    console.log(`Candidatos evaluados por serie: hasta ${MAX_CANDIDATES}`);
    console.log("Solo se aceptan patrones explícitos de temporada y episodio.");
    console.log("La estructura se contrasta con episodios reales de TMDB.");
    console.log("=".repeat(65));
  
    const m3u = await downloadM3U();
    const parsedEpisodes = parseM3U(m3u);
  
    // Muestra de control: nunca mostrar las URL, que pueden contener claves.
    console.log("\nMUESTRA DE EPISODIOS DETECTADOS (máximo 20):");
  
    for (const episode of parsedEpisodes.slice(0, 20)) {
      console.log(
        `- ${episode.seriesName} | T${episode.season}E${episode.episode} | ` +
        `grupo=${episode.groupTitle || "(sin grupo)"} | ` +
        `ruta /series/: ${episode.urlIdentifiesSeries ? "sí" : "no"}`
      );
    }
  
    const seriesPathCount = parsedEpisodes.filter(
      episode => episode.urlIdentifiesSeries
    ).length;
  
    console.log(`Episodios detectados: ${parsedEpisodes.length}`);
    console.log(
      `Entradas con ruta /series/: ${seriesPathCount}/${parsedEpisodes.length}`
    );
  
    if (!parsedEpisodes.length) {
      throw new Error(
        "No se detectaron episodios con formato explícito de temporada y episodio. No se consultó TMDB."
      );
    }
  
    /*
     * Control de seguridad: no iniciar consultas masivas si ninguna entrada
     * tiene el patrón de URL habitual de series Xtream.
     * Si tu proveedor usa otro formato, revisar las URL y adaptar este control.
     */
    if (seriesPathCount === 0) {
      throw new Error(
        "SEGURIDAD: ninguna URL detectada contiene /series/. " +
        "Se cancela antes de consultar TMDB para revisar el formato de las URL."
      );
    }
  
    const groups = groupEpisodes(parsedEpisodes);
  
    console.log(`Series agrupadas: ${groups.length}`);
  
    const results = [];
  
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
  
      console.log(
        `\n[${index + 1}/${groups.length}] ${group.name}`
      );
  
      let result;
  
      try {
        result = await identifySeries(group);
      } catch (error) {
        result = {
          seriesName: group.name,
          classification: "NEEDS_REVIEW",
          reason: error.message,
          totalEpisodes: group.totalEpisodes,
          structure: group.structure,
          posters: [...group.posters.values()],
          candidates: []
        };
      }
  
      result.importResult = "NO IMPORTADA";
      result.destination = null;
      result.episodesAdded = 0;
      result.sourcesAlreadyPresent = 0;
      result.urlsAlreadyPresent = 0;
      result.urlsRejectedNotSanitized = 0;
      result.sanitizedUrlsAdded = 0;
  
      if (
        result.classification === "MATCH_CONFIRMED" &&
        result.bestMatch
      ) {
        result.destination =
          `${path.basename(CATALOG_FILE)} → ${result.bestMatch.tmdbId}`;
  
        if (!APPLY) {
          result.importResult = "CONFIRMADA; PENDIENTE DE --apply";
        } else {
          await applyConfirmedMatch(catalog, group, result);
        }
      }
  
      results.push(result);
  
      await writeJSONAtomic(CHECKPOINT_FILE, {
        list: LIST_NUMBER,
        source: SOURCE_NAME,
        processed: index + 1,
        total: groups.length,
        updatedAt: new Date().toISOString(),
        results
      });
  
      await saveCache().catch(() => {});
  
      console.log(
        `${result.classification} | ${result.importResult}` +
        `${result.bestMatch
          ? ` | TMDB ${result.bestMatch.tmdbId} | ${result.bestMatch.score} puntos`
          : ""}`
      );
    }
  
    const unmatched = results.filter(
      result => result.classification !== "MATCH_CONFIRMED"
    );
  
    if (APPLY && originalCatalog !== JSON.stringify(catalog)) {
      try {
        await fs.access(BACKUP_FILE);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
  
        await fs.copyFile(CATALOG_FILE, BACKUP_FILE);
      }
  
      await writeJSONAtomic(CATALOG_FILE, catalog);
    }
  
    const summary = {
      series: results.length,
  
      confirmed: results.filter(
        result => result.classification === "MATCH_CONFIRMED"
      ).length,
  
      probable: results.filter(
        result => result.classification === "MATCH_PROBABLE"
      ).length,
  
      ambiguous: results.filter(
        result => result.classification === "AMBIGUOUS"
      ).length,
  
      unmatched: results.filter(
        result => result.classification === "NO_MATCH"
      ).length,
  
      needsReview: results.filter(
        result =>
          result.classification === "NEEDS_REVIEW" ||
          result.importResult === "ERROR DE IMPORTACIÓN"
      ).length,
  
      episodesAdded: results.reduce(
        (total, result) => total + (result.episodesAdded || 0),
        0
      ),
  
      sourcesAlreadyPresent: results.reduce(
        (total, result) =>
          total + (result.sourcesAlreadyPresent || 0),
        0
      ),
  
      urlsAlreadyPresent: results.reduce(
        (total, result) =>
          total + (result.urlsAlreadyPresent || 0),
        0
      ),
  
      urlsRejectedNotSanitized: results.reduce(
        (total, result) =>
          total + (result.urlsRejectedNotSanitized || 0),
        0
      ),
  
      sanitizedUrlsAdded: results.reduce(
        (total, result) =>
          total + (result.sanitizedUrlsAdded || 0),
        0
      )
    };
  
    await writeJSONAtomic(REPORT_JSON, {
      list: LIST_NUMBER,
      source: SOURCE_NAME,
      applied: APPLY,
      generatedAt: new Date().toISOString(),
      summary,
      results
    });
  
    await writeJSONAtomic(UNMATCHED_FILE, unmatched);
  
    await fs.writeFile(
      REPORT_TXT,
      formatReport(results, APPLY),
      "utf8"
    );
  
    console.log("\n" + "=".repeat(65));
    console.log("PROCESO FINALIZADO");
    console.log(`Series analizadas: ${summary.series}`);
  
    console.log(
      `Confirmadas: ${summary.confirmed} | Probables: ${summary.probable} | Ambiguas: ${summary.ambiguous}`
    );
  
    console.log(
      `Sin coincidencia: ${summary.unmatched} | Revisión necesaria: ${summary.needsReview}`
    );
  
    console.log(
      `Fuentes agregadas: ${summary.episodesAdded} | Ya existentes: ${summary.sourcesAlreadyPresent}`
    );
  
    console.log(
      `URLs duplicadas: ${summary.urlsAlreadyPresent} | Rechazadas por seguridad: ${summary.urlsRejectedNotSanitized} | Sanitizadas: ${summary.sanitizedUrlsAdded}`
    );
  
    console.log(`TXT: ${REPORT_TXT}`);
    console.log(`JSON: ${REPORT_JSON}`);
    console.log(`No confirmadas: ${UNMATCHED_FILE}`);
    console.log(`Checkpoint: ${CHECKPOINT_FILE}`);
    console.log(`Caché TMDB: ${CACHE_FILE}`);
  
    if (APPLY) {
      console.log(
        `Backup: ${BACKUP_FILE}\nCatálogo: ${CATALOG_FILE}`
      );
    } else {
      console.log(
        "El catálogo no fue modificado. Revisá los informes antes de ejecutar con --apply."
      );
    }
  
    console.log("=".repeat(65));
  }
  
  main().catch(error => {
    console.error("\nERROR EN LA IMPORTACIÓN:");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });