import fs from "fs/promises";

const MAIN_FINAL =
    "./data/series-tmdb-final.json";

const EXTRA_REUSED =
    "./data/series-extra-v9-reused.json";

const EXTRA_V9 =
    "./data/series-extra-v9-matches.json";

const EXTRA_PARSED =
    "./data/series-parsed-extra.json";

const OUTPUT =
    "./data/series-extra-v10-audit.json";


function addToMap(
    map,
    tmdbId,
    entry
) {
    const key = String(tmdbId);

    if (!map.has(key)) {
        map.set(key, []);
    }

    map.get(key).push(entry);
}


// ======================================================
// CARGAR
// ======================================================

const mainFinal =
    JSON.parse(
        await fs.readFile(
            MAIN_FINAL,
            "utf8"
        )
    );

const reused =
    JSON.parse(
        await fs.readFile(
            EXTRA_REUSED,
            "utf8"
        )
    );

const v9 =
    JSON.parse(
        await fs.readFile(
            EXTRA_V9,
            "utf8"
        )
    );

const extraParsed =
    JSON.parse(
        await fs.readFile(
            EXTRA_PARSED,
            "utf8"
        )
    );


// ======================================================
// INDEXAR TMDB DE LISTA 1
// ======================================================

const mainByTmdb =
    new Map();

for (
    const item
    of Object.values(mainFinal)
) {

    if (!item.tmdbId) {
        continue;
    }

    addToMap(
        mainByTmdb,
        item.tmdbId,
        item
    );
}


// ======================================================
// UNIR MAPPINGS LISTA 2
// ======================================================

const extraMappings = [];


// ----------------------------------------------
// REUTILIZADAS
// ----------------------------------------------

for (
    const item
    of reused
) {

    if (!item.tmdbId) {
        continue;
    }

    extraMappings.push({
        source: "REUSED",
        seriesName:
            item.seriesName,
        tmdbId:
            item.tmdbId,
        tmdbName:
            item.tmdbName,
        decision:
            item.decision
    });
}


// ----------------------------------------------
// V9
// ----------------------------------------------

for (
    const item
    of v9
) {

    if (
        !item.bestMatch?.tmdbId
    ) {
        continue;
    }

    if (
        item.decision !==
            "MATCH_FUERTE" &&
        item.decision !==
            "MATCH_PROBABLE"
    ) {
        continue;
    }

    extraMappings.push({
        source: "V9",
        seriesName:
            item.seriesName,
        tmdbId:
            item.bestMatch.tmdbId,
        tmdbName:
            item.bestMatch.name,
        decision:
            item.decision
    });
}


// ======================================================
// AGRUPAR LISTA 2 POR TMDB
// ======================================================

const extraByTmdb =
    new Map();

for (
    const item
    of extraMappings
) {

    addToMap(
        extraByTmdb,
        item.tmdbId,
        item
    );
}


// ======================================================
// ESTADÍSTICAS
// ======================================================

const alreadyExisting = [];
const genuinelyNew = [];
const duplicatedExtra = [];


// ======================================================
// ANALIZAR TMDB IDs
// ======================================================

for (
    const [
        tmdbId,
        entries
    ]
    of extraByTmdb
) {

    const existingInMain =
        mainByTmdb.get(
            tmdbId
        ) || [];


    const names = [
        ...new Set(
            entries.map(
                item =>
                    item.seriesName
            )
        )
    ];


    const record = {

        tmdbId:

            Number(tmdbId),

        extraNames:
            names,

        extraCount:
            entries.length,

        decisions:
            entries.map(
                item =>
                    item.decision
            ),

        mainNames:
            existingInMain.map(
                item =>
                    item.seriesName
            ),

        existsInMain:
            existingInMain.length > 0
    };


    if (
        existingInMain.length > 0
    ) {

        alreadyExisting.push(
            record
        );

    } else {

        genuinelyNew.push(
            record
        );
    }


    if (
        names.length > 1
    ) {

        duplicatedExtra.push(
            record
        );
    }
}


// ======================================================
// COMPARAR EPISODIOS POR TMDB
// ======================================================

const episodeComparison = [];

for (
    const item
    of genuinelyNew
) {

    const seriesEntries =
        item.extraNames
            .map(
                name =>
                    extraParsed[name]
            )
            .filter(Boolean);


    let totalEpisodes = 0;

    const structures = {};


    for (
        const series
        of seriesEntries
    ) {

        let seriesTotal = 0;

        for (
            const [
                season,
                seasonData
            ]
            of Object.entries(
                series.seasons || {}
            )
        ) {

            const count =
                Object.keys(
                    seasonData.episodes || {}
                ).length;

            seriesTotal += count;


            if (
                !structures[season]
            ) {
                structures[season] = 0;
            }

            structures[season] +=
                count;
        }

        totalEpisodes +=
            seriesTotal;
    }


    episodeComparison.push({

        tmdbId:
            item.tmdbId,

        names:
            item.extraNames,

        totalEpisodes,

        structure:
            structures
    });
}


// ======================================================
// GUARDAR
// ======================================================

const result = {

    statistics: {

        extraSeriesMappings:
            extraMappings.length,

        uniqueExtraTmdbIds:
            extraByTmdb.size,

        alreadyExistingInMain:
            alreadyExisting.length,

        genuinelyNewSeries:
            genuinelyNew.length,

        duplicatedExtraTmdbIds:
            duplicatedExtra.length
    },

    alreadyExisting,

    genuinelyNew,

    duplicatedExtra,

    episodeComparison
};


await fs.writeFile(
    OUTPUT,
    JSON.stringify(
        result,
        null,
        2
    ),
    "utf8"
);


// ======================================================
// MOSTRAR
// ======================================================

console.log(
    "======================================"
);

console.log(
    "🔎 AUDITORÍA LISTA 2 → TMDB"
);

console.log(
    "======================================"
);

console.log(
    `📚 Mappings válidos lista 2: ${
        extraMappings.length
    }`
);

console.log(
    `🆔 TMDB IDs únicos: ${
        extraByTmdb.size
    }`
);

console.log(
    `♻️ Ya existen en lista 1: ${
        alreadyExisting.length
    }`
);

console.log(
    `🆕 Realmente nuevas: ${
        genuinelyNew.length
    }`
);

console.log(
    `🟡 TMDB duplicados dentro lista 2: ${
        duplicatedExtra.length
    }`
);

console.log(
    "\n📄",
    OUTPUT
);