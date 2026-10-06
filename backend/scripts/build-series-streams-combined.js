import fs from "fs/promises";

const MAIN_PARSED =
    "./data/series-parsed.json";

const MAIN_MAPPING =
    "./data/series-tmdb-final.json";

const EXTRA_PARSED =
    "./data/series-parsed-extra.json";

const EXTRA_REUSED =
    "./data/series-extra-v9-reused.json";

const EXTRA_V9 =
    "./data/series-extra-v9-matches.json";

const OUTPUT =
    "./data/series-streams-combined.json";


function addEpisode(
    catalog,
    tmdbId,
    seriesName,
    seasonNumber,
    episodeNumber,
    episodeData,
    source
) {

    const id =
        String(tmdbId);

    if (!catalog[id]) {

        catalog[id] = {
            tmdbId: Number(tmdbId),

            name: seriesName,

            seasons: {}
        };
    }


    const series =
        catalog[id];


    if (
        !series.seasons[
            String(seasonNumber)
        ]
    ) {

        series.seasons[
            String(seasonNumber)
        ] = {
            season: Number(
                seasonNumber
            ),

            episodes: {}
        };
    }


    const season =
        series.seasons[
            String(seasonNumber)
        ];


    const ep =
        String(episodeNumber);


    /*
     * Primer stream encontrado:
     * lo dejamos como principal.
     */

    if (!season.episodes[ep]) {

        season.episodes[ep] = {

            episode:
                Number(episodeNumber),

            name:
                episodeData.name ||
                `S${String(seasonNumber).padStart(2, "0")} E${String(episodeNumber).padStart(2, "0")}`,

            streamUrl:
                episodeData.streamUrl,

            sources: [
                {
                    source,

                    url:
                        episodeData.streamUrl
                }
            ]
        };

        return;
    }


    /*
     * El episodio ya existe.
     *
     * Agregamos la nueva fuente
     * sin duplicarla.
     */

    const existing =
        season.episodes[ep];


    const alreadyExists =
        existing.sources.some(
            item =>
                item.url ===
                episodeData.streamUrl
        );


    if (!alreadyExists) {

        existing.sources.push({

            source,

            url:
                episodeData.streamUrl
        });
    }
}


// ======================================================
// CARGAR ARCHIVOS
// ======================================================

const mainParsed =
    JSON.parse(
        await fs.readFile(
            MAIN_PARSED,
            "utf8"
        )
    );


const mainMapping =
    JSON.parse(
        await fs.readFile(
            MAIN_MAPPING,
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


const extraReused =
    JSON.parse(
        await fs.readFile(
            EXTRA_REUSED,
            "utf8"
        )
    );


const extraV9 =
    JSON.parse(
        await fs.readFile(
            EXTRA_V9,
            "utf8"
        )
    );


// ======================================================
// CATÁLOGO
// ======================================================

const catalog = {};


// ======================================================
// MAPA LISTA 1
// ======================================================

const mainMappings = {};

for (
    const [seriesName, item]
    of Object.entries(
        mainMapping
    )
) {

    if (
        item.tmdbId &&
        (
            item.decision ===
                "MATCH_FUERTE" ||
            item.decision ===
                "MATCH_PROBABLE"
        )
    ) {

        mainMappings[
            seriesName
        ] = item.tmdbId;
    }
}


// ======================================================
// LISTA 1 → STREAMS
// ======================================================

let mainSeriesProcessed = 0;
let mainEpisodes = 0;


for (
    const [
        seriesName,
        tmdbId
    ]
    of Object.entries(
        mainMappings
    )
) {

    const series =
        mainParsed[
            seriesName
        ];


    if (!series) {
        continue;
    }


    mainSeriesProcessed++;


    for (
        const [
            seasonNumber,
            seasonData
        ]
        of Object.entries(
            series.seasons || {}
        )
    ) {

        for (
            const [
                episodeNumber,
                episodeData
            ]
            of Object.entries(
                seasonData.episodes || {}
            )
        ) {

            addEpisode(
                catalog,
                tmdbId,
                seriesName,
                seasonNumber,
                episodeNumber,
                episodeData,
                "lista-1"
            );

            mainEpisodes++;
        }
    }
}


// ======================================================
// MAPA LISTA 2
// ======================================================

const extraMappings = {};


// ------------------------------------------------------
// REUTILIZADAS
// ------------------------------------------------------

for (
    const item
    of extraReused
) {

    if (!item.tmdbId) {
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

    extraMappings[
        item.seriesName
    ] = item.tmdbId;
}


// ------------------------------------------------------
// V9
// ------------------------------------------------------

for (
    const item
    of extraV9
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

    extraMappings[
        item.seriesName
    ] =
        item.bestMatch.tmdbId;
}


// ======================================================
// LISTA 2 → STREAMS
// ======================================================

let extraSeriesProcessed = 0;
let extraEpisodes = 0;


for (
    const [
        seriesName,
        tmdbId
    ]
    of Object.entries(
        extraMappings
    )
) {

    const series =
        extraParsed[
            seriesName
        ];


    if (!series) {
        continue;
    }


    extraSeriesProcessed++;


    for (
        const [
            seasonNumber,
            seasonData
        ]
        of Object.entries(
            series.seasons || {}
        )
    ) {

        for (
            const [
                episodeNumber,
                episodeData
            ]
            of Object.entries(
                seasonData.episodes || {}
            )
        ) {

            addEpisode(
                catalog,
                tmdbId,
                seriesName,
                seasonNumber,
                episodeNumber,
                episodeData,
                "lista-2"
            );

            extraEpisodes++;
        }
    }
}


// ======================================================
// ESTADÍSTICAS
// ======================================================

let totalEpisodes = 0;
let episodesWithTwoSources = 0;
let episodesFromList1Only = 0;
let episodesFromList2Only = 0;

for (
    const series
    of Object.values(
        catalog
    )
) {

    for (
        const season
        of Object.values(
            series.seasons
        )
    ) {

        for (
            const episode
            of Object.values(
                season.episodes
            )
        ) {

            totalEpisodes++;


            const sourceCount =
                episode.sources.length;


            if (
                sourceCount >= 2
            ) {

                episodesWithTwoSources++;

            } else if (
                episode.sources[0]?.source ===
                "lista-1"
            ) {

                episodesFromList1Only++;

            } else if (
                episode.sources[0]?.source ===
                "lista-2"
            ) {

                episodesFromList2Only++;
            }
        }
    }
}


// ======================================================
// ORDENAR
// ======================================================

for (
    const series
    of Object.values(
        catalog
    )
) {

    const sortedSeasons = {};

    const seasons =
        Object.keys(
            series.seasons
        )
            .map(Number)
            .sort(
                (a, b) =>
                    a - b
            );


    for (
        const seasonNumber
        of seasons
    ) {

        const season =
            series.seasons[
                String(seasonNumber)
            ];


        const sortedEpisodes = {};


        const episodes =
            Object.keys(
                season.episodes
            )
                .map(Number)
                .sort(
                    (a, b) =>
                        a - b
                );


        for (
            const episodeNumber
            of episodes
        ) {

            sortedEpisodes[
                String(episodeNumber)
            ] =
                season.episodes[
                    String(episodeNumber)
                ];
        }


        sortedSeasons[
            String(seasonNumber)
        ] = {
            season:
                seasonNumber,

            episodes:
                sortedEpisodes
        };
    }


    series.seasons =
        sortedSeasons;
}


// ======================================================
// GUARDAR
// ======================================================

await fs.writeFile(
    OUTPUT,
    JSON.stringify(
        catalog,
        null,
        2
    ),
    "utf8"
);


// ======================================================
// RESULTADO
// ======================================================

console.log(
    "======================================"
);

console.log(
    "🚀 SERIES STREAMS COMBINADOS"
);

console.log(
    "======================================"
);

console.log(
    `📚 Series lista 1 procesadas: ${
        mainSeriesProcessed
    }`
);

console.log(
    `📚 Series lista 2 procesadas: ${
        extraSeriesProcessed
    }`
);

console.log(
    `🆔 TMDB IDs únicos: ${
        Object.keys(catalog).length
    }`
);

console.log(
    `🎬 Episodios procesados lista 1: ${
        mainEpisodes
    }`
);

console.log(
    `🎬 Episodios procesados lista 2: ${
        extraEpisodes
    }`
);

console.log(
    `🎬 Episodios únicos finales: ${
        totalEpisodes
    }`
);

console.log(
    `🔄 Episodios con ambas fuentes: ${
        episodesWithTwoSources
    }`
);

console.log(
    `1️⃣ Solo lista 1: ${
        episodesFromList1Only
    }`
);

console.log(
    `2️⃣ Solo lista 2: ${
        episodesFromList2Only
    }`
);

console.log(
    `\n📄 ${OUTPUT}`
);