import fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();


const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
    console.error("❌ Falta TMDB_API_KEY");
    process.exit(1);
}

const SERIES_FILE = "./data/series-parsed.json";
const OUTPUT_FILE = "./data/series-matching-v6-test.json";

const LANGUAGES = [
    "es-AR",
    "es-MX",
    "es-ES",
    "en-US"
];

const TEST_SERIES = [
    "El Mentalista",
    "El juego del calamar",
    "Los Simpson",
    "Fundacion",
    "My Hero Academia / Boku no Hero Academia",
    "Juego de tronos / Game of Thrones"
];

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));


// ============================================================
// NORMALIZACIÓN
// ============================================================

function normalizeTitle(title) {
    return title
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}


// ============================================================
// VARIANTES DEL TÍTULO
// ============================================================

function getTitleVariants(name) {
    return name
        .split("/")
        .map(title => title.trim())
        .filter(Boolean);
}


// ============================================================
// REQUEST TMDB
// ============================================================

async function tmdb(path, params = {}, retries = 3) {

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

    for (let attempt = 1; attempt <= retries; attempt++) {

        try {

            const response = await fetch(url);

            if (response.status === 429) {

                const retryAfter =
                    Number(response.headers.get("retry-after")) || 2;

                console.log(
                    `⏳ Rate limit. Esperando ${retryAfter}s...`
                );

                await sleep(retryAfter * 1000);
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
                `⚠️ Error TMDB. Reintento ${attempt}/${retries}`
            );

            await sleep(1000 * attempt);
        }
    }
}


// ============================================================
// BUSCAR SERIES
// ============================================================

async function searchSeries(title) {

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

    return [...candidates.values()];
}


// ============================================================
// TRANSLACIONES
// ============================================================

async function getTranslations(id) {

    const data = await tmdb(
        `/tv/${id}/translations`
    );

    return data.translations || [];
}


// ============================================================
// TODOS LOS TÍTULOS CONOCIDOS DE TMDB
// ============================================================

async function getCandidateTitles(candidate) {

    const titles = new Set();

    if (candidate.name) {
        titles.add(candidate.name);
    }

    if (candidate.original_name) {
        titles.add(candidate.original_name);
    }

    const translations = await getTranslations(
        candidate.id
    );

    for (const translation of translations) {

        const name =
            translation?.data?.name;

        const originalName =
            translation?.data?.original_name;

        if (name) {
            titles.add(name);
        }

        if (originalName) {
            titles.add(originalName);
        }
    }

    return [...titles];
}


// ============================================================
// ESTRUCTURA DE TMDB
// ============================================================

async function getStructure(id) {

    const details = await tmdb(
        `/tv/${id}`
    );

    const structure = {};

    for (const season of details.seasons || []) {

        if (
            season.season_number === 0 ||
            season.episode_count === 0
        ) {
            continue;
        }

        const seasonNumber =
            season.season_number;

        const seasonData = await tmdb(
            `/tv/${id}/season/${seasonNumber}`
        );

        structure[seasonNumber] =
            (seasonData.episodes || []).length;
    }

    return structure;
}


// ============================================================
// ESTRUCTURA M3U
// ============================================================

function getM3UStructure(series) {

    const structure = {};

    for (const [seasonNumber, season] of Object.entries(
        series.seasons || {}
    )) {

        structure[seasonNumber] =
            Object.keys(
                season.episodes || {}
            ).length;
    }

    return structure;
}


// ============================================================
// COMPARAR ESTRUCTURAS
// ============================================================

function compareStructure(
    m3uStructure,
    tmdbStructure
) {

    const m3uSeasons =
        Object.keys(m3uStructure)
            .map(Number)
            .sort((a, b) => a - b);

    const tmdbSeasons =
        Object.keys(tmdbStructure)
            .map(Number)
            .sort((a, b) => a - b);

    const sameSeasonSet =
        JSON.stringify(m3uSeasons) ===
        JSON.stringify(tmdbSeasons);

    let expectedEpisodes = 0;
    let matchingEpisodes = 0;

    for (const season of m3uSeasons) {

        const m3uEpisodes =
            m3uStructure[season] || 0;

        const tmdbEpisodes =
            tmdbStructure[season] || 0;

        expectedEpisodes += m3uEpisodes;

        matchingEpisodes += Math.min(
            m3uEpisodes,
            tmdbEpisodes
        );
    }

    const episodeRatio =
        expectedEpisodes === 0
            ? 0
            : matchingEpisodes / expectedEpisodes;

    const exactStructure =
        sameSeasonSet &&
        m3uSeasons.every(
            season =>
                m3uStructure[season] ===
                tmdbStructure[season]
        );

    return {
        sameSeasonSet,
        exactStructure,
        expectedEpisodes,
        matchingEpisodes,
        episodeRatio
    };
}


// ============================================================
// COMPARAR TÍTULOS
// ============================================================

function matchTitles(
    m3uVariants,
    tmdbTitles
) {

    const normalizedM3U =
        m3uVariants.map(normalizeTitle);

    const normalizedTMDB =
        tmdbTitles.map(normalizeTitle);

    const matches = [];

    for (let i = 0; i < normalizedM3U.length; i++) {

        for (let j = 0; j < normalizedTMDB.length; j++) {

            if (
                normalizedM3U[i] &&
                normalizedM3U[i] === normalizedTMDB[j]
            ) {

                matches.push({
                    m3uTitle: m3uVariants[i],
                    tmdbTitle: tmdbTitles[j]
                });
            }
        }
    }

    return matches;
}


// ============================================================
// SCORE
// ============================================================

function calculateScore({
    titleMatch,
    structure
}) {

    let score = 0;

    if (titleMatch) {
        score += 50;
    }

    if (structure.exactStructure) {
        score += 50;
    } else if (structure.sameSeasonSet) {
        score += 15;
    } else if (structure.episodeRatio >= 0.95) {
        score += 25;
    } else if (structure.episodeRatio >= 0.80) {
        score += 15;
    }

    return score;
}


// ============================================================
// ANALIZAR UNA SERIE
// ============================================================

async function analyzeSeries(
    seriesName,
    series
) {

    console.log("\n======================================");
    console.log(`🔎 ${seriesName}`);
    console.log("======================================");

    const variants =
        getTitleVariants(seriesName);

    console.log(
        `🔤 Variantes: ${variants.join(" | ")}`
    );

    const m3uStructure =
        getM3UStructure(series);

    console.log(
        "📦 M3U:",
        m3uStructure
    );

    const candidateMap = new Map();

    // --------------------------------------------------------
    // BUSCAR TODAS LAS VARIANTES
    // --------------------------------------------------------

    for (const variant of variants) {

        console.log(
            `🔍 Buscando: "${variant}"`
        );

        const candidates =
            await searchSeries(variant);

        for (const candidate of candidates) {

            if (!candidateMap.has(candidate.id)) {

                candidateMap.set(
                    candidate.id,
                    {
                        candidate,
                        searchedWith: [variant]
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
        `📚 Candidatos encontrados: ${candidateMap.size}`
    );

    const results = [];

    // --------------------------------------------------------
    // ANALIZAR CANDIDATOS
    // --------------------------------------------------------

    for (const {
        candidate,
        searchedWith
    } of candidateMap.values()) {

        console.log(
            `\n➡️ TMDB ${candidate.id} - ${candidate.name}`
        );

        const tmdbTitles =
            await getCandidateTitles(candidate);

        const titleMatches =
            matchTitles(
                variants,
                tmdbTitles
            );

        const titleMatch =
            titleMatches.length > 0;

        if (titleMatch) {

            console.log(
                `   ✅ Título coincide:`,
                titleMatches
            );

        } else {

            console.log(
                `   ⚪ Sin coincidencia exacta de título`
            );
        }

        const tmdbStructure =
            await getStructure(candidate.id);

        const structure =
            compareStructure(
                m3uStructure,
                tmdbStructure
            );

        console.log(
            `   📺 TMDB:`,
            tmdbStructure
        );

        console.log(
            `   📊 Episodios: ${
                structure.matchingEpisodes
            }/${
                structure.expectedEpisodes
            } (${(
                structure.episodeRatio * 100
            ).toFixed(1)}%)`
        );

        console.log(
            `   🧩 Temporadas iguales: ${
                structure.sameSeasonSet
            }`
        );

        console.log(
            `   🎯 Estructura exacta: ${
                structure.exactStructure
            }`
        );

        const score =
            calculateScore({
                titleMatch,
                structure
            });

        results.push({

            tmdbId: candidate.id,

            name: candidate.name,

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

            score
        });

        await sleep(150);
    }

    // --------------------------------------------------------
    // ORDENAR
    // --------------------------------------------------------

    results.sort(
        (a, b) => b.score - a.score
    );

    // --------------------------------------------------------
    // CLASIFICAR
    // --------------------------------------------------------

    let decision = "SIN_MATCH";

    if (results.length > 0) {

        const exact =
            results.filter(
                r =>
                    r.titleMatch &&
                    r.exactStructure
            );

        if (exact.length === 1) {

            decision = "MATCH_FUERTE";

        } else if (exact.length > 1) {

            decision = "AMBIGUO";

        } else {

            const probable =
                results.filter(
                    r =>
                        r.titleMatch &&
                        r.episodeRatio >= 0.8
                );

            if (probable.length === 1) {

                decision = "MATCH_PROBABLE";

            } else if (probable.length > 1) {

                decision = "AMBIGUO";

            } else {

                decision = "AMBIGUO";
            }
        }
    }

    console.log("\n--------------------------------------");

    if (decision === "MATCH_FUERTE") {

        const match = results[0];

        console.log(
            `🟢 MATCH FUERTE`
        );

        console.log(
            `TMDB: ${match.tmdbId} - ${match.name}`
        );

        console.log(
            `Score: ${match.score}`
        );

    } else if (decision === "MATCH_PROBABLE") {

        console.log(
            `🟡 MATCH PROBABLE`
        );

        console.log(
            `TMDB: ${results[0].tmdbId} - ${results[0].name}`
        );

    } else {

        console.log(
            `🟠 ${decision}`
        );

        console.log(
            "\nTop candidatos:"
        );

        for (
            const result of results.slice(0, 5)
        ) {

            console.log(
                `  ${result.tmdbId} | ` +
                `${result.name} | ` +
                `score=${result.score} | ` +
                `eps=${(
                    result.episodeRatio * 100
                ).toFixed(1)}% | ` +
                `title=${result.titleMatch} | ` +
                `structure=${result.exactStructure}`
            );
        }
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
// MAIN
// ============================================================

async function main() {

    console.log(
        "🚀 Iniciando TEST SERIES MATCHING V6"
    );

    const data =
        JSON.parse(
            await fs.readFile(
                SERIES_FILE,
                "utf8"
            )
        );

    const output = {};

    for (const seriesName of TEST_SERIES) {

        const series =
            data[seriesName];

        if (!series) {

            console.log(
                `\n⚠️ No encontrada en M3U: ${seriesName}`
            );

            output[seriesName] = {
                decision: "NO_EN_M3U"
            };

            continue;
        }

        try {

            output[seriesName] =
                await analyzeSeries(
                    seriesName,
                    series
                );

        } catch (error) {

            console.error(
                `❌ Error con ${seriesName}:`,
                error.message
            );

            output[seriesName] = {
                decision: "ERROR",
                error: error.message
            };
        }
    }

    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(
            output,
            null,
            2
        ),
        "utf8"
    );

    console.log("\n======================================");
    console.log("✅ V6 TERMINADA");
    console.log("======================================");

    console.log(
        `📄 Resultado: ${OUTPUT_FILE}`
    );
}


main();