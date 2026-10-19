
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.TMDB_API_KEY;

const DATA_DIR = "./data";

const PENDING_FILE =
    path.join(DATA_DIR, "series-lista-6-v9-pending-clean.json");

const MATCHES_FILE =
    path.join(DATA_DIR, "series-lista-6-clean-matches-reviewed.json");

const CACHE_FILE =
    path.join(DATA_DIR, "series-lista-6-audit-cache.json");

const CHECKPOINT_FILE =
    path.join(DATA_DIR, "series-lista-6-audit-progress.json");

const REPORT_JSON =
    path.join(DATA_DIR, "series-lista-6-audit-pro.json");

const REPORT_TXT =
    path.join(DATA_DIR, "series-lista-6-audit-pro.txt");

const LANGUAGES = ["es-AR", "es-MX", "es-ES", "en-US"];

// Conservador para no saturar la API ni la netbook.
const MAX_POPULAR_CANDIDATES = 8;
const MAX_CANDIDATES_PER_SERIES = 25;
const REQUEST_DELAY_MS = 220;
const SAVE_EVERY = 1;

if (!API_KEY) {
    console.error("❌ Falta TMDB_API_KEY en el archivo .env");
    process.exit(1);
}

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

function normalizeTitle(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]/g, "");
}

function titleVariants(title) {
    return [...new Set(
        String(title || "")
            .split("/")
            .map(value => value.trim())
            .filter(Boolean)
    )];
}

function extractYear(value) {
    const match = String(value || "")
        .match(/\b(19|20)\d{2}\b/);

    return match ? Number(match[0]) : null;
}

function asArray(data) {
    if (Array.isArray(data)) return data;

    if (data && typeof data === "object") {
        return Object.entries(data).map(([key, value]) => ({
            ...value,
            seriesName: value?.seriesName || key
        }));
    }

    return [];
}

function getName(item) {
    return item?.seriesName ||
        item?.originalKey ||
        item?.name ||
        "";
}

function getId(candidate) {
    const id = Number(
        candidate?.tmdbId ??
        candidate?.id ??
        candidate?.bestMatch?.tmdbId
    );

    return Number.isInteger(id) && id > 0 ? id : null;
}

function getCandidates(match) {
    const map = new Map();

    function add(candidate, origin) {
        if (!candidate || typeof candidate !== "object") return;

        const id = getId(candidate);
        if (!id) return;

        if (!map.has(id)) {
            map.set(id, {
                ...candidate,
                tmdbId: id,
                previousOrigins: [],
                previousScores: []
            });
        }

        const saved = map.get(id);
        saved.previousOrigins.push(origin);

        const score = Number(candidate.score);
        if (Number.isFinite(score)) {
            saved.previousScores.push(score);
        }
    }

    add(match?.bestMatch, "bestMatch");
    add(match?.secondMatch, "secondMatch");

    for (const candidate of match?.candidates || []) {
        add(candidate, "candidates");
    }

    // Compatibilidad por si un archivo guarda otro nombre de campo.
    for (const candidate of match?.alternatives || []) {
        add(candidate, "alternatives");
    }

    return [...map.values()];
}

function getSourceStructure(item, match) {
    const result = {};

    for (const [key, seasonData] of Object.entries(item?.seasons || {})) {
        const seasonNumber = Number(
            seasonData?.season ?? key
        );

        if (!Number.isInteger(seasonNumber) || seasonNumber < 0) {
            continue;
        }

        const episodeObject = seasonData?.episodes || {};
        const episodeNumbers = Object.entries(episodeObject)
            .map(([key, episode]) => Number(
                episode?.episode ?? key
            ))
            .filter(number =>
                Number.isInteger(number) && number > 0
            );

        result[seasonNumber] = {
            season: seasonNumber,
            episodeNumbers: [...new Set(episodeNumbers)]
                .sort((a, b) => a - b),
            count: Object.keys(episodeObject).length,
            hasEpisodeNumbers: episodeNumbers.length > 0
        };
    }

    // Fallback para archivos que solo guardan cantidades por temporada.
    if (!Object.keys(result).length) {
        const structure =
            item?.m3uStructure ||
            match?.m3uStructure ||
            {};

        for (const [key, value] of Object.entries(structure)) {
            const seasonNumber = Number(key);
            const count = Number(
                typeof value === "object"
                    ? value?.count ?? value?.episodes
                    : value
            );

            if (
                Number.isInteger(seasonNumber) &&
                seasonNumber >= 0 &&
                Number.isFinite(count)
            ) {
                result[seasonNumber] = {
                    season: seasonNumber,
                    episodeNumbers: [],
                    count,
                    hasEpisodeNumbers: false
                };
            }
        }
    }

    return result;
}

function sameNumbers(a, b) {
    const left = [...a].sort((x, y) => x - y);
    const right = [...b].sort((x, y) => x - y);

    return left.length === right.length &&
        left.every((value, index) => value === right[index]);
}

function getExactTitleEvidence(variants, tv, translations) {
    const expected = new Set(
        variants.map(normalizeTitle).filter(Boolean)
    );

    const evidence = [];

    function check(title, source, locale = null) {
        const normalized = normalizeTitle(title);

        if (normalized && expected.has(normalized)) {
            evidence.push({
                title,
                source,
                locale,
                exact: true
            });
        }
    }

    check(tv?.name, "nombre_TMDB");
    check(tv?.original_name, "nombre_original_TMDB");

    for (const translation of translations || []) {
        const locale = [
            translation.iso_639_1,
            translation.iso_3166_1
        ].filter(Boolean).join("-");

        check(
            translation.data?.name,
            "traduccion_TMDB",
            locale || null
        );
    }

    const unique = new Map();

    for (const item of evidence) {
        const key = normalizeTitle(item.title) +
            "|" + item.source + "|" + (item.locale || "");

        unique.set(key, item);
    }

    return [...unique.values()];
}

function evaluateStructure(sourceStructure, tv, seasonResults) {
    const sourceSeasons = Object.values(sourceStructure);
    const tmdbSeasons = new Map(
        (tv?.seasons || []).map(season => [
            Number(season.season_number),
            season
        ])
    );

    const seasonChecks = [];
    let allCompatible = sourceSeasons.length > 0;
    let allExact = sourceSeasons.length > 0;
    let hasEpisodeNumbers = false;

    for (const source of sourceSeasons) {
        const number = source.season;
        const tmdbSeason = tmdbSeasons.get(number);
        const detail = seasonResults[String(number)];

        if (!tmdbSeason) {
            allCompatible = false;
            allExact = false;

            seasonChecks.push({
                season: number,
                status: "TEMPORADA_NO_ENCONTRADA",
                sourceEpisodeCount: source.count,
                tmdbEpisodeCount: null,
                missingEpisodes: source.episodeNumbers
            });

            continue;
        }

        const tmdbNumbers = (detail?.episodes || [])
            .map(episode => Number(episode.episode_number))
            .filter(number =>
                Number.isInteger(number) && number > 0
            )
            .sort((a, b) => a - b);

        const sourceNumbers = source.episodeNumbers;

        let compatible;
        let exact;

        if (
            source.hasEpisodeNumbers &&
            tmdbNumbers.length > 0
        ) {
            hasEpisodeNumbers = true;

            const tmdbSet = new Set(tmdbNumbers);
            const missing = sourceNumbers.filter(
                number => !tmdbSet.has(number)
            );

            compatible = missing.length === 0;
            exact = compatible && sameNumbers(
                sourceNumbers,
                tmdbNumbers
            );

            seasonChecks.push({
                season: number,
                sourceEpisodeCount: sourceNumbers.length,
                tmdbEpisodeCount: tmdbNumbers.length,
                sourceEpisodes: sourceNumbers,
                tmdbEpisodes: tmdbNumbers,
                missingEpisodes: missing,
                compatible,
                exact,
                status: exact
                    ? "ESTRUCTURA_EXACTA"
                    : compatible
                        ? "COMPATIBLE_PARCIAL"
                        : "EPISODIOS_INCOMPATIBLES"
            });
        } else {
            const tmdbCount = Number(
                tmdbSeason.episode_count ??
                detail?.episodes?.length ??
                0
            );

            compatible =
                tmdbCount >= Number(source.count || 0) &&
                tmdbCount > 0;

            exact =
                tmdbCount === Number(source.count || 0) &&
                tmdbCount > 0;

            seasonChecks.push({
                season: number,
                sourceEpisodeCount: source.count,
                tmdbEpisodeCount: tmdbCount,
                missingEpisodes: [],
                compatible,
                exact,
                status: exact
                    ? "CANTIDAD_EXACTA"
                    : compatible
                        ? "CANTIDAD_COMPATIBLE"
                        : "CANTIDAD_INCOMPATIBLE"
            });
        }

        if (!compatible) allCompatible = false;
        if (!exact) allExact = false;
    }

    return {
        compatible: allCompatible,
        exact: allExact,
        hasEpisodeNumbers,
        sourceSeasonCount: sourceSeasons.length,
        tmdbSeasonCount: tv?.number_of_seasons || 0,
        seasonChecks
    };
}

// ---------------------------------------------------------
// Caché persistente de respuestas TMDB
// ---------------------------------------------------------

let cache = {};
let cacheDirty = false;

async function loadJson(file, fallback) {
    try {
        return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
        return fallback;
    }
}

async function saveJson(file, data) {
    const temporary = `${file}.tmp`;

    await fs.writeFile(
        temporary,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    await fs.rename(temporary, file);
}

async function tmdb(endpoint, params = {}) {
    const url = new URL(
        `https://api.themoviedb.org/3${endpoint}`
    );

    url.searchParams.set("api_key", API_KEY);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    }

    const cacheKey = url.toString();

    if (Object.hasOwn(cache, cacheKey)) {
        return cache[cacheKey];
    }

    let lastError;

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(30000)
            });

            if (response.status === 429 || response.status >= 500) {
                const wait = Math.min(
                    30000,
                    1500 * attempt * attempt
                );

                console.warn(
                    `⏳ TMDB ${response.status}; espero ${wait} ms`
                );

                await sleep(wait);
                continue;
            }

            if (!response.ok) {
                throw new Error(
                    `TMDB ${response.status} ${endpoint}`
                );
            }

            const data = await response.json();

            cache[cacheKey] = data;
            cacheDirty = true;

            await sleep(REQUEST_DELAY_MS);

            return data;
        } catch (error) {
            lastError = error;

            if (attempt < 5) {
                await sleep(1000 * attempt);
            }
        }
    }

    throw lastError || new Error(`Error TMDB: ${endpoint}`);
}

// ---------------------------------------------------------
// Búsqueda nueva de candidatos
// ---------------------------------------------------------

async function searchCandidates(variants) {
    const map = new Map();

    for (const query of variants) {
        for (const language of LANGUAGES) {
            try {
                const data = await tmdb("/search/tv", {
                    query,
                    language,
                    page: 1,
                    include_adult: false
                });

                for (const result of data.results || []) {
                    if (!result?.id) continue;

                    if (!map.has(result.id)) {
                        map.set(result.id, {
                            tmdbId: result.id,
                            searchNames: [],
                            searchLanguages: [],
                            popularity: result.popularity || 0,
                            searchResults: []
                        });
                    }

                    const candidate = map.get(result.id);

                    candidate.searchNames.push(
                        result.name || result.original_name || ""
                    );

                    candidate.searchLanguages.push(language);

                    candidate.searchResults.push({
                        language,
                        name: result.name || null,
                        originalName: result.original_name || null,
                        firstAirDate: result.first_air_date || null
                    });

                    candidate.popularity = Math.max(
                        candidate.popularity,
                        result.popularity || 0
                    );
                }
            } catch (error) {
                console.warn(
                    `⚠️ Búsqueda fallida "${query}" [${language}]: ${error.message}`
                );
            }
        }
    }

    return [...map.values()];
}

function selectCandidatePool(found, previous, variants) {
    const map = new Map();

    function add(candidate, origin) {
        const id = getId(candidate);
        if (!id) return;

        if (!map.has(id)) {
            map.set(id, {
                ...candidate,
                tmdbId: id,
                poolOrigins: []
            });
        }

        map.get(id).poolOrigins.push(origin);
    }

    for (const candidate of previous) {
        add(candidate, "resultado_anterior");
    }

    const normalized = new Set(
        variants.map(normalizeTitle).filter(Boolean)
    );

    const exactSearchNames = found.filter(candidate =>
        [
            ...(candidate.searchNames || []),
            ...(candidate.searchResults || []).flatMap(result => [
                result.name,
                result.originalName
            ])
        ].some(name => normalized.has(normalizeTitle(name)))
    );

    for (const candidate of exactSearchNames) {
        add(candidate, "titulo_exacto_en_busqueda");
    }

    const popular = [...found]
        .sort((a, b) =>
            (b.popularity || 0) - (a.popularity || 0)
        )
        .slice(0, MAX_POPULAR_CANDIDATES);

    for (const candidate of popular) {
        add(candidate, "popularidad");
    }

    const all = [...map.values()];

    const exact = all.filter(candidate => {
        const names = [
            candidate.name,
            candidate.originalName,
            ...(candidate.searchNames || [])
        ];

        return names.some(name =>
            normalized.has(normalizeTitle(name))
        );
    });

    const rest = all
        .filter(candidate => !exact.includes(candidate))
        .sort((a, b) =>
            (b.popularity || 0) - (a.popularity || 0)
        );

    // Nunca eliminamos candidatos que coinciden exactamente por nombre.
    return [
        ...exact,
        ...rest.slice(
            0,
            Math.max(0, MAX_CANDIDATES_PER_SERIES - exact.length)
        )
    ];
}

// ---------------------------------------------------------
// Analizar un candidato con datos actuales de TMDB
// ---------------------------------------------------------

async function analyzeCandidate(candidate, variants, sourceStructure, sourceYear) {
    const id = getId(candidate);

    const tv = await tmdb(`/tv/${id}`, {
        language: "en-US"
    });

    const translationsData = await tmdb(`/tv/${id}/translations`);
    const translations = translationsData.translations || [];

    const titleEvidence = getExactTitleEvidence(
        variants,
        tv,
        translations
    );

    const seasonResults = {};

    // Solo consultamos las temporadas que aparecen en la lista IPTV.
    for (const source of Object.values(sourceStructure)) {
        try {
            seasonResults[String(source.season)] =
                await tmdb(`/tv/${id}/season/${source.season}`, {
                    language: "en-US"
                });
        } catch (error) {
            seasonResults[String(source.season)] = {
                episodes: [],
                fetchError: error.message
            };
        }
    }

    const structure = evaluateStructure(
        sourceStructure,
        tv,
        seasonResults
    );

    const tmdbYear = extractYear(tv.first_air_date);
    const yearDifference =
        sourceYear && tmdbYear
            ? Math.abs(sourceYear - tmdbYear)
            : null;

    return {
        tmdbId: id,
        name: tv.name || null,
        originalName: tv.original_name || null,
        firstAirDate: tv.first_air_date || null,
        year: tmdbYear,
        originalLanguage: tv.original_language || null,
        originCountry: tv.origin_country || [],
        status: tv.status || null,
        popularity: tv.popularity || 0,
        numberOfSeasons: tv.number_of_seasons || 0,
        numberOfEpisodes: tv.number_of_episodes || 0,
        posterPath: tv.poster_path || null,
        overview: tv.overview || null,

        previousScores: candidate.previousScores || [],
        previousOrigins: candidate.previousOrigins || [],
        poolOrigins: candidate.poolOrigins || [],

        searchNames: candidate.searchNames || [],
        searchLanguages: [...new Set(candidate.searchLanguages || [])],

        titleExact: titleEvidence.length > 0,
        titleEvidence,

        sourceYear,
        yearDifference,
        yearConflict: yearDifference !== null && yearDifference > 3,

        structure,
        seasonResults
    };
}

// ---------------------------------------------------------
// Decisión conservadora
// ---------------------------------------------------------

function decide(candidates) {
    const exactTitle = candidates.filter(
        candidate => candidate.titleExact
    );

    const compatible = exactTitle.filter(
        candidate => candidate.structure.compatible
    );

    const exactStructure = compatible.filter(
        candidate => candidate.structure.exact
    );

    const withoutYearConflict = compatible.filter(
        candidate => !candidate.yearConflict
    );

    if (
        exactStructure.length === 1 &&
        withoutYearConflict.some(
            candidate => candidate.tmdbId === exactStructure[0].tmdbId
        ) &&
        exactTitle.length === 1
    ) {
        return {
            status: "ESTRUCTURA_EXACTA_TITULO_UNICO",
            selected: exactStructure[0],
            reason:
                "Título exacto, estructura de episodios exacta y ningún otro candidato con título exacto entre los analizados."
        };
    }

    if (
        withoutYearConflict.length === 1 &&
        exactTitle.length === 1 &&
        withoutYearConflict[0].structure.compatible
    ) {
        return {
            status: "ALTA_EVIDENCIA",
            selected: withoutYearConflict[0],
            reason:
                "Título exacto y estructura compatible; no se encontró otro candidato exacto compatible entre los analizados."
        };
    }

    if (compatible.length > 1) {
        return {
            status: "AMBIGUO",
            selected: null,
            reason:
                "Hay más de un candidato con título exacto y estructura compatible."
        };
    }

    if (exactTitle.length > 1) {
        return {
            status: "AMBIGUO",
            selected: null,
            reason:
                "Hay varios candidatos con título exacto; la estructura no permite resolverlo de forma segura."
        };
    }

    if (exactTitle.length === 1) {
        return {
            status: "REVISAR",
            selected: null,
            reason:
                exactTitle[0].yearConflict
                    ? "El título coincide, pero el año difiere más de tres años."
                    : "El título coincide, pero la estructura no es compatible o faltan datos."
        };
    }

    return {
        status: "SIN_EVIDENCIA_SUFICIENTE",
        selected: null,
        reason:
            "Ninguno de los candidatos analizados tiene un título exacto en los nombres o traducciones consultados."
    };
}

// ---------------------------------------------------------
// Procesamiento
// ---------------------------------------------------------

function makeLookup(items) {
    const map = new Map();

    for (const item of items) {
        const name = getName(item);
        if (name) map.set(normalizeTitle(name), item);

        if (item.originalKey) {
            map.set(normalizeTitle(item.originalKey), item);
        }
    }

    return map;
}

function makeReportText(results) {
    const order = [
        "ESTRUCTURA_EXACTA_TITULO_UNICO",
        "ALTA_EVIDENCIA",
        "AMBIGUO",
        "REVISAR",
        "SIN_EVIDENCIA_SUFICIENTE",
        "ERROR"
    ];

    const lines = [
        "AUDITORÍA PROFUNDA DE SERIES — LISTA 6",
        "No importa episodios ni modifica el catálogo.",
        "",
        `Series analizadas: ${results.length}`,
        ""
    ];

    for (const status of order) {
        const group = results.filter(item => item.status === status);

        lines.push("=".repeat(78));
        lines.push(`${status}: ${group.length}`);
        lines.push("=".repeat(78));

        for (const item of group) {
            lines.push("");
            lines.push(`M3U: ${item.seriesName}`);
            lines.push(`Decisión: ${item.status}`);
            lines.push(`Motivo: ${item.reason}`);

            if (item.selected) {
                lines.push(
                    `Candidato: ${item.selected.name} (${item.selected.tmdbId})`
                );
                lines.push(
                    `Año TMDB: ${item.selected.year || "desconocido"}`
                );
                lines.push(
                    `Título exacto: ${item.selected.titleExact ? "sí" : "no"}`
                );
                lines.push(
                    `Estructura compatible: ${item.selected.structure.compatible ? "sí" : "no"}`
                );
                lines.push(
                    `Estructura exacta: ${item.selected.structure.exact ? "sí" : "no"}`
                );

                for (const season of item.selected.structure.seasonChecks) {
                    lines.push(
                        `  T${season.season}: ${season.status} | ` +
                        `M3U ${season.sourceEpisodeCount} / ` +
                        `TMDB ${season.tmdbEpisodeCount ?? "?"}`
                    );

                    if (season.missingEpisodes?.length) {
                        lines.push(
                            `    Episodios no encontrados: ${season.missingEpisodes.join(", ")}`
                        );
                    }
                }

                lines.push(
                    `Evidencia de título: ${
                        item.selected.titleEvidence
                            .map(e => `${e.title} [${e.source}${e.locale ? `/${e.locale}` : ""}]`)
                            .join("; ")
                    }`
                );
            }

            lines.push("Candidatos evaluados:");

            for (const candidate of item.candidates || []) {
                lines.push(
                    `  - ${candidate.name || "Sin nombre"} ` +
                    `(TMDB ${candidate.tmdbId}) | ` +
                    `título=${candidate.titleExact ? "exacto" : "no exacto"} | ` +
                    `estructura=${candidate.structure.compatible ? "compatible" : "incompatible"} | ` +
                    `exacta=${candidate.structure.exact ? "sí" : "no"}`
                );
            }
        }

        lines.push("");
    }

    return lines.join("\n");
}

async function main() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    cache = await loadJson(CACHE_FILE, {});

    const pendingRaw = await loadJson(PENDING_FILE, null);
    const matchesRaw = await loadJson(MATCHES_FILE, null);

    if (!pendingRaw || !matchesRaw) {
        throw new Error(
            "No encuentro los archivos de entrada. Revisá PENDING_FILE y MATCHES_FILE."
        );
    }

    const pending = asArray(pendingRaw);
    const matches = asArray(matchesRaw);

    const matchLookup = makeLookup(matches);

    const checkpoint = await loadJson(CHECKPOINT_FILE, {
        processed: {},
        updatedAt: null
    });

    const completed = checkpoint.processed || {};

    console.log("==============================================");
    console.log(" AUDITORÍA PROFUNDA TMDB — LISTA 6");
    console.log("==============================================");
    console.log(`Pendientes: ${pending.length}`);
    console.log(`Ya procesadas: ${Object.keys(completed).length}`);
    console.log("El catálogo no será modificado.\n");

    let processedThisRun = 0;

    for (let index = 0; index < pending.length; index++) {
        const item = pending[index];
        const seriesName = getName(item);

        if (!seriesName) {
            console.warn(`⚠️ Entrada ${index + 1} sin nombre; se omite.`);
            continue;
        }

        const key = normalizeTitle(seriesName);

        // Reanudación: los errores se vuelven a intentar.
        if (completed[key] && completed[key].status !== "ERROR") {
            continue;
        }

        const match = matchLookup.get(key) || {};
        const variants = titleVariants(seriesName);

        const sourceStructure = getSourceStructure(item, match);
        const sourceYear =
            extractYear(seriesName) ||
            extractYear(item.originalKey || "");

        console.log(
            `\n[${index + 1}/${pending.length}] ${seriesName}`
        );

        try {
            const previousCandidates = getCandidates(match);

            const freshCandidates = await searchCandidates(variants);

            const pool = selectCandidatePool(
                freshCandidates,
                previousCandidates,
                variants
            );

            console.log(
                `  Candidatos nuevos: ${freshCandidates.length}; ` +
                `a evaluar: ${pool.length}`
            );

            const analyzed = [];

            for (const candidate of pool) {
                try {
                    const result = await analyzeCandidate(
                        candidate,
                        variants,
                        sourceStructure,
                        sourceYear
                    );

                    analyzed.push(result);
                } catch (error) {
                    console.warn(
                        `  ⚠️ TMDB ${getId(candidate)}: ${error.message}`
                    );
                }
            }

            analyzed.sort((a, b) => {
                const exactTitle = Number(b.titleExact) - Number(a.titleExact);
                if (exactTitle) return exactTitle;

                const compatible =
                    Number(b.structure.compatible) -
                    Number(a.structure.compatible);

                if (compatible) return compatible;

                const exact =
                    Number(b.structure.exact) -
                    Number(a.structure.exact);

                if (exact) return exact;

                return (b.popularity || 0) - (a.popularity || 0);
            });

            const decision = decide(analyzed);

            completed[key] = {
                seriesName,
                status: decision.status,
                reason: decision.reason,
                selected: decision.selected,
                candidates: analyzed,
                sourceStructure,
                sourceYear,
                sourceTotalEpisodes:
                    item.totalEpisodes ??
                    match.totalEpisodes ??
                    null,
                updatedAt: new Date().toISOString()
            };

            processedThisRun++;

            console.log(
                `  → ${decision.status}` +
                (decision.selected
                    ? `: ${decision.selected.name} (${decision.selected.tmdbId})`
                    : "")
            );
        } catch (error) {
            completed[key] = {
                seriesName,
                status: "ERROR",
                reason: error.message,
                candidates: [],
                updatedAt: new Date().toISOString()
            };

            console.error(`  ❌ ${error.message}`);
        }

        if (processedThisRun % SAVE_EVERY === 0) {
            checkpoint.processed = completed;
            checkpoint.updatedAt = new Date().toISOString();

            await saveJson(CHECKPOINT_FILE, checkpoint);

            if (cacheDirty) {
                await saveJson(CACHE_FILE, cache);
                cacheDirty = false;
            }
        }
    }

    const results = pending
        .map(item => completed[normalizeTitle(getName(item))])
        .filter(Boolean);

    const counts = {};

    for (const result of results) {
        counts[result.status] = (counts[result.status] || 0) + 1;
    }

    const report = {
        generatedAt: new Date().toISOString(),
        totalPending: pending.length,
        totalResults: results.length,
        summary: counts,
        safetyNote:
            "La clasificación es evidencia automática, no garantía absoluta. No se modificó el catálogo.",
        results
    };

    await saveJson(REPORT_JSON, report);
    await fs.writeFile(
        REPORT_TXT,
        makeReportText(results),
        "utf8"
    );

    checkpoint.processed = completed;
    checkpoint.updatedAt = new Date().toISOString();
    await saveJson(CHECKPOINT_FILE, checkpoint);

    if (cacheDirty) {
        await saveJson(CACHE_FILE, cache);
    }

    console.log("\n==============================================");
    console.log(" AUDITORÍA TERMINADA");
    console.log("==============================================");

    for (const [status, count] of Object.entries(counts)) {
        console.log(`${status}: ${count}`);
    }

    console.log("\nArchivos generados:");
    console.log(`- ${REPORT_JSON}`);
    console.log(`- ${REPORT_TXT}`);
    console.log(`- ${CHECKPOINT_FILE}`);
    console.log(`- ${CACHE_FILE}`);
}

main().catch(error => {
    console.error("\n❌ Error fatal:", error);
    process.exitCode = 1;
});