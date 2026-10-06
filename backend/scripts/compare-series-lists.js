import fs from "fs/promises";

const MAIN_FILE =
    "./data/series-parsed.json";

const EXTRA_FILE =
    "./data/series-parsed-extra.json";

const OUTPUT_FILE =
    "./data/series-lists-comparison.json";


function normalizeTitle(title) {
    return title
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "";
}


function getStructure(series) {

    const structure = {};

    for (
        const [season, seasonData]
        of Object.entries(series.seasons || {})
    ) {

        structure[Number(season)] =
            Object.keys(
                seasonData.episodes || {}
            ).map(Number);
    }

    return structure;
}


function totalEpisodes(series) {

    let total = 0;

    for (
        const season
        of Object.values(series.seasons || {})
    ) {

        total += Object.keys(
            season.episodes || {}
        ).length;
    }

    return total;
}


function compareEpisodes(
    mainSeries,
    extraSeries
) {

    let common = 0;
    let mainTotal = 0;
    let extraTotal = 0;

    const newEpisodes = {};

    for (
        const [season, seasonData]
        of Object.entries(mainSeries.seasons || {})
    ) {

        const mainEpisodes =
            Object.keys(
                seasonData.episodes || {}
            ).map(Number);

        mainTotal +=
            mainEpisodes.length;

        const extraSeason =
            extraSeries.seasons?.[season];

        const extraEpisodes =
            extraSeason
                ? Object.keys(
                    extraSeason.episodes || {}
                ).map(Number)
                : [];

        for (
            const episode
            of mainEpisodes
        ) {

            if (
                extraEpisodes.includes(
                    episode
                )
            ) {
                common++;
            }
        }
    }


    for (
        const seasonData
        of Object.values(
            extraSeries.seasons || {}
        )
    ) {

        extraTotal +=
            Object.keys(
                seasonData.episodes || {}
            ).length;
    }


    /*
     * Episodios que están en lista 2
     * pero no en lista 1.
     */

    for (
        const [season, seasonData]
        of Object.entries(
            extraSeries.seasons || {}
        )
    ) {

        const extraEpisodes =
            Object.keys(
                seasonData.episodes || {}
            ).map(Number);

        const mainEpisodes =
            mainSeries.seasons?.[season]
                ? Object.keys(
                    mainSeries.seasons[
                        season
                    ].episodes || {}
                ).map(Number)
                : [];

        const missing =
            extraEpisodes.filter(
                episode =>
                    !mainEpisodes.includes(
                        episode
                    )
            );

        if (missing.length) {

            newEpisodes[season] =
                missing;
        }
    }


    return {
        mainTotal,
        extraTotal,
        commonEpisodes: common,
        newEpisodes
    };
}


function buildIndex(data) {

    const index = new Map();

    for (
        const [name, series]
        of Object.entries(data)
    ) {

        const normalized =
            normalizeTitle(name);

        if (!normalized) {
            continue;
        }

        if (!index.has(normalized)) {

            index.set(
                normalized,
                []
            );
        }

        index
            .get(normalized)
            .push({
                name,
                series
            });
    }

    return index;
}


const main =
    JSON.parse(
        await fs.readFile(
            MAIN_FILE,
            "utf8"
        )
    );

const extra =
    JSON.parse(
        await fs.readFile(
            EXTRA_FILE,
            "utf8"
        )
    );


console.log(
    "======================================"
);

console.log(
    "🔎 COMPARANDO LISTAS DE SERIES"
);

console.log(
    "======================================"
);

console.log(
    `📚 Lista 1: ${
        Object.keys(main).length
    } series`
);

console.log(
    `📚 Lista 2: ${
        Object.keys(extra).length
    } series`
);


const mainIndex =
    buildIndex(main);

const matched = [];
const onlyExtra = [];
const titleVariants = [];

let duplicatedExtraNames = 0;


// ======================================================
// RECORRER LISTA 2
// ======================================================

for (
    const [
        extraName,
        extraSeries
    ]
    of Object.entries(extra)
) {

    const normalized =
        normalizeTitle(
            extraName
        );

    const matches =
        mainIndex.get(
            normalized
        );


    // ----------------------------------------------
    // NO EXISTE EN LISTA 1
    // ----------------------------------------------

    if (!matches?.length) {

        onlyExtra.push({
            name: extraName,

            normalized,

            groupTitle:
                extraSeries.groupTitle,

            logo:
                extraSeries.logo,

            seasons:
                getStructure(
                    extraSeries
                ),

            totalEpisodes:
                totalEpisodes(
                    extraSeries
                )
        });

        continue;
    }


    // ----------------------------------------------
    // MISMO NOMBRE
    // ----------------------------------------------

    const mainMatch =
        matches[0];


    const comparison =
        compareEpisodes(
            mainMatch.series,
            extraSeries
        );


    matched.push({

        mainName:
            mainMatch.name,

        extraName,

        tmdbCandidates:
            [],

        mainTotal:
            comparison.mainTotal,

        extraTotal:
            comparison.extraTotal,

        commonEpisodes:
            comparison.commonEpisodes,

        extraEpisodes:
            comparison.newEpisodes,

        mainStructure:
            getStructure(
                mainMatch.series
            ),

        extraStructure:
            getStructure(
                extraSeries
            )
    });


    if (matches.length > 1) {

        duplicatedExtraNames++;

        titleVariants.push({

            normalized,

            names:
                matches.map(
                    x => x.name
                ),

            extraName
        });
    }
}


// ======================================================
// ESTADÍSTICAS
// ======================================================

const matchedEpisodes =
    matched.reduce(
        (sum, item) =>
            sum +
            item.commonEpisodes,
        0
    );

const extraOnlyEpisodes =
    matched.reduce(
        (sum, item) =>
            sum +
            Object.values(
                item.extraEpisodes
            )
                .reduce(
                    (a, arr) =>
                        a + arr.length,
                    0
                ),
        0
    );


const totalExtra =
    Object.values(extra)
        .reduce(
            (sum, series) =>
                sum +
                totalEpisodes(series),
            0
        );


const totalMain =
    Object.values(main)
        .reduce(
            (sum, series) =>
                sum +
                totalEpisodes(series),
            0
        );


// ======================================================
// GUARDAR
// ======================================================

const result = {

    statistics: {

        mainSeries:
            Object.keys(main).length,

        extraSeries:
            Object.keys(extra).length,

        matchedSeries:
            matched.length,

        newSeries:
            onlyExtra.length,

        duplicateNameCases:
            duplicatedExtraNames,

        mainEpisodes:
            totalMain,

        extraEpisodes:
            totalExtra,

        commonEpisodes:
            matchedEpisodes,

        newEpisodesFromExtra:
            extraOnlyEpisodes
    },

    matched,

    onlyExtra,

    titleVariants
};


await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
        result,
        null,
        2
    ),
    "utf8"
);


// ======================================================
// MOSTRAR RESULTADOS
// ======================================================

console.log(
    "\n======================================"
);

console.log(
    "✅ COMPARACIÓN TERMINADA"
);

console.log(
    "======================================"
);

console.log(
    `📚 Series lista 1: ${
        Object.keys(main).length
    }`
);

console.log(
    `📚 Series lista 2: ${
        Object.keys(extra).length
    }`
);

console.log(
    `🔵 Series presentes en ambas: ${
        matched.length
    }`
);

console.log(
    `🟢 Series nuevas de lista 2: ${
        onlyExtra.length
    }`
);

console.log(
    `🟡 Casos con nombres duplicados: ${
        duplicatedExtraNames
    }`
);

console.log(
    `🎬 Episodios lista 1: ${
        totalMain
    }`
);

console.log(
    `🎬 Episodios lista 2: ${
        totalExtra
    }`
);

console.log(
    `🔗 Episodios compartidos: ${
        matchedEpisodes
    }`
);

console.log(
    `➕ Episodios adicionales lista 2: ${
        extraOnlyEpisodes
    }`
);

console.log(
    `\n📄 ${
        OUTPUT_FILE
    }`
);