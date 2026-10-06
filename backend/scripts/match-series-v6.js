import fs from "fs/promises";
import dotenv from "dotenv"

dotenv.config()
const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
    console.error("❌ Falta TMDB_API_KEY");
    process.exit(1);
}

const SERIES_FILE = "./data/series-parsed.json";
const V5_FILE = "./data/series-tmdb-matches.json";
const REVIEW_FILE = "./data/series-tmdb-review.json";

const PROGRESS_FILE =
    "./data/series-tmdb-v6-progress.json";

const OUTPUT_FILE =
    "./data/series-tmdb-v6-results.json";

const LANGUAGES = [
    "es-AR",
    "es-MX",
    "es-ES",
    "en-US"
];

const CONCURRENCY = 3;


// ============================================================
// CACHE
// ============================================================

const searchCache = new Map();
const translationCache = new Map();
const structureCache = new Map();


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function normalizeTitle(title) {

    return title
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}


function getTitleVariants(name) {

    return name
        .split("/")
        .map(title => title.trim())
        .filter(Boolean);
}


// ============================================================
// TMDB REQUEST
// ============================================================

async function tmdb(
    path,
    params = {},
    retries = 4
) {

    const url = new URL(
        `https://api.themoviedb.org/3${path}`
    );

    url.searchParams.set(
        "api_key",
        TMDB_API_KEY
    );

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    for (
        let attempt = 1;
        attempt <= retries;
        attempt++
    ) {

        try {

            const response = await fetch(url);

            if (response.status === 429) {

                const retryAfter =
                    Number(
                        response.headers.get(
                            "retry-after"
                        )
                    ) || 2;

                console.log(
                    `⏳ Rate limit. Esperando ${retryAfter}s...`
                );

                await sleep(
                    retryAfter * 1000
                );

                continue;
            }

            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );
            }

            return await response.json();

        } catch (error) {

            if (attempt === retries) {
                throw error;
            }

            console.log(
                `⚠️ Error TMDB. ` +
                `Reintento ${attempt}/${retries}`
            );

            await sleep(
                attempt * 1500
            );
        }
    }
}


// ============================================================
// SEARCH
// ============================================================

async function searchSeries(title) {

    const cacheKey =
        normalizeTitle(title);

    if (searchCache.has(cacheKey)) {

        return searchCache.get(cacheKey);
    }

    const candidates = new Map();

    for (const language of LANGUAGES) {

        const data = await tmdb(
            "/search/tv",
            {
                query: title,
                language,
                page: 1
            }
        );

        for (const result of data.results || []) {

            if (!candidates.has(result.id)) {

                candidates.set(
                    result.id,
                    result
                );
            }
        }
    }

    const results =
        [...candidates.values()];

    searchCache.set(
        cacheKey,
        results
    );

    return results;
}


// ============================================================
// TRANSLATIONS
// ============================================================

async function getTranslations(id) {

    if (translationCache.has(id)) {

        return translationCache.get(id);
    }

    const data = await tmdb(
        `/tv/${id}/translations`
    );

    const translations =
        data.translations || [];

    translationCache.set(
        id,
        translations
    );

    return translations;
}


// ============================================================
// TODOS LOS TÍTULOS DE TMDB
// ============================================================

async function getCandidateTitles(candidate) {

    const titles = new Set();

    if (candidate.name) {
        titles.add(candidate.name);
    }

    if (candidate.original_name) {
        titles.add(candidate.original_name);
    }

    const translations =
        await getTranslations(
            candidate.id
        );

    for (const translation of translations) {

        const data =
            translation?.data;

        if (!data) {
            continue;
        }

        if (data.name) {
            titles.add(data.name);
        }

        if (data.original_name) {
            titles.add(
                data.original_name
            );
        }
    }

    return [...titles];
}


// ============================================================
// TITLE MATCH
// ============================================================

function getTitleMatches(
    variants,
    tmdbTitles
) {

    const matches = [];

    const normalizedVariants =
        variants.map(title => ({
            original: title,
            normalized:
                normalizeTitle(title)
        }));

    const normalizedTMDB =
        tmdbTitles.map(title => ({
            original: title,
            normalized:
                normalizeTitle(title)
        }));

    for (const m3u of normalizedVariants) {

        if (!m3u.normalized) {
            continue;
        }

        for (const tmdb of normalizedTMDB) {

            if (
                m3u.normalized ===
                tmdb.normalized
            ) {

                matches.push({
                    m3uTitle: m3u.original,
                    tmdbTitle: tmdb.original
                });
            }
        }
    }

    return matches;
}


// ============================================================
// M3U STRUCTURE
// ============================================================

function getM3UStructure(series) {

    const structure = {};

    for (
        const [seasonNumber, season]
        of Object.entries(
            series.seasons || {}
        )
    ) {

        structure[seasonNumber] =
            Object.keys(
                season.episodes || {}
            ).length;
    }

    return structure;
}


// ============================================================
// TMDB STRUCTURE
// ============================================================

async function getStructure(id) {

    if (structureCache.has(id)) {

        return structureCache.get(id);
    }

    const details = await tmdb(
        `/tv/${id}`
    );

    const structure = {};

    for (
        const season
        of details.seasons || []
    ) {

        if (
            season.season_number === 0 ||
            season.episode_count === 0
        ) {
            continue;
        }

        const seasonNumber =
            season.season_number;

        const seasonData =
            await tmdb(
                `/tv/${id}/season/${seasonNumber}`
            );

        structure[seasonNumber] =
            (
                seasonData.episodes || []
            ).length;

        // Evita pegarle demasiado rápido a TMDB
        await sleep(50);
    }

    structureCache.set(
        id,
        structure
    );

    return structure;
}


// ============================================================
// STRUCTURE COMPARISON
// ============================================================

function compareStructure(
    m3u,
    tmdb
) {

    const m3uSeasons =
        Object.keys(m3u)
            .map(Number)
            .sort((a, b) => a - b);

    const tmdbSeasons =
        Object.keys(tmdb)
            .map(Number)
            .sort((a, b) => a - b);

    const sameSeasonSet =
        JSON.stringify(m3uSeasons) ===
        JSON.stringify(tmdbSeasons);

    let expectedEpisodes = 0;
    let matchingEpisodes = 0;

    let exactSeasonCount = 0;

    for (const season of m3uSeasons) {

        const m3uEpisodes =
            m3u[season] || 0;

        const tmdbEpisodes =
            tmdb[season] || 0;

        expectedEpisodes +=
            m3uEpisodes;

        matchingEpisodes +=
            Math.min(
                m3uEpisodes,
                tmdbEpisodes
            );

        if (
            m3uEpisodes ===
            tmdbEpisodes
        ) {

            exactSeasonCount++;
        }
    }

    const episodeRatio =
        expectedEpisodes === 0
            ? 0
            : matchingEpisodes /
              expectedEpisodes;

    const exactStructure =
        sameSeasonSet &&
        exactSeasonCount ===
        m3uSeasons.length;

    const seasonCoverage =
        m3uSeasons.length === 0
            ? 0
            : exactSeasonCount /
              m3uSeasons.length;

    return {
        sameSeasonSet,
        exactStructure,
        expectedEpisodes,
        matchingEpisodes,
        episodeRatio,
        exactSeasonCount,
        m3uSeasonCount:
            m3uSeasons.length,
        tmdbSeasonCount:
            tmdbSeasons.length,
        seasonCoverage
    };
}


// ============================================================
// SCORE
// ============================================================

function calculateScore({
    titleMatch,
    structure
}) {

    let score = 0;

    // Título exacto / traducción
    if (titleMatch) {
        score += 50;
    }

    // Estructura
    if (structure.exactStructure) {

        score += 50;

    } else {

        if (
            structure.seasonCoverage >=
            0.80
        ) {
            score += 25;
        }

        if (
            structure.episodeRatio >=
            0.95
        ) {
            score += 20;

        } else if (
            structure.episodeRatio >=
            0.90
        ) {
            score += 15;

        } else if (
            structure.episodeRatio >=
            0.80
        ) {
            score += 10;
        }

        if (
            structure.sameSeasonSet
        ) {
            score += 10;
        }
    }

    return score;
}


// ============================================================
// DECISION
// ============================================================

function decide(results) {

    if (!results.length) {
        return "SIN_MATCH";
    }

    const exact =
        results.filter(
            r =>
                r.titleMatch &&
                r.exactStructure
        );

    if (exact.length === 1) {
        return "MATCH_FUERTE";
    }

    if (exact.length > 1) {
        return "AMBIGUO";
    }

    const probable =
        results.filter(
            r =>
                r.titleMatch &&
                r.episodeRatio >= 0.80
        );

    if (probable.length === 1) {
        return "MATCH_PROBABLE";
    }

    if (probable.length > 1) {

        // Si uno está claramente por encima
        const sorted =
            [...probable].sort(
                (a, b) =>
                    b.score - a.score
            );

        const first = sorted[0];
        const second = sorted[1];

        if (
            first.score >=
            second.score + 20
        ) {
            return "MATCH_PROBABLE";
        }

        return "AMBIGUO";
    }

    return "AMBIGUO";
}


// ============================================================
// ANALIZAR SERIE
// ============================================================

async function analyzeSeries(
    seriesName,
    series
) {

    const variants =
        getTitleVariants(
            seriesName
        );

    const m3uStructure =
        getM3UStructure(
            series
        );

    console.log(
        `\n🔎 ${seriesName}`
    );

    console.log(
        `   Variantes: ${variants.join(" | ")}`
    );

    console.log(
        `   M3U: ${JSON.stringify(m3uStructure)}`
    );

    const candidateMap =
        new Map();

    // --------------------------------------------------------
    // SEARCH
    // --------------------------------------------------------

    for (const variant of variants) {

        const candidates =
            await searchSeries(
                variant
            );

        for (const candidate of candidates) {

            if (
                !candidateMap.has(
                    candidate.id
                )
            ) {

                candidateMap.set(
                    candidate.id,
                    {
                        candidate,
                        searchedWith: [
                            variant
                        ]
                    }
                );

            } else {

                candidateMap
                    .get(candidate.id)
                    .searchedWith
                    .push(variant);
            }
        }
    }

    console.log(
        `   Candidatos: ${candidateMap.size}`
    );

    const results = [];

    // --------------------------------------------------------
    // CANDIDATES
    // --------------------------------------------------------

    for (
        const {
            candidate,
            searchedWith
        }
        of candidateMap.values()
    ) {

        let tmdbTitles;

        try {

            tmdbTitles =
                await getCandidateTitles(
                    candidate
                );

        } catch (error) {

            console.log(
                `   ⚠️ Error traducciones ${candidate.id}`
            );

            continue;
        }

        const titleMatches =
            getTitleMatches(
                variants,
                tmdbTitles
            );

        const titleMatch =
            titleMatches.length > 0;

        // No descartamos inmediatamente:
        // la búsqueda puede encontrar una variante
        // que TMDB no tenga exactamente traducida.

        let tmdbStructure;

        try {

            tmdbStructure =
                await getStructure(
                    candidate.id
                );

        } catch (error) {

            console.log(
                `   ⚠️ Error estructura ${candidate.id}`
            );

            continue;
        }

        const structure =
            compareStructure(
                m3uStructure,
                tmdbStructure
            );

        const score =
            calculateScore({
                titleMatch,
                structure
            });

        results.push({

            tmdbId:
                candidate.id,

            name:
                candidate.name,

            originalName:
                candidate.original_name,

            firstAirDate:
                candidate.first_air_date,

            searchedWith,

            titleMatch,

            titleMatches,

            tmdbTitles,

            m3uStructure,

            tmdbStructure,

            sameSeasonSet:
                structure.sameSeasonSet,

            exactStructure:
                structure.exactStructure,

            expectedEpisodes:
                structure.expectedEpisodes,

            matchingEpisodes:
                structure.matchingEpisodes,

            episodeRatio:
                structure.episodeRatio,

            exactSeasonCount:
                structure.exactSeasonCount,

            m3uSeasonCount:
                structure.m3uSeasonCount,

            tmdbSeasonCount:
                structure.tmdbSeasonCount,

            seasonCoverage:
                structure.seasonCoverage,

            score
        });
    }

    results.sort(
        (a, b) =>
            b.score - a.score
    );

    const decision =
        decide(results);

    const top =
        results[0];

    if (
        decision ===
        "MATCH_FUERTE"
    ) {

        console.log(
            `   🟢 FUERTE → ` +
            `${top.tmdbId} - ${top.name}`
        );

    } else if (
        decision ===
        "MATCH_PROBABLE"
    ) {

        console.log(
            `   🟡 PROBABLE → ` +
            `${top.tmdbId} - ${top.name} ` +
            `(score ${top.score})`
        );

    } else if (
        decision ===
        "AMBIGUO"
    ) {

        console.log(
            `   🟠 AMBIGUO`
        );

        for (
            const result
            of results.slice(0, 3)
        ) {

            console.log(
                `      ${result.tmdbId} | ` +
                `${result.name} | ` +
                `score=${result.score} | ` +
                `eps=${(
                    result.episodeRatio *
                    100
                ).toFixed(1)}% | ` +
                `title=${result.titleMatch}`
            );
        }

    } else {

        console.log(
            `   🔴 SIN MATCH`
        );
    }

    return {
        seriesName,
        variants,
        m3uStructure,
        decision,
        results
    };
}


// ============================================================
// LOAD PROGRESS
// ============================================================

async function loadProgress() {

    try {

        const content =
            await fs.readFile(
                PROGRESS_FILE,
                "utf8"
            );

        return JSON.parse(content);

    } catch {

        return {};
    }
}


// ============================================================
// SAVE PROGRESS
// ============================================================

async function saveProgress(progress) {

    await fs.writeFile(
        PROGRESS_FILE,
        JSON.stringify(
            progress,
            null,
            2
        ),
        "utf8"
    );
}


// ============================================================
// WORKER
// ============================================================

async function worker(
    queue,
    progress,
    allSeries
) {

    while (queue.length > 0) {

        const seriesName =
            queue.shift();

        if (
            progress[seriesName]
        ) {
            continue;
        }

        const series =
            allSeries[seriesName];

        if (!series) {

            progress[seriesName] = {
                decision:
                    "NO_EN_M3U"
            };

            continue;
        }

        try {

            progress[seriesName] =
                await analyzeSeries(
                    seriesName,
                    series
                );

        } catch (error) {

            console.error(
                `❌ ${seriesName}:`,
                error.message
            );

            progress[seriesName] = {
                decision: "ERROR",
                error: error.message
            };
        }

        await saveProgress(
            progress
        );
    }
}


// ============================================================
// MAIN
// ============================================================

async function main() {

    console.log(
        "🚀 SERIES MATCHING V6 MASIVO"
    );

    // --------------------------------------------------------
    // LOAD FILES
    // --------------------------------------------------------

    const seriesData =
        JSON.parse(
            await fs.readFile(
                SERIES_FILE,
                "utf8"
            )
        );

    const v5 =
        JSON.parse(
            await fs.readFile(
                V5_FILE,
                "utf8"
            )
        );

    const review =
        JSON.parse(
            await fs.readFile(
                REVIEW_FILE,
                "utf8"
            )
        );

    // --------------------------------------------------------
    // SERIES A PROCESAR
    // --------------------------------------------------------

    const names = [];

    for (
        const [name, value]
        of Object.entries(review)
    ) {

        if (
            value?.decision ===
            "SIN_MATCH" ||
            value?.decision ===
            "AMBIGUO"
        ) {

            names.push(name);
        }
    }

    console.log(
        `📚 Series en review: ${names.length}`
    );

    // --------------------------------------------------------
    // PROGRESS
    // --------------------------------------------------------

    const progress =
        await loadProgress();

    const pending =
        names.filter(
            name =>
                !progress[name]
        );

    console.log(
        `♻️ Ya procesadas: ${
            names.length -
            pending.length
        }`
    );

    console.log(
        `⏳ Pendientes: ${
            pending.length
        }`
    );

    // --------------------------------------------------------
    // WORKERS
    // --------------------------------------------------------

    const queue = [...pending];

    const workers = [];

    for (
        let i = 0;
        i < CONCURRENCY;
        i++
    ) {

        workers.push(
            worker(
                queue,
                progress,
                seriesData
            )
        );
    }

    await Promise.all(
        workers
    );

    // --------------------------------------------------------
    // FINAL OUTPUT
    // --------------------------------------------------------

    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(
            progress,
            null,
            2
        ),
        "utf8"
    );

    // --------------------------------------------------------
    // STATS
    // --------------------------------------------------------

    const stats = {
        MATCH_FUERTE: 0,
        MATCH_PROBABLE: 0,
        AMBIGUO: 0,
        SIN_MATCH: 0,
        ERROR: 0
    };

    for (
        const result
        of Object.values(progress)
    ) {

        if (
            stats[result.decision]
            !== undefined
        ) {

            stats[result.decision]++;
        }
    }

    console.log("\n======================================");
    console.log("✅ V6 MASIVA TERMINADA");
    console.log("======================================");

    console.log(
        `🟢 MATCH FUERTE: ${stats.MATCH_FUERTE}`
    );

    console.log(
        `🟡 MATCH PROBABLE: ${stats.MATCH_PROBABLE}`
    );

    console.log(
        `🟠 AMBIGUO: ${stats.AMBIGUO}`
    );

    console.log(
        `🔴 SIN MATCH: ${stats.SIN_MATCH}`
    );

    console.log(
        `⚠️ ERROR: ${stats.ERROR}`
    );

    console.log(
        `\n📄 Resultado: ${OUTPUT_FILE}`
    );

    console.log(
        `💾 Progreso: ${PROGRESS_FILE}`
    );
}


main();