import fs from "fs/promises";

const V5_FILE =
    "./data/series-tmdb-matches.json";

const V6_FILE =
    "./data/series-tmdb-v6-results.json";

const OUTPUT_FILE =
    "./data/series-tmdb-final.json";

const REVIEW_OUTPUT =
    "./data/series-tmdb-final-review.json";

const PRIORITY = {
    SIN_MATCH: 0,
    AMBIGUO: 1,
    MATCH_PROBABLE: 2,
    MATCH_FUERTE: 3
};


// ============================================================
// LOAD
// ============================================================

async function loadJSON(file) {

    return JSON.parse(
        await fs.readFile(
            file,
            "utf8"
        )
    );
}


// ============================================================
// NORMALIZAR RESULTADO
// ============================================================

function normalizeResult(
    seriesName,
    data,
    source
) {

    if (!data) {
        return null;
    }

    // V5 puede tener diferentes estructuras
    // dependiendo de la versión del matcher.

    const decision =
        data.decision ||
        data.matchType ||
        "SIN_MATCH";

    let results =
        data.results ||
        data.candidates ||
        [];

    // Si el objeto es directamente un resultado
    if (
        !Array.isArray(results) &&
        data.tmdbId
    ) {

        results = [data];
    }

    const top =
        results?.[0] || null;

    return {
        seriesName,

        decision,

        source,

        tmdbId:
            top?.tmdbId ??
            data.tmdbId ??
            null,

        name:
            top?.name ??
            data.name ??
            null,

        originalName:
            top?.originalName ??
            data.originalName ??
            null,

        firstAirDate:
            top?.firstAirDate ??
            data.firstAirDate ??
            null,

        score:
            top?.score ??
            data.score ??
            0,

        titleMatch:
            top?.titleMatch ??
            data.titleMatch ??
            false,

        exactStructure:
            top?.exactStructure ??
            data.exactStructure ??
            false,

        sameSeasonSet:
            top?.sameSeasonSet ??
            data.sameSeasonSet ??
            false,

        episodeRatio:
            top?.episodeRatio ??
            data.episodeRatio ??
            0,

        matchingEpisodes:
            top?.matchingEpisodes ??
            data.matchingEpisodes ??
            0,

        expectedEpisodes:
            top?.expectedEpisodes ??
            data.expectedEpisodes ??
            0,

        m3uStructure:
            top?.m3uStructure ??
            data.m3uStructure ??
            null,

        tmdbStructure:
            top?.tmdbStructure ??
            data.tmdbStructure ??
            null,

        variants:
            data.variants ??
            null,

        searchedWith:
            top?.searchedWith ??
            null,

        titleMatches:
            top?.titleMatches ??
            [],

        tmdbTitles:
            top?.tmdbTitles ??
            [],

        allCandidates:
            results
    };
}


// ============================================================
// ELEGIR MEJOR
// ============================================================

function chooseBetter(
    current,
    incoming
) {

    if (!current) {
        return incoming;
    }

    if (!incoming) {
        return current;
    }

    const currentPriority =
        PRIORITY[current.decision] ??
        0;

    const incomingPriority =
        PRIORITY[incoming.decision] ??
        0;

    // Primero importa la categoría
    if (
        incomingPriority >
        currentPriority
    ) {

        return incoming;
    }

    if (
        currentPriority >
        incomingPriority
    ) {

        return current;
    }

    // Misma categoría: comparar score
    if (
        incoming.score >
        current.score
    ) {

        return incoming;
    }

    if (
        current.score >
        incoming.score
    ) {

        return current;
    }

    // Mismo score: preferimos V6
    // porque tiene el matcher mejorado.
    if (
        incoming.source === "V6"
    ) {

        return incoming;
    }

    return current;
}


// ============================================================
// MAIN
// ============================================================

async function main() {

    console.log(
        "🚀 MERGE SERIES V7"
    );

    const v5 =
        await loadJSON(
            V5_FILE
        );

    const v6 =
        await loadJSON(
            V6_FILE
        );

    console.log(
        `📦 V5: ${Object.keys(v5).length}`
    );

    console.log(
        `📦 V6: ${Object.keys(v6).length}`
    );

    const merged =
        new Map();

    // ========================================================
    // V5
    // ========================================================

    for (
        const [seriesName, data]
        of Object.entries(v5)
    ) {

        const result =
            normalizeResult(
                seriesName,
                data,
                "V5"
            );

        if (!result) {
            continue;
        }

        merged.set(
            seriesName,
            result
        );
    }


    // ========================================================
    // V6
    // ========================================================

    let v6Replacements = 0;

    for (
        const [seriesName, data]
        of Object.entries(v6)
    ) {

        const incoming =
            normalizeResult(
                seriesName,
                data,
                "V6"
            );

        if (!incoming) {
            continue;
        }

        const current =
            merged.get(
                seriesName
            );

        const chosen =
            chooseBetter(
                current,
                incoming
            );

        if (
            current &&
            chosen === incoming
        ) {

            v6Replacements++;
        }

        merged.set(
            seriesName,
            chosen
        );
    }


    // ========================================================
    // OUTPUT
    // ========================================================

    const finalData = {};

    for (
        const [seriesName, result]
        of merged
    ) {

        finalData[seriesName] = result;
    }


    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(
            finalData,
            null,
            2
        ),
        "utf8"
    );


    // ========================================================
    // REVIEW
    // ========================================================

    const review = {};

    for (
        const [seriesName, result]
        of Object.entries(
            finalData
        )
    ) {

        if (
            result.decision ===
            "AMBIGUO" ||
            result.decision ===
            "SIN_MATCH"
        ) {

            review[seriesName] =
                result;
        }
    }

    await fs.writeFile(
        REVIEW_OUTPUT,
        JSON.stringify(
            review,
            null,
            2
        ),
        "utf8"
    );


    // ========================================================
    // STATS
    // ========================================================

    const stats = {
        total: 0,
        MATCH_FUERTE: 0,
        MATCH_PROBABLE: 0,
        AMBIGUO: 0,
        SIN_MATCH: 0,
        ERROR: 0,

        fromV5: 0,
        fromV6: 0
    };

    for (
        const result
        of Object.values(
            finalData
        )
    ) {

        stats.total++;

        if (
            stats[result.decision]
            !== undefined
        ) {

            stats[result.decision]++;
        }

        if (
            result.source ===
            "V5"
        ) {

            stats.fromV5++;

        } else if (
            result.source ===
            "V6"
        ) {

            stats.fromV6++;
        }
    }


    // ========================================================
    // PRINT
    // ========================================================

    console.log("\n======================================");
    console.log("✅ MERGE V7 TERMINADO");
    console.log("======================================");

    console.log(
        `📚 Total: ${stats.total}`
    );

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

    console.log("\n--------------------------------------");

    console.log(
        `📌 Resultados provenientes de V5: ${stats.fromV5}`
    );

    console.log(
        `📌 Resultados provenientes de V6: ${stats.fromV6}`
    );

    console.log(
        `🔄 Reemplazos realizados por V6: ${v6Replacements}`
    );

    console.log("\n--------------------------------------");

    console.log(
        `📄 FINAL: ${OUTPUT_FILE}`
    );

    console.log(
        `📄 REVIEW: ${REVIEW_OUTPUT}`
    );
}


main();