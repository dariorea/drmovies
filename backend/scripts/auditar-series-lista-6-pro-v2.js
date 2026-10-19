
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.TMDB_API_KEY;
const DATA_DIR = "./data";

const FILES = {
    pending: path.join(DATA_DIR, "series-lista-6-v9-pending-clean.json"),
    matches: path.join(DATA_DIR, "series-lista-6-clean-matches-reviewed.json"),

    // Reutilizamos la caché de la auditoría anterior.
    cache: path.join(DATA_DIR, "series-lista-6-audit-cache.json"),

    // Archivos nuevos: no sobrescriben la auditoría anterior.
    progress: path.join(DATA_DIR, "series-lista-6-audit-v2-progress.json"),
    report: path.join(DATA_DIR, "series-lista-6-audit-v2.json"),
    reportTxt: path.join(DATA_DIR, "series-lista-6-audit-v2.txt")
};

const LANGUAGES = ["es-AR", "es-MX", "es-ES", "en-US"];

const MAX_POPULAR_CANDIDATES = 8;
const MAX_CANDIDATES_PER_SERIES = 25;
const REQUEST_DELAY_MS = 180;
const SAVE_CACHE_EVERY = 5;

if (!API_KEY) {
    console.error("❌ Falta TMDB_API_KEY en .env");
    process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let cache = {};
let cacheDirty = false;
let stopRequested = false;
let requestsSinceSave = 0;

function normalizeTitle(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]/g, "");
}

function extractYear(value) {
    const match = String(value || "").match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
}

// Acepta títulos separados por / y títulos alternativos entre paréntesis.
// Ejemplo: La habitación perdida (The Lost Room).
function titleVariants(title) {
    const variants = new Set();

    function add(value) {
        value = String(value || "").trim();
        if (!value) return;

        variants.add(value);

        // Extrae los títulos entre paréntesis.
        for (const match of value.matchAll(/\(([^()]+)\)/g)) {
            const inner = match[1].trim();
            if (inner) variants.add(inner);
        }

        // También prueba el título sin el contenido entre paréntesis.
        const withoutParentheses = value
            .replace(/\([^()]*\)/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (withoutParentheses && withoutParentheses !== value) {
            variants.add(withoutParentheses);
        }
    }

    for (const part of String(title || "").split("/")) {
        add(part);
    }

    return [...variants];
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
    return item?.seriesName || item?.originalKey || item?.name || "";
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
        if (Number.isFinite(score)) saved.previousScores.push(score);
    }

    add(match?.bestMatch, "bestMatch");
    add(match?.secondMatch, "secondMatch");

    for (const candidate of match?.candidates || []) {
        add(candidate, "candidates");
    }

    for (const candidate of match?.alternatives || []) {
        add(candidate, "alternatives");
    }

    return [...map.values()];
}

function getSourceStructure(item, match) {
    const result = {};

    for (const [key, seasonData] of Object.entries(item?.seasons || {})) {
        const season = Number(seasonData?.season ?? key);
        if (!Number.isInteger(season) || season < 0) continue;

        const episodes = seasonData?.episodes || {};

        const numbers = Object.entries(episodes)
            .map(([key, episode]) => Number(episode?.episode ?? key))
            .filter(n => Number.isInteger(n) && n > 0);

        result[season] = {
            season,
            episodeNumbers: [...new Set(numbers)].sort((a, b) => a - b),
            count: Object.keys(episodes).length,
            hasEpisodeNumbers: numbers.length > 0
        };
    }

    // Compatibilidad con estructuras que guardan solamente cantidades.
    if (!Object.keys(result).length) {
        const structure = item?.m3uStructure || match?.m3uStructure || {};

        for (const [key, value] of Object.entries(structure)) {
            const season = Number(key);
            const count = Number(
                typeof value === "object"
                    ? value?.count ?? value?.episodes
                    : value
            );

            if (
                Number.isInteger(season) &&
                season >= 0 &&
                Number.isFinite(count) &&
                count >= 0
            ) {
                result[season] = {
                    season,
                    episodeNumbers: [],
                    count,
                    hasEpisodeNumbers: false
                };
            }
        }
    }

    return result;
}

async function loadJson(file, fallback) {
    try {
        return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.warn(`⚠️ No se pudo leer ${file}: ${error.message}`);
        }
        return fallback;
    }
}

async function saveJson(file, data) {
    const temporary = `${file}.tmp`;

    await fs.writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temporary, file);
}

async function saveCache() {
    if (!cacheDirty) return;

    await saveJson(FILES.cache, cache);
    cacheDirty = false;
    requestsSinceSave = 0;
}

async function tmdb(endpoint, params = {}) {
    const url = new URL(`https://api.themoviedb.org/3${endpoint}`);

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
                signal: AbortSignal.timeout(20000)
            });

            if (response.status === 429 || response.status >= 500) {
                const wait = Math.min(15000, 1000 * attempt * attempt);
                console.warn(`⏳ TMDB ${response.status}; espera ${wait} ms`);
                await sleep(wait);
                continue;
            }

            if (!response.ok) {
                throw new Error(`TMDB ${response.status}: ${endpoint}`);
            }

            const data = await response.json();

            cache[cacheKey] = data;
            cacheDirty = true;
            requestsSinceSave++;

            // Guarda la caché durante el procesamiento, no solamente al final.
            if (requestsSinceSave >= SAVE_CACHE_EVERY) {
                await saveCache();
            }

            await sleep(REQUEST_DELAY_MS);
            return data;
        } catch (error) {
            lastError = error;

            if (attempt < 5) await sleep(700 * attempt);
        }
    }

    throw lastError || new Error(`Error TMDB: ${endpoint}`);
}

async function searchCandidates(variants) {
    const map = new Map();

    for (const query of variants) {
        for (const language of LANGUAGES) {
            if (stopRequested) break;

            try {
                const data = await tmdb("/search/tv", {
                    query,
                    language,
                    page: 1,
                    include_adult: false
                });

                for (const item of data.results || []) {
                    if (!item.id) continue;

                    if (!map.has(item.id)) {
                        map.set(item.id, {
                            tmdbId: item.id,
                            searchNames: [],
                            searchLanguages: [],
                            popularity: 0,
                            searchResults: []
                        });
                    }

                    const candidate = map.get(item.id);

                    candidate.searchNames.push(
                        item.name || item.original_name || ""
                    );

                    candidate.searchLanguages.push(language);

                    candidate.searchResults.push({
                        language,
                        name: item.name || null,
                        originalName: item.original_name || null,
                        firstAirDate: item.first_air_date || null
                    });

                    candidate.popularity = Math.max(
                        candidate.popularity,
                        item.popularity || 0
                    );
                }
            } catch (error) {
                console.warn(
                    `⚠️ Búsqueda "${query}" [${language}]: ${error.message}`
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

    const exactNames = new Set(variants.map(normalizeTitle));

    const exactSearch = found.filter(candidate => {
        const names = [
            ...(candidate.searchNames || []),
            ...(candidate.searchResults || []).flatMap(result => [
                result.name,
                result.originalName
            ])
        ];

        return names.some(name => exactNames.has(normalizeTitle(name)));
    });

    for (const candidate of exactSearch) {
        add(candidate, "titulo_exacto_en_busqueda");
    }

    const popular = [...found]
        .sort((a, b) => b.popularity - a.popularity)
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

        return names.some(name => exactNames.has(normalizeTitle(name)));
    });

    const exactIds = new Set(exact.map(candidate => candidate.tmdbId));

    const rest = all
        .filter(candidate => !exactIds.has(candidate.tmdbId))
        .sort((a, b) => b.popularity - a.popularity);

    // Los títulos exactos no se eliminan aunque superen el límite.
    return [
        ...exact,
        ...rest.slice(
            0,
            Math.max(0, MAX_CANDIDATES_PER_SERIES - exact.length)
        )
    ];
}

function titleEvidence(variants, tv, translations) {
    const expected = new Set(variants.map(normalizeTitle));
    const evidence = [];

    function check(title, source, locale = null) {
        if (title && expected.has(normalizeTitle(title))) {
            evidence.push({ title, source, locale, exact: true });
        }
    }

    check(tv.name, "nombre_TMDB");
    check(tv.original_name, "nombre_original_TMDB");

    for (const translation of translations || []) {
        const locale = [
            translation.iso_639_1,
            translation.iso_3166_1
        ].filter(Boolean).join("-");

        check(translation.data?.name, "traduccion_TMDB", locale || null);
    }

    return [
        ...new Map(
            evidence.map(item => [
                `${normalizeTitle(item.title)}|${item.source}|${item.locale}`,
                item
            ])
        ).values()
    ];
}

// La primera pasada usa los conteos de temporadas de /tv/{id}.
// Solo pide el detalle completo de las temporadas potencialmente compatibles.
async function analyzeCandidate(candidate, variants, sourceStructure, sourceYear) {
    const id = getId(candidate);

    const tv = await tmdb(`/tv/${id}`, { language: "en-US" });

    const tmdbSeasons = new Map(
        (tv.seasons || []).map(season => [
            Number(season.season_number),
            season
        ])
    );

    const checks = [];
    let compatible = Object.keys(sourceStructure).length > 0;
    let exact = compatible;
    let hasEpisodeNumbers = false;
    let detailedSeasons = 0;

    for (const source of Object.values(sourceStructure)) {
        if (stopRequested) break;

        const season = tmdbSeasons.get(source.season);

        if (!season) {
            compatible = false;
            exact = false;

            checks.push({
                season: source.season,
                status: "TEMPORADA_NO_ENCONTRADA",
                sourceEpisodeCount: source.count,
                tmdbEpisodeCount: null,
                compatible: false,
                exact: false
            });

            continue;
        }

        const tmdbCount = Number(season.episode_count || 0);

        // Si TMDB tiene menos episodios que los presentes en la fuente,
        // no es compatible. Evitamos consultar esa temporada.
        if (tmdbCount < source.count) {
            compatible = false;
            exact = false;

            checks.push({
                season: source.season,
                status: "CANTIDAD_INCOMPATIBLE",
                sourceEpisodeCount: source.count,
                tmdbEpisodeCount: tmdbCount,
                compatible: false,
                exact: false
            });

            continue;
        }

        let seasonData = null;

        if (source.hasEpisodeNumbers) {
            try {
                seasonData = await tmdb(
                    `/tv/${id}/season/${source.season}`,
                    { language: "en-US" }
                );

                detailedSeasons++;
            } catch (error) {
                checks.push({
                    season: source.season,
                    status: "ERROR_CONSULTA_TEMPORADA",
                    sourceEpisodeCount: source.count,
                    tmdbEpisodeCount: tmdbCount,
                    compatible: false,
                    exact: false,
                    error: error.message
                });

                compatible = false;
                exact = false;
                continue;
            }
        }

        if (source.hasEpisodeNumbers && seasonData) {
            hasEpisodeNumbers = true;

            const tmdbNumbers = (seasonData.episodes || [])
                .map(episode => Number(episode.episode_number))
                .filter(n => Number.isInteger(n) && n > 0)
                .sort((a, b) => a - b);

            const tmdbSet = new Set(tmdbNumbers);
            const missing = source.episodeNumbers.filter(n => !tmdbSet.has(n));

            const seasonCompatible = missing.length === 0;
            const seasonExact = seasonCompatible &&
                source.episodeNumbers.length === tmdbNumbers.length &&
                source.episodeNumbers.every((n, i) => n === tmdbNumbers[i]);

            if (!seasonCompatible) compatible = false;
            if (!seasonExact) exact = false;

            checks.push({
                season: source.season,
                status: seasonExact
                    ? "ESTRUCTURA_EXACTA"
                    : seasonCompatible
                        ? "COMPATIBLE_PARCIAL"
                        : "EPISODIOS_INCOMPATIBLES",
                sourceEpisodeCount: source.episodeNumbers.length,
                tmdbEpisodeCount: tmdbNumbers.length,
                sourceEpisodes: source.episodeNumbers,
                tmdbEpisodes: tmdbNumbers,
                missingEpisodes: missing,
                compatible: seasonCompatible,
                exact: seasonExact
            });
        } else {
            // Si solo tenemos cantidades, no podemos asegurar identidad
            // exacta: sí podemos confirmar compatibilidad de cantidades.
            const seasonCompatible = tmdbCount >= source.count;
            const seasonExact = tmdbCount === source.count;

            if (!seasonCompatible) compatible = false;
            if (!seasonExact) exact = false;

            checks.push({
                season: source.season,
                status: seasonExact
                    ? "CANTIDAD_EXACTA"
                    : "CANTIDAD_COMPATIBLE",
                sourceEpisodeCount: source.count,
                tmdbEpisodeCount: tmdbCount,
                compatible: seasonCompatible,
                exact: seasonExact
            });
        }
    }

    let translations = [];

    // Solo consultamos traducciones si la estructura no ha descartado
    // el candidato. Esto ahorra solicitudes para candidatos incompatibles.
    if (compatible) {
        try {
            const data = await tmdb(`/tv/${id}/translations`);
            translations = data.translations || [];
        } catch (error) {
            console.warn(`⚠️ Traducciones TMDB ${id}: ${error.message}`);
        }
    }

    const evidence = titleEvidence(variants, tv, translations);
    const tmdbYear = extractYear(tv.first_air_date);

    const yearDifference = sourceYear && tmdbYear
        ? Math.abs(sourceYear - tmdbYear)
        : null;

    return {
        tmdbId: id,
        name: tv.name || null,
        originalName: tv.original_name || null,
        firstAirDate: tv.first_air_date || null,
        year: tmdbYear,
        sourceYear,
        yearDifference,
        yearConflict: yearDifference !== null && yearDifference > 3,
        originalLanguage: tv.original_language || null,
        originCountry: tv.origin_country || [],
        popularity: tv.popularity || 0,
        numberOfSeasons: tv.number_of_seasons || 0,
        numberOfEpisodes: tv.number_of_episodes || 0,
        posterPath: tv.poster_path || null,
        overview: tv.overview || null,

        titleExact: evidence.length > 0,
        titleEvidence: evidence,

        previousScores: candidate.previousScores || [],
        previousOrigins: candidate.previousOrigins || [],
        poolOrigins: candidate.poolOrigins || [],
        searchNames: candidate.searchNames || [],

        structure: {
            compatible,
            exact,
            hasEpisodeNumbers,
            sourceSeasonCount: Object.keys(sourceStructure).length,
            tmdbSeasonCount: tv.number_of_seasons || 0,
            detailedSeasons,
            seasonChecks: checks
        }
    };
}

function decide(candidates, sourceStructure) {
    const sourceSeasons = Object.values(sourceStructure);
    const hasSourceStructure = sourceSeasons.length > 0;
    const hasEpisodeNumbers = sourceSeasons.some(s => s.hasEpisodeNumbers);

    const compatible = candidates.filter(c => c.structure.compatible);
    const exactStructure = compatible.filter(c => c.structure.exact);
    const exactTitles = candidates.filter(c => c.titleExact);

    // Una estructura exacta y única tiene prioridad absoluta.
    if (exactStructure.length === 1) {
        const winner = exactStructure[0];

        return {
            status: winner.titleExact
                ? "ESTRUCTURA_EXACTA_TITULO_UNICO"
                : "ESTRUCTURA_UNICA",
            selected: winner,
            reason: winner.titleExact
                ? "Único candidato con estructura exacta y título coincidente."
                : "Único candidato con estructura exacta entre los analizados; el título no es requisito obligatorio."
        };
    }

    // La fuente puede contener solo parte de una temporada.
    // Si un solo candidato es compatible con todos los episodios fuente,
    // lo seleccionamos, pero diferenciamos la fuerza de la evidencia.
    if (compatible.length === 1) {
        const winner = compatible[0];

        if (winner.yearConflict && !winner.structure.exact) {
            return {
                status: "REVISAR",
                selected: winner,
                reason: "Solo un candidato es estructuralmente compatible, pero existe una diferencia importante de año y la estructura no es exacta."
            };
        }

        return {
            status: winner.titleExact
                ? "ALTA_EVIDENCIA"
                : "ESTRUCTURA_UNICA",
            selected: winner,
            reason: "Único candidato compatible con las temporadas y episodios presentes en la fuente."
        };
    }

    if (compatible.length > 1) {
        return {
            status: "AMBIGUO",
            selected: null,
            reason: "Varios candidatos son estructuralmente compatibles; se necesita comparar título, año y episodios."
        };
    }

    if (exactTitles.length === 1) {
        return {
            status: "REVISAR",
            selected: null,
            reason: "Hay un título coincidente, pero su estructura no es compatible con la fuente."
        };
    }

    if (exactTitles.length > 1) {
        return {
            status: "AMBIGUO",
            selected: null,
            reason: "Hay varios títulos coincidentes y ninguno tiene una estructura compatible única."
        };
    }

    if (!hasSourceStructure || !hasEpisodeNumbers) {
        return {
            status: "SIN_EVIDENCIA_SUFICIENTE",
            selected: null,
            reason: "No hay números de episodios suficientes para identificar estructuralmente la serie."
        };
    }

    return {
        status: "REVISAR",
        selected: null,
        reason: "Ningún candidato coincide con la estructura disponible."
    };
}

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
    const statuses = [
        "ESTRUCTURA_EXACTA_TITULO_UNICO",
        "ESTRUCTURA_UNICA",
        "ALTA_EVIDENCIA",
        "AMBIGUO",
        "REVISAR",
        "SIN_EVIDENCIA_SUFICIENTE",
        "ERROR"
    ];

    const lines = [
        "AUDITORÍA PROFUNDA TMDB — LISTA 6 — V2",
        "No modifica el catálogo ni importa episodios.",
        `Series procesadas: ${results.length}`,
        ""
    ];

    for (const status of statuses) {
        const group = results.filter(item => item.status === status);

        lines.push("=".repeat(76));
        lines.push(`${status}: ${group.length}`);
        lines.push("=".repeat(76));

        for (const item of group) {
            lines.push("");
            lines.push(`M3U: ${item.seriesName}`);
            lines.push(`Decisión: ${item.status}`);
            lines.push(`Motivo: ${item.reason}`);

            if (item.selected) {
                const c = item.selected;

                lines.push(`Candidato: ${c.name} (TMDB ${c.tmdbId})`);
                lines.push(`Año TMDB: ${c.year || "desconocido"}`);
                lines.push(`Título exacto: ${c.titleExact ? "sí" : "no"}`);
                lines.push(`Estructura compatible: ${c.structure.compatible}`);
                lines.push(`Estructura exacta: ${c.structure.exact}`);

                for (const s of c.structure.seasonChecks) {
                    lines.push(
                        `  T${s.season}: ${s.status} | ` +
                        `M3U ${s.sourceEpisodeCount} / TMDB ${s.tmdbEpisodeCount ?? "?"}`
                    );

                    if (s.missingEpisodes?.length) {
                        lines.push(`    Episodios faltantes: ${s.missingEpisodes.join(", ")}`);
                    }
                }
            }

            lines.push("Candidatos evaluados:");

            for (const c of item.candidates || []) {
                lines.push(
                    `  - ${c.name || "Sin nombre"} (${c.tmdbId}) | ` +
                    `título=${c.titleExact ? "sí" : "no"} | ` +
                    `estructura=${c.structure.compatible ? "compatible" : "incompatible"} | ` +
                    `exacta=${c.structure.exact ? "sí" : "no"}`
                );
            }
        }

        lines.push("");
    }

    return lines.join("\n");
}

async function main() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    cache = await loadJson(FILES.cache, {});

    const pendingRaw = await loadJson(FILES.pending, null);
    const matchesRaw = await loadJson(FILES.matches, null);

    if (!pendingRaw || !matchesRaw) {
        throw new Error("No encuentro los archivos pending/matches de entrada.");
    }

    const pending = asArray(pendingRaw);
    const matches = asArray(matchesRaw);
    const matchLookup = makeLookup(matches);

    const checkpoint = await loadJson(FILES.progress, {
        processed: {},
        updatedAt: null
    });

    const completed = checkpoint.processed || {};

    console.log("==============================================");
    console.log(" AUDITORÍA PROFUNDA TMDB — LISTA 6 — V2");
    console.log("==============================================");
    console.log(`Pendientes: ${pending.length}`);
    console.log(`Ya procesadas en V2: ${Object.keys(completed).length}`);
    console.log(`Respuestas en caché: ${Object.keys(cache).length}`);
    console.log("El catálogo no será modificado.\n");

    const persist = async () => {
        checkpoint.processed = completed;
        checkpoint.updatedAt = new Date().toISOString();

        await saveJson(FILES.progress, checkpoint);
        await saveCache();
    };

    // Ctrl+C solicita detener el trabajo de forma segura al finalizar
    // la serie actual, guardando progreso y caché.
    process.on("SIGINT", () => {
        console.log("\n⏳ Interrupción solicitada; guardaré el progreso al terminar la serie actual.");
        stopRequested = true;
    });

    for (let index = 0; index < pending.length; index++) {
        if (stopRequested) break;

        const item = pending[index];
        const seriesName = getName(item);

        if (!seriesName) continue;

        const key = normalizeTitle(seriesName);

        // Solo omitimos resultados terminados. Los errores se reintentan.
        if (completed[key] && completed[key].status !== "ERROR") continue;

        const match = matchLookup.get(key) || {};
        const variants = titleVariants(seriesName);
        const sourceStructure = getSourceStructure(item, match);
        const sourceYear =
            extractYear(seriesName) ||
            extractYear(item.originalKey || "");

        console.log(`\n[${index + 1}/${pending.length}] ${seriesName}`);
        console.log(`  Variantes de título: ${variants.join(" | ")}`);

        try {
            const previous = getCandidates(match);
            const found = await searchCandidates(variants);

            const pool = selectCandidatePool(found, previous, variants);

            console.log(
                `  Candidatos encontrados: ${found.length}; a evaluar: ${pool.length}`
            );

            const analyzed = [];

            for (const candidate of pool) {
                if (stopRequested) break;

                try {
                    const result = await analyzeCandidate(
                        candidate,
                        variants,
                        sourceStructure,
                        sourceYear
                    );

                    analyzed.push(result);
                } catch (error) {
                    console.warn(`  ⚠️ TMDB ${getId(candidate)}: ${error.message}`);
                }
            }

            analyzed.sort((a, b) =>
                Number(b.structure.exact) - Number(a.structure.exact) ||
                Number(b.structure.compatible) - Number(a.structure.compatible) ||
                Number(b.titleExact) - Number(a.titleExact) ||
                Number(b.popularity) - Number(a.popularity)
            );

            // No registrar como final una serie interrumpida a mitad
            // de la evaluación de sus candidatos.
            if (stopRequested) break;

            const decision = decide(analyzed, sourceStructure);

            completed[key] = {
                seriesName,
                status: decision.status,
                reason: decision.reason,
                selected: decision.selected,
                candidates: analyzed,
                sourceStructure,
                sourceYear,
                updatedAt: new Date().toISOString()
            };

            console.log(
                `  → ${decision.status}` +
                (decision.selected
                    ? `: ${decision.selected.name} (${decision.selected.tmdbId})`
                    : "")
            );

            await persist();
        } catch (error) {
            completed[key] = {
                seriesName,
                status: "ERROR",
                reason: error.message,
                candidates: [],
                updatedAt: new Date().toISOString()
            };

            console.error(`  ❌ ${error.message}`);
            await persist();
        }
    }

    await persist();

    const results = pending
        .map(item => completed[normalizeTitle(getName(item))])
        .filter(Boolean);

    const summary = {};

    for (const result of results) {
        summary[result.status] = (summary[result.status] || 0) + 1;
    }

    const report = {
        generatedAt: new Date().toISOString(),
        totalPending: pending.length,
        totalResults: results.length,
        interrupted: stopRequested,
        summary,
        safetyNote:
            "Auditoría automática. No modifica series-streams-combined.json ni importa episodios.",
        results
    };

    await saveJson(FILES.report, report);
    await fs.writeFile(FILES.reportTxt, makeReportText(results), "utf8");

    console.log("\n==============================================");
    console.log(stopRequested ? " AUDITORÍA PAUSADA" : " AUDITORÍA TERMINADA");
    console.log("==============================================");

    for (const [status, count] of Object.entries(summary)) {
        console.log(`${status}: ${count}`);
    }

    console.log(`Resultados: ${results.length}/${pending.length}`);
    console.log(`Informe: ${FILES.report}`);
    console.log(`Informe legible: ${FILES.reportTxt}`);
    console.log(`Progreso: ${FILES.progress}`);
    console.log(`Caché: ${FILES.cache}`);
}

main().catch(error => {
    console.error("\n❌ Error fatal:", error);
    process.exitCode = 1;
});