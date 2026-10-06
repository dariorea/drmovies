import fs from "fs/promises";
import dotenv from "dotenv"

dotenv.config()

const API_KEY = process.env.TMDB_API_KEY;

const PENDING_FILE =
    "./data/series-extra-v9-pending.json";

const OUTPUT_FILE =
    "./data/series-extra-v9-matches.json";

const PROGRESS_FILE =
    "./data/series-extra-v9-progress.json";

const LANGUAGES = [
    "es-AR",
    "es-MX",
    "es-ES",
    "en-US"
];

const CONCURRENCY = 3;

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));


// ======================================================
// NORMALIZACIÓN
// ======================================================

function normalizeTitle(title) {
    return (
        title
            ?.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
        || ""
    );
}


function splitTitleVariants(title) {

    return title
        .split("/")
        .map(x => x.trim())
        .filter(Boolean);
}


function extractYear(text) {

    const match =
        text?.match(/\b(19|20)\d{2}\b/);

    return match
        ? Number(match[0])
        : null;
}


// ======================================================
// ESTRUCTURA
// ======================================================

function totalEpisodes(structure) {

    return Object.values(structure)
        .reduce(
            (sum, count) =>
                sum + count,
            0
        );
}


function getM3UStructure(series) {

    const structure = {};

    for (
        const [season, data]
        of Object.entries(
            series.seasons || {}
        )
    ) {

        structure[Number(season)] =
            Object.keys(
                data.episodes || {}
            ).length;
    }

    return structure;
}


function getSeasonNumbers(structure) {

    return Object.keys(structure)
        .map(Number)
        .sort(
            (a, b) => a - b
        );
}


function sameSeasonSet(
    a,
    b
) {

    return JSON.stringify(
        getSeasonNumbers(a)
    ) === JSON.stringify(
        getSeasonNumbers(b)
    );
}


function exactStructure(
    m3uStructure,
    tmdbStructure
) {

    if (
        !sameSeasonSet(
            m3uStructure,
            tmdbStructure
        )
    ) {
        return false;
    }

    for (
        const season
        of getSeasonNumbers(
            m3uStructure
        )
    ) {

        if (
            m3uStructure[season] !==
            tmdbStructure[season]
        ) {

            return false;
        }
    }

    return true;
}


function episodeOverlap(
    m3uStructure,
    tmdbStructure
) {

    let matching = 0;
    let expected = 0;

    for (
        const [season, count]
        of Object.entries(
            m3uStructure
        )
    ) {

        expected += count;

        const tmdbCount =
            tmdbStructure[
                Number(season)
            ] || 0;

        matching += Math.min(
            count,
            tmdbCount
        );
    }

    return expected
        ? matching / expected
        : 0;
}


function seasonOverlap(
    m3uStructure,
    tmdbStructure
) {

    const seasons =
        getSeasonNumbers(
            m3uStructure
        );

    if (!seasons.length) {
        return 0;
    }

    let matching = 0;

    for (const season of seasons) {

        if (
            tmdbStructure[season]
        ) {
            matching++;
        }
    }

    return matching / seasons.length;
}


// ======================================================
// TMDB
// ======================================================

async function tmdb(
    endpoint,
    params = {},
    retries = 4
) {

    const url = new URL(
        `https://api.themoviedb.org/3${endpoint}`
    );

    url.searchParams.set(
        "api_key",
        API_KEY
    );

    for (
        const [key, value]
        of Object.entries(params)
    ) {

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


            if (
                response.status === 429
            ) {

                const wait =
                    2500 * attempt;

                console.log(
                    `⏳ Rate limit. Esperando ${wait}ms...`
                );

                await sleep(wait);

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

const cache =
    new Map();


async function cached(
    endpoint,
    params = {}
) {

    const key =
        endpoint +
        JSON.stringify(params);

    if (
        cache.has(key)
    ) {

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

    const max =
        Math.min(
            numberOfSeasons || 0,
            30
        );

    for (
        let season = 1;
        season <= max;
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
            // Ignorar temporada con error
        }
    }

    return structure;
}


// ======================================================
// TITULOS
// ======================================================

function getKnownTitles(
    tv,
    translations
) {

    const titles =
        new Set();

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


    for (
        const translation
        of translations
    ) {

        const candidates = [
            translation.name,
            translation.data?.name
        ];

        for (
            const title
            of candidates
        ) {

            if (title) {

                titles.add(
                    normalizeTitle(
                        title
                    )
                );
            }
        }
    }

    return titles;
}


function getTitleMatches(
    variants,
    tv,
    translations
) {

    const known =
        getKnownTitles(
            tv,
            translations
        );

    const matches = [];

    for (
        const variant
        of variants
    ) {

        const normalized =
            normalizeTitle(
                variant
            );

        if (
            known.has(
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
    exact,
    sameSeasons,
    m3uTotal,
    tmdbTotal,
    m3uYear,
    tmdbYear
}) {

    let score = 0;


    // --------------------------------------------
    // Título
    // --------------------------------------------

    if (titleMatch) {
        score += 60;
    }


    // --------------------------------------------
    // Episodios
    // --------------------------------------------

    score += Math.round(
        episodeRatio * 20
    );


    // --------------------------------------------
    // Temporadas
    // --------------------------------------------

    score += Math.round(
        seasonRatio * 8
    );


    // --------------------------------------------
    // Estructura
    // --------------------------------------------

    if (exact) {
        score += 10;
    }

    if (sameSeasons) {
        score += 2;
    }


    // --------------------------------------------
    // Total episodios
    // --------------------------------------------

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


    // --------------------------------------------
    // Año
    // --------------------------------------------

    if (
        m3uYear &&
        tmdbYear
    ) {

        const diff =
            Math.abs(
                m3uYear -
                tmdbYear
            );

        if (diff === 0) {

            score += 10;

        } else if (diff === 1) {

            score += 5;

        } else if (diff <= 3) {

            score += 2;
        }
    }


    return score;
}


// ======================================================
// CONFIANZA
// ======================================================

function getDecision(
    score,
    secondScore
) {

    const difference =
        score - secondScore;


    if (
        score >= 95 &&
        difference >= 20
    ) {

        return "MATCH_FUERTE";
    }


    if (
        score >= 82 &&
        difference >= 12
    ) {

        return "MATCH_PROBABLE";
    }


    return "REVISAR";
}


// ======================================================
// BUSCAR CANDIDATOS
// ======================================================

async function searchCandidates(
    variants
) {

    const candidates =
        new Map();


    for (
        const variant
        of variants
    ) {

        for (
            const language
            of LANGUAGES
        ) {

            try {

                const data =
                    await cached(
                        "/search/tv",
                        {
                            query: variant,
                            language,
                            page: 1,
                            include_adult: false
                        }
                    );


                for (
                    const result
                    of data.results || []
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
                    `⚠️ Error buscando "${variant}" [${language}]:`,
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
// PROCESAR UNA SERIE
// ======================================================

async function processSeries(
    item
) {

    const name =
        item.seriesName;

    const variants =
        splitTitleVariants(
            name
        );


    const m3uStructure =
        item.m3uStructure;

    const m3uTotal =
        item.totalEpisodes;


    const m3uYear =
        extractYear(name) ||
        extractYear(
            item.groupTitle || ""
        );


    console.log(
        `\n🔎 ${name}`
    );


    const candidates =
        await searchCandidates(
            variants
        );


    if (!candidates.length) {

        console.log(
            "   ❌ Sin candidatos TMDB"
        );

        return {
            seriesName: name,
            groupTitle:
                item.groupTitle || null,
            logo:
                item.logo || null,
            m3uStructure,
            m3uTotal,
            m3uYear,
            decision:
                "SIN_CANDIDATO",
            candidates: []
        };
    }


    const scored = [];


    /*
     * Evaluamos candidatos.
     *
     * Para no hacer un número absurdo
     * de requests, primero limitamos
     * a los 30 resultados más relevantes
     * de la búsqueda.
     */

    const limited =
        candidates
            .sort(
                (a, b) =>
                    (b.popularity || 0) -
                    (a.popularity || 0)
            )
            .slice(0, 30);


    for (
        const candidate
        of limited
    ) {

        try {

            const id =
                candidate.id;


            const tv =
                await getTV(id);


            const translations =
                await getTranslations(
                    id
                );


            const titleMatches =
                getTitleMatches(
                    variants,
                    tv,
                    translations
                );


            const titleMatch =
                titleMatches.length > 0;


            /*
             * Solo necesitamos consultar
             * temporadas de candidatos que
             * tengan al menos alguna evidencia
             * de título.
             */

            if (
                !titleMatch
            ) {

                continue;
            }


            const numberOfSeasons =
                tv.number_of_seasons || 0;


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


            const sameSeasons =
                sameSeasonSet(
                    m3uStructure,
                    tmdbStructure
                );


            const exact =
                exactStructure(
                    m3uStructure,
                    tmdbStructure
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
                    exact,
                    sameSeasons,
                    m3uTotal,
                    tmdbTotal,
                    m3uYear,
                    tmdbYear
                });


            scored.push({

                tmdbId:
                    id,

                name:
                    tv.name ||
                    candidate.name ||
                    null,

                originalName:
                    tv.original_name ||
                    null,

                firstAirDate:
                    tv.first_air_date ||
                    null,

                originCountry:
                    tv.origin_country ||
                    [],

                numberOfSeasons,
                numberOfEpisodes:
                    tv.number_of_episodes ||
                    0,

                titleMatch,

                titleMatches,

                score,

                m3uStructure,

                tmdbStructure,

                m3uTotal,

                tmdbTotal,

                episodeRatio,

                seasonRatio,

                sameSeasonSet:
                    sameSeasons,

                exactStructure:
                    exact,

                posterPath:
                    tv.poster_path ||
                    null
            });


        } catch (error) {

            console.log(
                `⚠️ Error candidato ${candidate.id}:`,
                error.message
            );
        }
    }


    scored.sort(
        (a, b) =>
            b.score -
            a.score
    );


    const best =
        scored[0] || null;


    const second =
        scored[1] || null;


    if (!best) {

        console.log(
            "   ❌ Ningún candidato con título compatible"
        );

        return {

            seriesName:
                name,

            groupTitle:
                item.groupTitle ||
                null,

            logo:
                item.logo ||
                null,

            m3uStructure,

            m3uTotal,

            m3uYear,

            decision:
                "SIN_CANDIDATO",

            candidates: []
        };
    }


    const decision =
        getDecision(
            best.score,
            second?.score || 0
        );


    console.log(
        `   🏆 ${best.tmdbId} - ${best.name}`
    );

    console.log(
        `   📅 ${best.firstAirDate || "-"}`
    );

    console.log(
        `   📊 Score: ${best.score}`
    );

    console.log(
        `   🎬 Episodios: ${Math.round(
            best.episodeRatio * 100
        )}%`
    );

    console.log(
        `   🗂️ Temporadas: ${Math.round(
            best.seasonRatio * 100
        )}%`
    );

    console.log(
        `   🎯 ${decision}`
    );


    if (second) {

        console.log(
            `   🥈 ${second.tmdbId} - ${second.name} (${second.score})`
        );
    }


    return {

        seriesName:
            name,

        groupTitle:
            item.groupTitle ||
            null,

        logo:
            item.logo ||
            null,

        m3uStructure,

        m3uTotal,

        m3uYear,

        decision,

        bestMatch:
            best,

        secondMatch:
            second || null,

        candidates:
            scored.slice(0, 5)
    };
}


// ======================================================
// GUARDAR PROGRESO
// ======================================================

async function saveProgress(
    results
) {

    await fs.writeFile(
        PROGRESS_FILE,
        JSON.stringify(
            results,
            null,
            2
        ),
        "utf8"
    );
}


// ======================================================
// WORKERS
// ======================================================

async function runWorkers(
    items,
    results
) {

    let nextIndex = 0;

    async function worker() {

        while (true) {

            const index =
                nextIndex++;

            if (
                index >= items.length
            ) {
                return;
            }


            const item =
                items[index];


            /*
             * Si ya fue procesado por
             * un progreso anterior,
             * saltarlo.
             */

            if (
                results.some(
                    result =>
                        result.seriesName ===
                        item.seriesName
                )
            ) {
                continue;
            }


            console.log(
                `\n[${index + 1}/${items.length}]`
            );


            try {

                const result =
                    await processSeries(
                        item
                    );


                results.push(
                    result
                );


                await saveProgress(
                    results
                );


            } catch (error) {

                console.log(
                    `❌ ${item.seriesName}:`,
                    error.message
                );


                results.push({

                    seriesName:
                        item.seriesName,

                    decision:
                        "ERROR",

                    error:
                        error.message
                });


                await saveProgress(
                    results
                );
            }
        }
    }


    const workers = [];

    for (
        let i = 0;
        i < CONCURRENCY;
        i++
    ) {

        workers.push(
            worker()
        );
    }


    await Promise.all(
        workers
    );
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
        "======================================"
    );

    console.log(
        "🚀 MATCH SERIES EXTRA V9"
    );

    console.log(
        "======================================"
    );


    const pending =
        JSON.parse(
            await fs.readFile(
                PENDING_FILE,
                "utf8"
            )
        );


    console.log(
        `📚 Pendientes: ${pending.length}`
    );


    // --------------------------------------------------
    // Recuperar progreso
    // --------------------------------------------------

    let results = [];


    try {

        results =
            JSON.parse(
                await fs.readFile(
                    PROGRESS_FILE,
                    "utf8"
                )
            );

        console.log(
            `♻️ Progreso encontrado: ${results.length}`
        );

    } catch {
        console.log(
            "🆕 Sin progreso anterior"
        );
    }


    // --------------------------------------------------
    // Procesar
    // --------------------------------------------------

    await runWorkers(
        pending,
        results
    );


    // --------------------------------------------------
    // Guardar resultado definitivo
    // --------------------------------------------------

    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(
            results,
            null,
            2
        ),
        "utf8"
    );


    // --------------------------------------------------
    // Estadísticas
    // --------------------------------------------------

    const stats = {

        MATCH_FUERTE: 0,

        MATCH_PROBABLE: 0,

        REVISAR: 0,

        SIN_CANDIDATO: 0,

        ERROR: 0
    };


    for (
        const result
        of results
    ) {

        if (
            stats[
                result.decision
            ] !== undefined
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
        "✅ V9 TERMINADO"
    );

    console.log(
        "======================================"
    );

    console.log(
        `📚 Procesadas: ${results.length}`
    );

    console.log(
        `🟢 MATCH FUERTE: ${stats.MATCH_FUERTE}`
    );

    console.log(
        `🟡 MATCH PROBABLE: ${stats.MATCH_PROBABLE}`
    );

    console.log(
        `🟠 REVISAR: ${stats.REVISAR}`
    );

    console.log(
        `🔴 SIN CANDIDATO: ${stats.SIN_CANDIDATO}`
    );

    console.log(
        `⚠️ ERROR: ${stats.ERROR}`
    );

    console.log(
        `\n📄 ${OUTPUT_FILE}`
    );

    console.log(
        `💾 Progreso: ${PROGRESS_FILE}`
    );
}


main().catch(error => {

    console.error(
        "\n❌ ERROR FATAL"
    );

    console.error(
        error
    );

    process.exit(1);
});