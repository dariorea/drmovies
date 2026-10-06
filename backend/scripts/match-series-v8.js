import fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config()

const API_KEY = process.env.TMDB_API_KEY;

const SERIES_FILE = "./data/series-parsed.json";
const REVIEW_FILE = "./data/series-tmdb-final-review.json";
const OUTPUT_FILE = "./data/series-tmdb-v8-review.json";

const LANGUAGES = [
    "es-AR",
    "es-MX",
    "es-ES",
    "en-US"
];

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));


// ======================================================
// NORMALIZACIÓN
// ======================================================

function normalizeTitle(title) {
    return title
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "";
}


function splitTitleVariants(title) {
    return title
        .split("/")
        .map(x => x.trim())
        .filter(Boolean);
}


// ======================================================
// ESTRUCTURA M3U
// ======================================================

function getM3UStructure(series) {
    const result = {};

    for (const [seasonNumber, season] of Object.entries(
        series.seasons || {}
    )) {
        result[Number(seasonNumber)] =
            Object.keys(season.episodes || {}).length;
    }

    return result;
}


function totalEpisodes(structure) {
    return Object.values(structure)
        .reduce((sum, n) => sum + n, 0);
}


// ======================================================
// COMPARACIÓN DE EPISODIOS
// ======================================================

function episodeOverlap(
    m3uStructure,
    tmdbStructure
) {
    let matched = 0;
    let totalM3U = 0;

    for (const [season, count] of Object.entries(
        m3uStructure
    )) {
        const tmdbCount =
            tmdbStructure[Number(season)] || 0;

        matched += Math.min(
            count,
            tmdbCount
        );

        totalM3U += count;
    }

    return totalM3U
        ? matched / totalM3U
        : 0;
}


// ======================================================
// TEMPORADAS
// ======================================================

function seasonOverlap(
    m3uStructure,
    tmdbStructure
) {
    const m3uSeasons =
        Object.keys(m3uStructure)
            .map(Number);

    if (!m3uSeasons.length) {
        return 0;
    }

    let matched = 0;

    for (const season of m3uSeasons) {
        if (tmdbStructure[season]) {
            matched++;
        }
    }

    return matched / m3uSeasons.length;
}


// ======================================================
// AÑO
// ======================================================

function extractYear(text) {
    const match =
        text?.match(/\b(19|20)\d{2}\b/);

    return match
        ? Number(match[0])
        : null;
}


// ======================================================
// TMDB
// ======================================================

async function tmdb(
    endpoint,
    params = {},
    retries = 3
) {
    const url = new URL(
        `https://api.themoviedb.org/3${endpoint}`
    );

    url.searchParams.set(
        "api_key",
        API_KEY
    );

    for (const [key, value] of Object.entries(
        params
    )) {
        if (
            value !== undefined &&
            value !== null
        ) {
            url.searchParams.set(
                key,
                value
            );
        }
    }

    for (
        let attempt = 1;
        attempt <= retries;
        attempt++
    ) {
        try {
            const response =
                await fetch(url);

            if (response.status === 429) {
                console.log(
                    "⏳ Rate limit TMDB..."
                );

                await sleep(
                    2000 * attempt
                );

                continue;
            }

            if (!response.ok) {
                throw new Error(
                    `TMDB ${response.status} ${endpoint}`
                );
            }

            return await response.json();

        } catch (error) {
            if (
                attempt === retries
            ) {
                throw error;
            }

            await sleep(
                1000 * attempt
            );
        }
    }
}


// ======================================================
// CACHE
// ======================================================

const cache = new Map();

async function cached(
    endpoint,
    params = {}
) {
    const key =
        endpoint +
        JSON.stringify(params);

    if (cache.has(key)) {
        return cache.get(key);
    }

    const result =
        await tmdb(
            endpoint,
            params
        );

    cache.set(
        key,
        result
    );

    return result;
}


// ======================================================
// DATOS TMDB
// ======================================================

async function getTV(id) {
    return cached(
        `/tv/${id}`,
        {
            language: "en-US"
        }
    );
}


async function getTranslations(id) {
    const data =
        await cached(
            `/tv/${id}/translations`
        );

    return data.translations || [];
}


async function getSeason(
    id,
    season
) {
    return cached(
        `/tv/${id}/season/${season}`,
        {
            language: "en-US"
        }
    );
}


async function getStructure(
    id,
    numberOfSeasons
) {
    const structure = {};

    /*
     * No consultamos infinitas temporadas.
     * 30 es suficiente para las series
     * que tenemos en la M3U.
     */

    const maxSeasons =
        Math.min(
            numberOfSeasons,
            30
        );

    for (
        let season = 1;
        season <= maxSeasons;
        season++
    ) {
        try {
            const data =
                await getSeason(
                    id,
                    season
                );

            structure[season] =
                data.episodes?.length || 0;

        } catch {
            // Ignorar temporadas con errores
        }
    }

    return structure;
}


// ======================================================
// TÍTULOS TMDB
// ======================================================

function getKnownTitles(
    tv,
    translations
) {
    const titles = new Set();

    if (tv.name) {
        titles.add(
            normalizeTitle(
                tv.name
            )
        );
    }

    if (tv.original_name) {
        titles.add(
            normalizeTitle(
                tv.original_name
            )
        );
    }

    for (const translation of translations) {
        if (translation.name) {
            titles.add(
                normalizeTitle(
                    translation.name
                )
            );
        }
    }

    return titles;
}


function titleMatches(
    variants,
    tv,
    translations
) {
    const knownTitles =
        getKnownTitles(
            tv,
            translations
        );

    const matches = [];

    for (const variant of variants) {
        const normalized =
            normalizeTitle(
                variant
            );

        if (
            knownTitles.has(
                normalized
            )
        ) {
            matches.push(
                variant
            );
        }
    }

    return matches;
}


// ======================================================
// SCORE
// ======================================================

function scoreCandidate({
    titleMatch,
    episodeRatio,
    seasonRatio,
    m3uTotal,
    tmdbTotal,
    m3uYear,
    tmdbYear,
    exactStructure,
    sameSeasonSet
}) {
    let score = 0;

    // ----------------------------------------------
    // TÍTULO
    // ----------------------------------------------

    if (titleMatch) {
        score += 50;
    }


    // ----------------------------------------------
    // EPISODIOS
    // ----------------------------------------------

    score += Math.round(
        episodeRatio * 25
    );


    // ----------------------------------------------
    // TEMPORADAS
    // ----------------------------------------------

    score += Math.round(
        seasonRatio * 10
    );


    // ----------------------------------------------
    // ESTRUCTURA EXACTA
    // ----------------------------------------------

    if (exactStructure) {
        score += 10;
    }


    if (sameSeasonSet) {
        score += 3;
    }


    // ----------------------------------------------
    // TOTAL DE EPISODIOS
    // ----------------------------------------------

    if (
        m3uTotal > 0 &&
        tmdbTotal > 0
    ) {
        const ratio =
            Math.min(
                m3uTotal,
                tmdbTotal
            ) /
            Math.max(
                m3uTotal,
                tmdbTotal
            );

        score += Math.round(
            ratio * 5
        );
    }


    // ----------------------------------------------
    // AÑO
    // ----------------------------------------------

    if (
        m3uYear &&
        tmdbYear
    ) {
        const difference =
            Math.abs(
                m3uYear -
                tmdbYear
            );

        if (difference === 0) {
            score += 15;

        } else if (difference === 1) {
            score += 8;

        } else if (difference <= 3) {
            score += 3;
        }
    }


    return score;
}


// ======================================================
// CONFIANZA
// ======================================================

function getConfidence(
    score,
    secondScore
) {
    const difference =
        score -
        secondScore;

    if (
        score >= 90 &&
        difference >= 15
    ) {
        return "MUY_FUERTE";
    }

    if (
        score >= 75 &&
        difference >= 10
    ) {
        return "FUERTE";
    }

    if (
        score >= 65 &&
        difference >= 7
    ) {
        return "PROBABLE";
    }

    return "REVISAR";
}


// ======================================================
// BÚSQUEDA TMDB
// ======================================================

async function searchCandidates(
    variants
) {
    const candidates =
        new Map();

    for (const variant of variants) {

        for (const language of LANGUAGES) {

            try {
                const data =
                    await cached(
                        "/search/tv",
                        {
                            query: variant,
                            language,
                            include_adult: false,
                            page: 1
                        }
                    );

                for (
                    const result of
                    data.results || []
                ) {
                    if (
                        !candidates.has(
                            result.id
                        )
                    ) {
                        candidates.set(
                            result.id,
                            result
                        );
                    }
                }

            } catch (error) {
                console.log(
                    `⚠️ Error búsqueda "${variant}":`,
                    error.message
                );
            }
        }
    }

    return [
        ...candidates.values()
    ];
}


// ======================================================
// CANDIDATOS EXISTENTES DEL V6
// ======================================================

function getExistingCandidates(
    reviewItem
) {
    if (
        Array.isArray(
            reviewItem.allCandidates
        )
    ) {
        return reviewItem.allCandidates;
    }

    return [];
}


// ======================================================
// PROCESAR SERIE
// ======================================================

async function processSeries(
    name,
    series,
    reviewItem
) {
    const variants =
        splitTitleVariants(name);

    const m3uStructure =
        getM3UStructure(series);

    const m3uTotal =
        totalEpisodes(
            m3uStructure
        );

    const m3uYear =
        extractYear(name) ||
        extractYear(
            series.groupTitle || ""
        );


    console.log(
        `\n🔎 ${name}`
    );

    console.log(
        `   📺 M3U: ${m3uTotal} episodios`
    );

    console.log(
        `   🗂️ Estructura:`,
        JSON.stringify(
            m3uStructure
        )
    );


    // --------------------------------------------------
    // Primero usamos candidatos que ya consiguió V6
    // --------------------------------------------------

    let candidates =
        getExistingCandidates(
            reviewItem
        );


    /*
     * Si no tenemos candidatos,
     * hacemos una búsqueda nueva.
     */

    if (!candidates.length) {

        console.log(
            "   🔍 Buscando candidatos nuevos..."
        );

        candidates =
            await searchCandidates(
                variants
            );
    }


    const scored = [];


    // --------------------------------------------------
    // Evaluar candidatos
    // --------------------------------------------------

    for (
        const candidate
        of candidates
    ) {

        try {

            const id =
                candidate.tmdbId ||
                candidate.id;


            if (!id) {
                continue;
            }


            const tv =
                await getTV(id);


            const translations =
                await getTranslations(
                    id
                );


            const matches =
                titleMatches(
                    variants,
                    tv,
                    translations
                );


            /*
             * IMPORTANTE:
             *
             * No descartamos candidatos
             * solamente porque titleMatch
             * sea false.
             *
             * Esto permite investigar casos
             * como traducciones raras,
             * títulos alternativos o nombres
             * del proveedor.
             */

            const titleMatch =
                matches.length > 0;


            const numberOfSeasons =
                tv.number_of_seasons ||
                0;


            const tmdbStructure =
                await getStructure(
                    id,
                    numberOfSeasons
                );


            const tmdbTotal =
                totalEpisodes(
                    tmdbStructure
                );


            const episodeRatio =
                episodeOverlap(
                    m3uStructure,
                    tmdbStructure
                );


            const seasonRatio =
                seasonOverlap(
                    m3uStructure,
                    tmdbStructure
                );


            const m3uSeasons =
                Object.keys(
                    m3uStructure
                )
                    .map(Number)
                    .sort(
                        (a, b) => a - b
                    );


            const tmdbSeasons =
                Object.keys(
                    tmdbStructure
                )
                    .map(Number)
                    .sort(
                        (a, b) => a - b
                    );


            const sameSeasonSet =
                JSON.stringify(
                    m3uSeasons
                ) ===
                JSON.stringify(
                    tmdbSeasons
                );


            const exactStructure =
                sameSeasonSet &&
                m3uSeasons.every(
                    season =>
                        m3uStructure[
                            season
                        ] ===
                        tmdbStructure[
                            season
                        ]
                );


            const tmdbYear =
                tv.first_air_date
                    ? Number(
                        tv.first_air_date
                            .slice(0, 4)
                    )
                    : null;


            const score =
                scoreCandidate({
                    titleMatch,
                    episodeRatio,
                    seasonRatio,
                    m3uTotal,
                    tmdbTotal,
                    m3uYear,
                    tmdbYear,
                    exactStructure,
                    sameSeasonSet
                });


            scored.push({

                tmdbId: id,

                name:
                    tv.name ||
                    candidate.name ||
                    null,

                originalName:
                    tv.original_name ||
                    candidate.originalName ||
                    null,

                firstAirDate:
                    tv.first_air_date ||
                    candidate.firstAirDate ||
                    null,

                originCountry:
                    tv.origin_country ||
                    [],

                numberOfSeasons,

                numberOfEpisodes:
                    tv.number_of_episodes ||
                    0,

                m3uStructure,

                tmdbStructure,

                m3uTotal,

                tmdbTotal,

                episodeRatio,

                seasonRatio,

                sameSeasonSet,

                exactStructure,

                titleMatch,

                titleMatches:
                    matches,

                score,

                posterPath:
                    tv.poster_path ||
                    null,

                overview:
                    tv.overview ||
                    null,

                networks:
                    tv.networks?.map(
                        network =>
                            network.name
                    ) || []

            });

        } catch (error) {

            console.log(
                `⚠️ Error candidato ${
                    candidate.tmdbId ||
                    candidate.id
                }:`,
                error.message
            );
        }
    }


    // --------------------------------------------------
    // Ordenar
    // --------------------------------------------------

    scored.sort(
        (a, b) =>
            b.score -
            a.score
    );


    const top =
        scored[0] ||
        null;


    const second =
        scored[1] ||
        null;


    if (!top) {

        console.log(
            "   ❌ Sin candidatos"
        );

        return {
            seriesName: name,

            decision:
                "SIN_CANDIDATO",

            m3uStructure,

            m3uTotal,

            variants,

            candidates: []
        };
    }


    const confidence =
        getConfidence(
            top.score,
            second?.score || 0
        );


    console.log(
        `   🏆 ${top.tmdbId} - ${top.name}`
    );

    console.log(
        `   📅 ${top.firstAirDate || "sin fecha"}`
    );

    console.log(
        `   📊 Score: ${top.score}`
    );

    console.log(
        `   🎬 Episodios: ${
            Math.round(
                top.episodeRatio * 100
            )
        }%`
    );

    console.log(
        `   🗂️ Temporadas: ${
            Math.round(
                top.seasonRatio * 100
            )
        }%`
    );

    console.log(
        `   🎯 ${confidence}`
    );


    if (second) {

        console.log(
            `   🥈 ${
                second.tmdbId
            } - ${
                second.name
            } (${second.score})`
        );
    }


    return {

        seriesName:
            name,

        decision:
            confidence,

        m3uStructure,

        m3uTotal,

        m3uYear,

        variants,

        bestMatch:
            top,

        secondMatch:
            second || null,

        candidates:
            scored.slice(
                0,
                10
            )
    };
}


// ======================================================
// MAIN
// ======================================================

async function main() {

    if (!API_KEY) {
        throw new Error(
            "❌ Falta TMDB_API_KEY"
        );
    }


    console.log(
        "🚀 MATCH SERIES V8"
    );


    // --------------------------------------------------
    // Cargar M3U
    // --------------------------------------------------

    const seriesData =
        JSON.parse(
            await fs.readFile(
                SERIES_FILE,
                "utf8"
            )
        );


    // --------------------------------------------------
    // Cargar review V7
    // --------------------------------------------------

    const review =
        JSON.parse(
            await fs.readFile(
                REVIEW_FILE,
                "utf8"
            )
        );


    // --------------------------------------------------
    // Buscar pendientes
    // --------------------------------------------------

    const pending =
        Object.values(
            review
        ).filter(
            item =>
                item.decision ===
                    "AMBIGUO" ||
                item.decision ===
                    "SIN_MATCH"
        );


    console.log(
        `📦 Pendientes: ${pending.length}`
    );


    const results = [];


    let index = 0;


    // --------------------------------------------------
    // Procesamiento secuencial
    // --------------------------------------------------

    for (
        const reviewItem
        of pending
    ) {

        index++;


        const name =
            reviewItem.seriesName;


        const series =
            seriesData[name];


        console.log(
            `\n[${index}/${pending.length}]`
        );


        if (!series) {

            console.log(
                `⚠️ No existe en M3U: ${name}`
            );

            continue;
        }


        try {

            const result =
                await processSeries(
                    name,
                    series,
                    reviewItem
                );


            results.push(
                result
            );


            // ------------------------------------------
            // Guardar progreso
            // ------------------------------------------

            await fs.writeFile(
                OUTPUT_FILE,
                JSON.stringify(
                    results,
                    null,
                    2
                )
            );

        } catch (error) {

            console.log(
                `❌ ${name}:`,
                error.message
            );
        }
    }


    // ==================================================
    // ESTADÍSTICAS
    // ==================================================

    const stats = {

        MUY_FUERTE: 0,

        FUERTE: 0,

        PROBABLE: 0,

        REVISAR: 0,

        SIN_CANDIDATO: 0
    };


    for (
        const result
        of results
    ) {

        if (
            stats[result.decision]
            !== undefined
        ) {
            stats[
                result.decision
            ]++;
        }
    }


    console.log(
        "\n======================================"
    );

    console.log(
        "✅ V8 TERMINADO"
    );

    console.log(
        "======================================"
    );

    console.log(
        `📚 Procesadas: ${results.length}`
    );

    console.log(
        `🟢 MUY FUERTE: ${stats.MUY_FUERTE}`
    );

    console.log(
        `🟢 FUERTE: ${stats.FUERTE}`
    );

    console.log(
        `🟡 PROBABLE: ${stats.PROBABLE}`
    );

    console.log(
        `🟠 REVISAR: ${stats.REVISAR}`
    );

    console.log(
        `🔴 SIN CANDIDATO: ${stats.SIN_CANDIDATO}`
    );

    console.log(
        `\n📄 ${OUTPUT_FILE}`
    );
}


main().catch(error => {

    console.error(
        "\n❌ ERROR FATAL:"
    );

    console.error(
        error
    );

    process.exit(1);
});