import fs from "fs/promises";

const EXTRA_FILE =
    "./data/series-parsed-extra.json";

const FINAL_FILE =
    "./data/series-tmdb-final.json";

const OUTPUT_REUSED =
    "./data/series-extra-v9-reused.json";

const OUTPUT_PENDING =
    "./data/series-extra-v9-pending.json";


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


// ======================================================
// CARGAR DATOS
// ======================================================

const extra = JSON.parse(
    await fs.readFile(
        EXTRA_FILE,
        "utf8"
    )
);

const final = JSON.parse(
    await fs.readFile(
        FINAL_FILE,
        "utf8"
    )
);


// ======================================================
// INDEXAR MAPPINGS EXISTENTES
// ======================================================

const finalIndex = new Map();

for (const item of Object.values(final)) {

    /*
     * Solo reutilizamos mappings que ya
     * consideramos aprovechables.
     */

    if (
        item.decision !== "MATCH_FUERTE" &&
        item.decision !== "MATCH_PROBABLE"
    ) {
        continue;
    }

    if (!item.tmdbId) {
        continue;
    }

    const names = [
        item.seriesName,
        item.name
    ];

    for (const name of names) {

        if (!name) {
            continue;
        }

        const normalized =
            normalizeTitle(name);

        if (!normalized) {
            continue;
        }

        /*
         * Si ya existe, conservamos el primero.
         */
        if (!finalIndex.has(normalized)) {

            finalIndex.set(
                normalized,
                item
            );
        }
    }
}


// ======================================================
// PROCESAR LISTA 2
// ======================================================

const reused = [];
const pending = [];

for (
    const [name, series]
    of Object.entries(extra)
) {

    const normalized =
        normalizeTitle(name);

    const existing =
        finalIndex.get(normalized);


    if (existing) {

        reused.push({

            seriesName:
                name,

            source:
                "LISTA_1",

            tmdbId:
                existing.tmdbId,

            tmdbName:
                existing.name,

            decision:
                existing.decision,

            firstAirDate:
                existing.firstAirDate || null,

            groupTitle:
                series.groupTitle || null,

            logo:
                series.logo || null,

            seasons:
                Object.keys(
                    series.seasons || {}
                ).map(Number),

            totalEpisodes:
                Object.values(
                    series.seasons || {}
                )
                    .reduce(
                        (total, season) =>
                            total +
                            Object.keys(
                                season.episodes || {}
                            ).length,
                        0
                    )
        });

    } else {

        pending.push({

            seriesName:
                name,

            groupTitle:
                series.groupTitle || null,

            logo:
                series.logo || null,

            seasons:
                Object.keys(
                    series.seasons || {}
                ).map(Number),

            totalEpisodes:
                Object.values(
                    series.seasons || {}
                )
                    .reduce(
                        (total, season) =>
                            total +
                            Object.keys(
                                season.episodes || {}
                            ).length,
                        0
                    ),

            m3uStructure:
                Object.fromEntries(
                    Object.entries(
                        series.seasons || {}
                    ).map(
                        ([season, data]) => [
                            Number(season),
                            Object.keys(
                                data.episodes || {}
                            ).length
                        ]
                    )
                )
        });
    }
}


// ======================================================
// GUARDAR
// ======================================================

await fs.writeFile(
    OUTPUT_REUSED,
    JSON.stringify(
        reused,
        null,
        2
    ),
    "utf8"
);

await fs.writeFile(
    OUTPUT_PENDING,
    JSON.stringify(
        pending,
        null,
        2
    ),
    "utf8"
);


// ======================================================
// ESTADÍSTICAS
// ======================================================

const total =
    Object.keys(extra).length;

const reusedEpisodes =
    reused.reduce(
        (total, item) =>
            total +
            item.totalEpisodes,
        0
    );

const pendingEpisodes =
    pending.reduce(
        (total, item) =>
            total +
            item.totalEpisodes,
        0
    );


console.log(
    "======================================"
);

console.log(
    "🚀 PREPARANDO LISTA 2 - V9"
);

console.log(
    "======================================"
);

console.log(
    `📚 Series lista 2: ${total}`
);

console.log(
    `♻️ Reutilizables: ${reused.length}`
);

console.log(
    `🔎 Para nuevo matching: ${pending.length}`
);

console.log(
    `🎬 Episodios reutilizables: ${reusedEpisodes}`
);

console.log(
    `🎬 Episodios pendientes: ${pendingEpisodes}`
);

console.log(
    "\n--------------------------------------"
);

console.log(
    `📄 Reutilizables: ${OUTPUT_REUSED}`
);

console.log(
    `📄 Pendientes: ${OUTPUT_PENDING}`
);