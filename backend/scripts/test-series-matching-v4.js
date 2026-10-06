import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
    console.error("❌ Falta TMDB_API_KEY en .env");
    process.exit(1);
}

const SERIES_FILE = "./data/series-parsed.json";

const TEST_SERIES = [
    "Hijack",
    "The Boys",
    "Breaking Bad",
    "Sandokan",
    "El Caballero de los Siete Reinos",
];

const LANGUAGES = [
    "es-AR",
    "es-MX",
    "es-ES",
    "en-US",
];

const data = JSON.parse(
    fs.readFileSync(SERIES_FILE, "utf8")
);

// --------------------------------------------------
// NORMALIZAR
// --------------------------------------------------

function normalizeTitle(title) {
    return title
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// --------------------------------------------------
// TMDB REQUEST
// --------------------------------------------------

async function tmdb(endpoint, params = {}) {
    const url = new URL(
        `https://api.themoviedb.org/3${endpoint}`
    );

    url.searchParams.set("api_key", API_KEY);


    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }


    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `TMDB ${response.status}: ${endpoint}`
        );
    }

    return response.json();
}

// --------------------------------------------------
// OBTENER ESTRUCTURA M3U
// --------------------------------------------------

function getM3UStructure(series) {
    const structure = {};

    for (const [seasonNumber, season] of Object.entries(
        series.seasons || {}
    )) {
        const episodes = Object.keys(
            season.episodes || {}
        )
            .map(Number)
            .sort((a, b) => a - b);

        structure[Number(seasonNumber)] = episodes;
    }

    return structure;
}

// --------------------------------------------------
// OBTENER ESTRUCTURA TMDB
// --------------------------------------------------

async function getTMDBStructure(tmdbId, seasons) {
    const structure = {};

    for (const seasonNumber of seasons) {
        if (seasonNumber === 0) {
            continue;
        }

        try {
            const result = await tmdb(
                `/tv/${tmdbId}/season/${seasonNumber}`,
                {
                    language: "en-US",
                }
            );

            structure[seasonNumber] =
                (result.episodes || [])
                    .map(ep => ep.episode_number)
                    .sort((a, b) => a - b);

        } catch {
            structure[seasonNumber] = null;
        }
    }

    return structure;
}

// --------------------------------------------------
// COMPARAR ESTRUCTURAS
// --------------------------------------------------

function compareStructure(m3u, tmdb) {
    const m3uSeasons = Object.keys(m3u)
        .map(Number)
        .sort((a, b) => a - b);

    const tmdbSeasons = Object.keys(tmdb)
        .map(Number)
        .sort((a, b) => a - b);

    let matchingSeasons = 0;
    let matchingEpisodes = 0;
    let totalM3UEpisodes = 0;
    let totalTMDBEpisodes = 0;

    for (const season of m3uSeasons) {
        const m3uEpisodes = m3u[season] || [];
        const tmdbEpisodes = tmdb[season] || [];

        totalM3UEpisodes += m3uEpisodes.length;
        totalTMDBEpisodes += tmdbEpisodes.length;

        const sameEpisodes =
            JSON.stringify(m3uEpisodes) ===
            JSON.stringify(tmdbEpisodes);

        if (sameEpisodes) {
            matchingSeasons++;
        }

        const tmdbSet = new Set(tmdbEpisodes);

        for (const episode of m3uEpisodes) {
            if (tmdbSet.has(episode)) {
                matchingEpisodes++;
            }
        }
    }

    const seasonRatio =
        m3uSeasons.length === 0
            ? 0
            : matchingSeasons / m3uSeasons.length;

    const episodeRatio =
        totalM3UEpisodes === 0
            ? 0
            : matchingEpisodes / totalM3UEpisodes;

    const exact =
        JSON.stringify(m3u) === JSON.stringify(tmdb);

    const sameSeasonSet =
        JSON.stringify(m3uSeasons) ===
        JSON.stringify(tmdbSeasons);

    return {
        exact,
        sameSeasonSet,
        matchingSeasons,
        totalM3USeasons: m3uSeasons.length,
        tmdbSeasons: tmdbSeasons.length,
        seasonRatio,
        matchingEpisodes,
        totalM3UEpisodes,
        totalTMDBEpisodes,
        episodeRatio,
    };
}

// --------------------------------------------------
// TÍTULOS / TRADUCCIONES
// --------------------------------------------------

async function getTitles(candidate) {
    const titles = new Set();

    if (candidate.name) {
        titles.add(candidate.name);
    }

    if (candidate.original_name) {
        titles.add(candidate.original_name);
    }

    try {
        const translations = await tmdb(
            `/tv/${candidate.id}/translations`
        );

        for (const translation of translations.translations || []) {
            const name = translation.data?.name;

            if (name) {
                titles.add(name);
            }
        }
    } catch {
        // No pasa nada si traducciones falla
    }

    return [...titles];
}

// --------------------------------------------------
// COMPARAR TÍTULO
// --------------------------------------------------

function compareTitle(m3uName, titles) {
    const normalizedM3U = normalizeTitle(m3uName);

    const exactTitles = titles.filter(
        title =>
            normalizeTitle(title) ===
            normalizedM3U
    );

    return {
        exact: exactTitles.length > 0,
        matches: exactTitles,
    };
}

// --------------------------------------------------
// SCORE
// --------------------------------------------------

function calculateScore(title, structure) {
    let score = 0;
    const reasons = [];

    if (title.exact) {
        score += 50;
        reasons.push("title_exact");
    }

    if (structure.exact) {
        score += 50;
        reasons.push("structure_exact");
    } else {
        if (structure.sameSeasonSet) {
            score += 15;
            reasons.push("season_set_exact");
        }

        if (structure.episodeRatio >= 0.95) {
            score += 25;
            reasons.push("episodes_95_percent");
        } else if (structure.episodeRatio >= 0.80) {
            score += 15;
            reasons.push("episodes_80_percent");
        } else if (structure.episodeRatio >= 0.50) {
            score += 5;
            reasons.push("episodes_50_percent");
        }
    }

    return {
        score,
        reasons,
    };
}

// --------------------------------------------------
// BUSCAR CANDIDATOS
// --------------------------------------------------

async function searchCandidates(name) {
    const candidates = new Map();

    for (const language of LANGUAGES) {
        const result = await tmdb("/search/tv", {
            query: name,
            language,
            include_adult: "false",
            page: "1",
        });

        for (const candidate of result.results || []) {
            candidates.set(candidate.id, candidate);
        }
    }

    return [...candidates.values()];
}

// --------------------------------------------------
// PROCESAR SERIE
// --------------------------------------------------

async function processSeries(name) {
    const series = data[name];

    if (!series) {
        return {
            name,
            result: "NOT_FOUND_IN_M3U",
        };
    }

    console.log("\n" + "=".repeat(70));
    console.log(name);
    console.log("=".repeat(70));

    const m3uStructure = getM3UStructure(series);

    console.log("\n📦 Estructura M3U:");

    for (const [season, episodes] of Object.entries(
        m3uStructure
    )) {
        console.log(
            `   S${String(season).padStart(2, "0")}: ${episodes.length} episodios`
        );
    }

    const candidates = await searchCandidates(name);

    console.log(
        `\n🔎 Candidatos TMDB encontrados: ${candidates.length}`
    );

    const results = [];

    for (const candidate of candidates) {
        const titles = await getTitles(candidate);

        const title = compareTitle(
            name,
            titles
        );

        if (!title.exact) {
            continue;
        }

        const seasons = Object.keys(m3uStructure)
            .map(Number);

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
                title,
                structure
            );

        results.push({
            id: candidate.id,
            name: candidate.name,
            originalName:
                candidate.original_name,
            firstAirDate:
                candidate.first_air_date,
            posterPath:
                candidate.poster_path,
            title,
            structure,
            ...scoring,
        });
    }

    results.sort(
        (a, b) => b.score - a.score
    );

    console.log("\n🎯 CANDIDATOS RELEVANTES:\n");

    for (const result of results) {
        console.log(
            `TMDB ${result.id} - ${result.name}`
        );

        console.log(
            `   Original: ${result.originalName}`
        );

        console.log(
            `   Fecha: ${result.firstAirDate || "?"}`
        );

        console.log(
            `   Título exacto: ${result.title.exact ? "✓" : "✗"}`
        );

        console.log(
            `   Temporadas exactas: ${result.structure.matchingSeasons}/${result.structure.totalM3USeasons}`
        );

        console.log(
            `   Episodios: ${result.structure.matchingEpisodes}/${result.structure.totalM3UEpisodes}`
        );

        console.log(
            `   Ratio episodios: ${(result.structure.episodeRatio * 100).toFixed(1)}%`
        );

        console.log(
            `   Estructura exacta: ${result.structure.exact ? "✓" : "✗"}`
        );

        console.log(
            `   SCORE: ${result.score}`
        );

        console.log(
            `   Razones: ${result.reasons.join(", ")}`
        );

        console.log();
    }

    const best = results[0];

    let decision = "DESCARTADO";

    if (best) {
        if (
            best.title.exact &&
            best.structure.exact
        ) {
            decision = "MATCH FUERTE";
        } else if (
            best.title.exact &&
            best.structure.episodeRatio >= 0.8
        ) {
            decision = "MATCH PROBABLE";
        } else {
            decision = "AMBIGUO";
        }
    }

    console.log(
        `🏁 RESULTADO: ${decision}`
    );

    if (best) {
        console.log(
            `   → TMDB ${best.id} - ${best.name}`
        );
    }

    return {
        name,
        decision,
        best: best || null,
        candidates: results,
    };
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

const results = [];

for (const name of TEST_SERIES) {
    try {
        const result =
            await processSeries(name);

        results.push(result);
    } catch (error) {
        console.error(
            `❌ Error procesando ${name}:`,
            error.message
        );
    }
}

fs.writeFileSync(
    "./data/series-matching-v4-test.json",
    JSON.stringify(results, null, 2)
);

console.log(
    "\n💾 Resultado guardado en:"
);

console.log(
    "./data/series-matching-v4-test.json"
);