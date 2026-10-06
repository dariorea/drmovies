import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
    console.error("❌ Falta TMDB_API_KEY en .env");
    process.exit(1);
}

const SERIES_FILE = "./data/series-parsed.json";
const OUTPUT_FILE = "./data/series-tmdb-matches.json";
const REVIEW_FILE = "./data/series-tmdb-review.json";
const PROGRESS_FILE = "./data/series-tmdb-progress.json";

const LANGUAGES = [
    "es-AR",
    "es-MX",
    "es-ES",
    "en-US",
];

// --------------------------------------------------
// CONFIGURACIÓN
// --------------------------------------------------

const SAVE_EVERY = 10;

// Cantidad máxima de requests simultáneos.
// Lo dejamos bajo para no castigar la API.
const CONCURRENCY = 4;

// --------------------------------------------------
// CARGAR DATOS
// --------------------------------------------------

const seriesData = JSON.parse(
    fs.readFileSync(SERIES_FILE, "utf8")
);

const seriesNames = Object.keys(seriesData);

console.log(
    `📚 Series encontradas: ${seriesNames.length}`
);

// --------------------------------------------------
// NORMALIZAR TÍTULO
// --------------------------------------------------

function normalizeTitle(title) {
    return title
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// --------------------------------------------------
// SLEEP
// --------------------------------------------------

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// --------------------------------------------------
// TMDB CACHE
// --------------------------------------------------

const cache = new Map();

function cacheKey(endpoint, params) {
    const sorted = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b));

    return (
        endpoint +
        "?" +
        sorted
            .map(([key, value]) => `${key}=${value}`)
            .join("&")
    );
}

// --------------------------------------------------
// TMDB REQUEST
// --------------------------------------------------

async function tmdb(endpoint, params = {}, retries = 3) {
    const key = cacheKey(endpoint, params);

    if (cache.has(key)) {
        return cache.get(key);
    }

    const url = new URL(
        `https://api.themoviedb.org/3${endpoint}`
    );

    url.searchParams.set(
        "api_key",
        API_KEY
    );

    for (const [param, value] of Object.entries(params)) {
        url.searchParams.set(
            param,
            value
        );
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
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
                    `⏳ Rate limit TMDB. Esperando ${retryAfter}s...`
                );

                await sleep(
                    retryAfter * 1000
                );

                continue;
            }

            if (!response.ok) {
                throw new Error(
                    `TMDB ${response.status}: ${endpoint}`
                );
            }

            const json =
                await response.json();

            cache.set(key, json);

            return json;

        } catch (error) {
            if (attempt === retries) {
                throw error;
            }

            await sleep(
                attempt * 1000
            );
        }
    }
}

// --------------------------------------------------
// ESTRUCTURA M3U
// --------------------------------------------------

function getM3UStructure(series) {
    const structure = {};

    for (
        const [seasonNumber, season]
        of Object.entries(series.seasons || {})
    ) {
        const episodes = Object.keys(
            season.episodes || {}
        )
            .map(Number)
            .sort((a, b) => a - b);

        structure[
            Number(seasonNumber)
        ] = episodes;
    }

    return structure;
}

// --------------------------------------------------
// ESTRUCTURA TMDB
// --------------------------------------------------

async function getTMDBStructure(
    tmdbId,
    seasons
) {
    const structure = {};

    for (const season of seasons) {
        // No necesitamos especiales
        if (season === 0) {
            continue;
        }

        try {
            const result =
                await tmdb(
                    `/tv/${tmdbId}/season/${season}`,
                    {
                        language: "en-US",
                    }
                );

            structure[season] =
                (result.episodes || [])
                    .map(ep =>
                        ep.episode_number
                    )
                    .sort(
                        (a, b) => a - b
                    );

        } catch {
            structure[season] = null;
        }
    }

    return structure;
}

// --------------------------------------------------
// COMPARAR ESTRUCTURAS
// --------------------------------------------------

function compareStructure(
    m3u,
    tmdb
) {
    const m3uSeasons =
        Object.keys(m3u)
            .map(Number)
            .sort(
                (a, b) => a - b
            );

    const tmdbSeasons =
        Object.keys(tmdb)
            .map(Number)
            .sort(
                (a, b) => a - b
            );

    let matchingSeasons = 0;
    let matchingEpisodes = 0;

    let totalM3UEpisodes = 0;
    let totalTMDBEpisodes = 0;

    for (const season of m3uSeasons) {
        const m3uEpisodes =
            m3u[season] || [];

        const tmdbEpisodes =
            tmdb[season] || [];

        totalM3UEpisodes +=
            m3uEpisodes.length;

        totalTMDBEpisodes +=
            tmdbEpisodes.length;

        const sameEpisodes =
            JSON.stringify(
                m3uEpisodes
            ) ===
            JSON.stringify(
                tmdbEpisodes
            );

        if (sameEpisodes) {
            matchingSeasons++;
        }

        const tmdbSet =
            new Set(tmdbEpisodes);

        for (
            const episode
            of m3uEpisodes
        ) {
            if (
                tmdbSet.has(
                    episode
                )
            ) {
                matchingEpisodes++;
            }
        }
    }

    const seasonRatio =
        m3uSeasons.length
            ? matchingSeasons /
              m3uSeasons.length
            : 0;

    const episodeRatio =
        totalM3UEpisodes
            ? matchingEpisodes /
              totalM3UEpisodes
            : 0;

    const exact =
        JSON.stringify(m3u) ===
        JSON.stringify(tmdb);

    const sameSeasonSet =
        JSON.stringify(
            m3uSeasons
        ) ===
        JSON.stringify(
            tmdbSeasons
        );

    return {
        exact,
        sameSeasonSet,

        matchingSeasons,
        totalM3USeasons:
            m3uSeasons.length,

        tmdbSeasons:
            tmdbSeasons.length,

        seasonRatio,

        matchingEpisodes,
        totalM3UEpisodes,

        totalTMDBEpisodes,

        episodeRatio,
    };
}

// --------------------------------------------------
// COMPARAR TÍTULO
// --------------------------------------------------

function titleMatches(
    m3uName,
    candidate
) {
    const normalizedM3U =
        normalizeTitle(m3uName);

    const names = [
        candidate.name,
        candidate.original_name,
    ].filter(Boolean);

    const matches = names.filter(
        name =>
            normalizeTitle(name) ===
            normalizedM3U
    );

    return matches.length > 0;
}

// --------------------------------------------------
// BUSCAR CANDIDATOS
// --------------------------------------------------

async function searchCandidates(
    name
) {
    const candidates =
        new Map();

    for (
        const language
        of LANGUAGES
    ) {
        const result =
            await tmdb(
                "/search/tv",
                {
                    query: name,
                    language,
                    include_adult:
                        "false",
                    page: "1",
                }
            );

        for (
            const candidate
            of result.results || []
        ) {
            candidates.set(
                candidate.id,
                candidate
            );
        }
    }

    return [
        ...candidates.values()
    ];
}

// --------------------------------------------------
// SCORE
// --------------------------------------------------

function calculateScore(
    titleExact,
    structure
) {
    let score = 0;
    const reasons = [];

    // Título exacto
    if (titleExact) {
        score += 50;
        reasons.push(
            "title_exact"
        );
    }

    // Estructura exacta
    if (structure.exact) {
        score += 50;

        reasons.push(
            "structure_exact"
        );

        return {
            score,
            reasons,
        };
    }

    // Mismo conjunto de temporadas
    if (
        structure.sameSeasonSet
    ) {
        score += 15;

        reasons.push(
            "season_set_exact"
        );
    }

    // Episodios
    if (
        structure.episodeRatio >=
        0.95
    ) {
        score += 25;

        reasons.push(
            "episodes_95_percent"
        );

    } else if (
        structure.episodeRatio >=
        0.80
    ) {
        score += 15;

        reasons.push(
            "episodes_80_percent"
        );

    } else if (
        structure.episodeRatio >=
        0.50
    ) {
        score += 5;

        reasons.push(
            "episodes_50_percent"
        );
    }

    return {
        score,
        reasons,
    };
}

// --------------------------------------------------
// DECISIÓN
// --------------------------------------------------

function getDecision(
    results
) {
    if (!results.length) {
        return "SIN_MATCH";
    }

    const best =
        results[0];

    const second =
        results[1];

    // Título + estructura exactos
    if (
        best.titleExact &&
        best.structure.exact
    ) {
        // Si otro candidato también
        // tiene score idéntico, no queremos
        // decidir automáticamente.
        if (
            second &&
            second.score ===
                best.score
        ) {
            return "AMBIGUO";
        }

        return "MATCH_FUERTE";
    }

    // Muy buena coincidencia
    if (
        best.titleExact &&
        best.structure.episodeRatio >=
            0.8
    ) {
        // Si hay otro candidato muy cerca,
        // mandamos a revisión.
        if (
            second &&
            second.score >=
                best.score - 10
        ) {
            return "AMBIGUO";
        }

        return "MATCH_PROBABLE";
    }

    return "AMBIGUO";
}

// --------------------------------------------------
// PROCESAR UNA SERIE
// --------------------------------------------------

async function processSeries(
    name
) {
    const series =
        seriesData[name];

    const m3uStructure =
        getM3UStructure(
            series
        );

    const candidates =
        await searchCandidates(
            name
        );

    const exactTitleCandidates =
        candidates.filter(
            candidate =>
                titleMatches(
                    name,
                    candidate
                )
        );

    const results = [];

    for (
        const candidate
        of exactTitleCandidates
    ) {
        const seasons =
            Object.keys(
                m3uStructure
            )
                .map(Number)
                .filter(
                    season =>
                        season !== 0
                );

        const tmdbStructure =
            await getTMDBStructure(
                candidate.id,
                seasons
            );

        const structure =
            compareStructure(
                m3uStructure,
                tmdbStructure
            );

        const scoring =
            calculateScore(
                true,
                structure
            );

        results.push({
            tmdbId:
                candidate.id,

            tmdbName:
                candidate.name,

            originalName:
                candidate.original_name,

            firstAirDate:
                candidate.first_air_date ||
                null,

            posterPath:
                candidate.poster_path ||
                null,

            titleExact: true,

            structure,

            score:
                scoring.score,

            reasons:
                scoring.reasons,
        });
    }

    results.sort(
        (a, b) =>
            b.score - a.score
    );

    const decision =
        getDecision(results);

    const best =
        results[0] || null;

    return {
        m3uName: name,

        tmdbId:
            decision ===
                "MATCH_FUERTE" ||
            decision ===
                "MATCH_PROBABLE"
                ? best?.tmdbId ??
                  null
                : null,

        tmdbName:
            decision ===
                "MATCH_FUERTE" ||
            decision ===
                "MATCH_PROBABLE"
                ? best?.tmdbName ??
                  null
                : null,

        decision,

        m3uStructure,

        bestScore:
            best?.score ?? 0,

        reasons:
            best?.reasons ?? [],

        candidates:
            results,
    };
}

// --------------------------------------------------
// GUARDAR PROGRESO
// --------------------------------------------------

function saveProgress(
    processed,
    results
) {
    fs.writeFileSync(
        PROGRESS_FILE,
        JSON.stringify(
            {
                processed,
                total:
                    seriesNames.length,
                updatedAt:
                    new Date().toISOString(),
                results,
            },
            null,
            2
        )
    );
}

// --------------------------------------------------
// CARGAR PROGRESO
// --------------------------------------------------

let finalResults = {};

if (
    fs.existsSync(
        PROGRESS_FILE
    )
) {
    try {
        const progress =
            JSON.parse(
                fs.readFileSync(
                    PROGRESS_FILE,
                    "utf8"
                )
            );

        finalResults =
            progress.results || {};

        console.log(
            `♻️ Progreso encontrado: ${Object.keys(finalResults).length}/${seriesNames.length}`
        );

    } catch {
        console.log(
            "⚠️ No se pudo leer el progreso anterior."
        );
    }
}

// --------------------------------------------------
// COLA DE TRABAJO
// --------------------------------------------------

const pending =
    seriesNames.filter(
        name =>
            !finalResults[name]
    );

console.log(
    `📋 Pendientes: ${pending.length}`
);

console.log(
    `⚙️ Concurrencia: ${CONCURRENCY}`
);

console.log(
    `💾 Guardado cada ${SAVE_EVERY} series`
);

console.log(
    "--------------------------------------------------"
);

// --------------------------------------------------
// WORKERS
// --------------------------------------------------

let completed =
    seriesNames.length -
    pending.length;

async function worker(
    workerId
) {
    while (true) {
        const index =
            completed;

        if (
            index >=
            seriesNames.length
        ) {
            return;
        }

        // Reservar una serie
        completed++;

        const name =
            seriesNames[index];

        const started =
            Date.now();

        try {
            const result =
                await processSeries(
                    name
                );

            finalResults[name] =
                result;

            const elapsed =
                (
                    (Date.now() -
                        started) /
                    1000
                ).toFixed(1);

            const percent =
                (
                    (completed /
                        seriesNames.length) *
                    100
                ).toFixed(1);

            console.log(
                `[${completed}/${seriesNames.length}] ${percent}% | ${result.decision.padEnd(15)} | ${result.bestScore.toString().padStart(3)} | ${name} | ${elapsed}s`
            );

            if (
                completed %
                    SAVE_EVERY ===
                0
            ) {
                saveProgress(
                    completed,
                    finalResults
                );

                console.log(
                    `💾 Progreso guardado (${completed})`
                );
            }

        } catch (error) {
            console.error(
                `❌ ${name}: ${error.message}`
            );

            finalResults[name] = {
                m3uName: name,
                decision:
                    "ERROR",
                error:
                    error.message,
            };
        }
    }
}

// --------------------------------------------------
// EJECUTAR WORKERS
// --------------------------------------------------

const workers = [];

for (
    let i = 0;
    i < CONCURRENCY;
    i++
) {
    workers.push(
        worker(i + 1)
    );
}

await Promise.all(
    workers
);

// --------------------------------------------------
// GUARDADO FINAL
// --------------------------------------------------

saveProgress(
    completed,
    finalResults
);

// --------------------------------------------------
// SEPARAR MATCHES / REVIEW
// --------------------------------------------------

const matches = {};
const review = {};

for (
    const [name, result]
    of Object.entries(
        finalResults
    )
) {
    if (
        result.decision ===
            "MATCH_FUERTE" ||
        result.decision ===
            "MATCH_PROBABLE"
    ) {
        matches[name] =
            result;
    } else {
        review[name] =
            result;
    }
}

// --------------------------------------------------
// GUARDAR MATCHES
// --------------------------------------------------

fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
        matches,
        null,
        2
    )
);

// --------------------------------------------------
// GUARDAR REVIEW
// --------------------------------------------------

fs.writeFileSync(
    REVIEW_FILE,
    JSON.stringify(
        review,
        null,
        2
    )
);

// --------------------------------------------------
// ESTADÍSTICAS
// --------------------------------------------------

let strong = 0;
let probable = 0;
let ambiguous = 0;
let noMatch = 0;
let errors = 0;

for (
    const result
    of Object.values(
        finalResults
    )
) {
    switch (
        result.decision
    ) {
        case "MATCH_FUERTE":
            strong++;
            break;

        case "MATCH_PROBABLE":
            probable++;
            break;

        case "AMBIGUO":
            ambiguous++;
            break;

        case "SIN_MATCH":
            noMatch++;
            break;

        case "ERROR":
            errors++;
            break;
    }
}

console.log("\n");
console.log(
    "=================================================="
);
console.log(
    "                 RESULTADO FINAL"
);
console.log(
    "=================================================="
);

console.log(
    `📚 Total:           ${seriesNames.length}`
);

console.log(
    `🟢 MATCH FUERTE:    ${strong}`
);

console.log(
    `🟡 MATCH PROBABLE:  ${probable}`
);

console.log(
    `🟠 AMBIGUO:         ${ambiguous}`
);

console.log(
    `🔴 SIN MATCH:       ${noMatch}`
);

console.log(
    `⚠️ ERRORES:         ${errors}`
);

console.log(
    "=================================================="
);

console.log(
    "\n💾 Matches:"
);

console.log(
    OUTPUT_FILE
);

console.log(
    "\n🔎 Para revisar:"
);

console.log(
    REVIEW_FILE
);

console.log(
    "\n♻️ Progreso:"
);

console.log(
    PROGRESS_FILE
);