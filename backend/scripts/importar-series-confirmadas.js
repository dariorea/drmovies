import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================
// CONFIGURACIÓN
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");

const MATCH_FILE = path.join(
    DATA_DIR,
    "series-m3u-tmdb-lista-1.json"
);

const CATALOG_FILE = path.join(
    DATA_DIR,
    "series-streams-combined.json"
);

const SOURCE = "lista-1";

// ============================================================
// UTILIDADES
// ============================================================

function readJSON(file) {
    return JSON.parse(
        fs.readFileSync(file, "utf8")
    );
}

function writeJSON(file, data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2) + "\n",
        "utf8"
    );
}

function backupFile(file) {
    const backup =
        `${file}.import-lista-1-backup-${Date.now()}.json`;

    fs.copyFileSync(
        file,
        backup
    );

    return backup;
}

function ensureObject(value) {
    return value && typeof value === "object"
        ? value
        : {};
}

function ensureSources(episode) {
    if (!Array.isArray(episode.sources)) {
        episode.sources = [];
    }

    return episode.sources;
}

function hasSource(episode, source) {
    const sources = ensureSources(episode);

    return sources.some(
        item =>
            item &&
            item.source === source
    );
}

// ============================================================
// OBTENER MATCHES CONFIRMADOS
// ============================================================

function getConfirmedMatches(data) {

    const series =
        ensureObject(data.series);

    const confirmed = [];

    for (const [key, item] of Object.entries(series)) {

        if (
            !item ||
            typeof item !== "object"
        ) {
            continue;
        }

        const tmdbMatch =
            item.tmdbMatch;

        const tmdbId =
            item.tmdbId;

        if (!tmdbId) {
            continue;
        }

        /*
         * Aceptamos únicamente matches confirmados.
         */

        const matchType =
            String(
                tmdbMatch?.matchType ?? ""
            ).toUpperCase();

        if (
            matchType !== "EXACT" &&
            matchType !== "CONFIRMED" &&
            matchType !== "MATCH_CONFIRMED"
        ) {
            continue;
        }

        /*
         * IMPORTANTE:
         *
         * Antes acá se construía un objeto nuevo solamente
         * con name, tmdbId y tmdbMatch.
         *
         * Eso hacía desaparecer seasons y episodes.
         *
         * Ahora conservamos TODO el registro original.
         */

        confirmed.push({
            ...item,

            sourceKey: key,

            name:
                item.name ??
                tmdbMatch?.searchedName ??
                String(key),

            tmdbId:
                Number(tmdbId),

            tmdbMatch
        });
    }

    return confirmed;
}

// ============================================================
// OBTENER URL DE LISTA-1
// ============================================================

function getSourceUrl(sourceEpisode) {

    /*
     * Primero intentamos streamUrl.
     */

    if (
        sourceEpisode &&
        sourceEpisode.streamUrl
    ) {
        return sourceEpisode.streamUrl;
    }

    /*
     * Si no existe, buscamos específicamente
     * la source lista-1.
     */

    if (
        sourceEpisode &&
        Array.isArray(sourceEpisode.sources)
    ) {

        const source =
            sourceEpisode.sources.find(
                item =>
                    item &&
                    item.source === SOURCE &&
                    item.url
            );

        if (source) {
            return source.url;
        }
    }

    return null;
}

// ============================================================
// IMPORTAR UNA SERIE
// ============================================================

function importSeries(
    sourceSeries,
    catalog,
    stats
) {

    const tmdbId =
        String(sourceSeries.tmdbId);

    /*
     * AHORA SÍ tenemos seasons porque
     * getConfirmedMatches() conserva el objeto completo.
     */

    const sourceSeasons =
        ensureObject(
            sourceSeries.seasons
        );

    // --------------------------------------------------------
    // SERIE NO EXISTE
    // --------------------------------------------------------

    let targetSeries =
        catalog[tmdbId];

    if (!targetSeries) {

        targetSeries = {

            tmdbId:
                sourceSeries.tmdbId,

            name:
                sourceSeries.tmdb?.name ??
                sourceSeries.name,

            seasons: {}
        };

        catalog[tmdbId] =
            targetSeries;

        stats.newSeries++;

        console.log(
            `🆕 Serie nueva → ${sourceSeries.name} (${tmdbId})`
        );
    }

    // --------------------------------------------------------
    // ASEGURAR CAMPOS
    // --------------------------------------------------------

    if (
        !targetSeries.name &&
        sourceSeries.name
    ) {

        targetSeries.name =
            sourceSeries.name;
    }

    if (
        !targetSeries.seasons ||
        typeof targetSeries.seasons !== "object"
    ) {

        targetSeries.seasons = {};
    }

    // --------------------------------------------------------
    // TEMPORADAS
    // --------------------------------------------------------

    for (
        const [
            seasonKey,
            sourceSeason
        ]
        of Object.entries(sourceSeasons)
    ) {

        if (
            !sourceSeason ||
            typeof sourceSeason !== "object"
        ) {
            continue;
        }

        let targetSeason =
            targetSeries.seasons[seasonKey];

        // ----------------------------------------------------
        // TEMPORADA NUEVA
        // ----------------------------------------------------

        if (!targetSeason) {

            targetSeason = {

                season:
                    sourceSeason.season ??
                    Number(seasonKey),

                episodes: {}
            };

            targetSeries.seasons[seasonKey] =
                targetSeason;

            stats.newSeasons++;

            console.log(
                `   🆕 Temporada ${seasonKey}`
            );
        }

        if (
            !targetSeason.episodes ||
            typeof targetSeason.episodes !== "object"
        ) {

            targetSeason.episodes = {};
        }

        // ----------------------------------------------------
        // EPISODIOS
        // ----------------------------------------------------

        const sourceEpisodes =
            ensureObject(
                sourceSeason.episodes
            );

        for (
            const [
                episodeKey,
                sourceEpisode
            ]
            of Object.entries(sourceEpisodes)
        ) {

            if (
                !sourceEpisode ||
                typeof sourceEpisode !== "object"
            ) {
                continue;
            }

            let targetEpisode =
                targetSeason.episodes[episodeKey];

            // ------------------------------------------------
            // EPISODIO NUEVO
            // ------------------------------------------------

            if (!targetEpisode) {

                targetEpisode = {

                    episode:
                        sourceEpisode.episode ??
                        Number(episodeKey),

                    name:
                        sourceEpisode.name ??
                        `${sourceSeries.name} S${String(seasonKey).padStart(2, "0")} E${String(episodeKey).padStart(2, "0")}`,

                    streamUrl:
                        sourceEpisode.streamUrl ??
                        null,

                    sources: []
                };

                targetSeason.episodes[episodeKey] =
                    targetEpisode;

                stats.newEpisodes++;

                console.log(
                    `      🆕 S${String(seasonKey).padStart(2, "0")}E${String(episodeKey).padStart(2, "0")} → lista-1`
                );

                // --------------------------------------------
                // BUSCAR URL LISTA-1
                // --------------------------------------------

                const sourceUrl =
                    getSourceUrl(
                        sourceEpisode
                    );

                if (sourceUrl) {

                    ensureSources(
                        targetEpisode
                    ).push({

                        source: SOURCE,

                        url: sourceUrl
                    });

                    stats.sourcesAdded++;

                } else {

                    stats.missingUrl++;

                    console.log(
                        `      ⚠️ Sin URL → ${sourceSeries.name} S${seasonKey}E${episodeKey}`
                    );
                }

                continue;
            }

            // ------------------------------------------------
            // EPISODIO EXISTENTE
            // ------------------------------------------------

            if (
                hasSource(
                    targetEpisode,
                    SOURCE
                )
            ) {

                stats.alreadyHadSource++;

                continue;
            }

            // ------------------------------------------------
            // BUSCAR URL LISTA-1
            // ------------------------------------------------

            const sourceUrl =
                getSourceUrl(
                    sourceEpisode
                );

            if (!sourceUrl) {

                stats.missingUrl++;

                console.log(
                    `      ⚠️ Sin URL → ${sourceSeries.name} S${seasonKey}E${episodeKey}`
                );

                continue;
            }

            // ------------------------------------------------
            // AGREGAR LISTA-1
            // ------------------------------------------------

            ensureSources(
                targetEpisode
            ).push({

                source: SOURCE,

                url: sourceUrl
            });

            stats.sourcesAdded++;

            console.log(
                `      ➕ lista-1 → ${sourceSeries.name} S${String(seasonKey).padStart(2, "0")}E${String(episodeKey).padStart(2, "0")}`
            );
        }
    }
}

// ============================================================
// MAIN
// ============================================================

function main() {

    console.log(
        "=============================================="
    );

    console.log(
        " IMPORTAR SERIES LISTA 1 — MATCH CONFIRMADOS"
    );

    console.log(
        "=============================================="
    );

    console.log();

    // --------------------------------------------------------
    // VALIDAR ARCHIVOS
    // --------------------------------------------------------

    if (!fs.existsSync(MATCH_FILE)) {

        console.error(
            `❌ No existe:\n${MATCH_FILE}`
        );

        process.exit(1);
    }

    if (!fs.existsSync(CATALOG_FILE)) {

        console.error(
            `❌ No existe:\n${CATALOG_FILE}`
        );

        process.exit(1);
    }

    // --------------------------------------------------------
    // LEER
    // --------------------------------------------------------

    const matchData =
        readJSON(MATCH_FILE);

    const catalog =
        readJSON(CATALOG_FILE);

    // --------------------------------------------------------
    // MATCHES
    // --------------------------------------------------------

    const confirmed =
        getConfirmedMatches(
            matchData
        );

    console.log(
        `📚 Matches confirmados encontrados: ${confirmed.length}`
    );

    console.log();

    if (confirmed.length === 0) {

        console.log(
            "⚠️ No hay matches confirmados para importar."
        );

        return;
    }

    // --------------------------------------------------------
    // ESTADÍSTICAS
    // --------------------------------------------------------

    const stats = {

        confirmedSeries:
            confirmed.length,

        newSeries: 0,

        newSeasons: 0,

        newEpisodes: 0,

        sourcesAdded: 0,

        alreadyHadSource: 0,

        missingUrl: 0,

        seriesNotFound: 0
    };

    // --------------------------------------------------------
    // BACKUP
    // --------------------------------------------------------

    console.log(
        "💾 Creando backup..."
    );

    const backup =
        backupFile(
            CATALOG_FILE
        );

    console.log(
        `✅ Backup:\n${backup}`
    );

    console.log();

    // --------------------------------------------------------
    // IMPORTAR
    // --------------------------------------------------------

    for (
        let i = 0;
        i < confirmed.length;
        i++
    ) {

        const item =
            confirmed[i];

        console.log(
            `[${i + 1}/${confirmed.length}] ${item.name} → TMDB ${item.tmdbId}`
        );

        importSeries(
            item,
            catalog,
            stats
        );
    }

    // --------------------------------------------------------
    // GUARDAR
    // --------------------------------------------------------

    console.log();

    console.log(
        "💾 Guardando catálogo..."
    );

    writeJSON(
        CATALOG_FILE,
        catalog
    );

    // --------------------------------------------------------
    // RESUMEN
    // --------------------------------------------------------

    console.log();

    console.log(
        "=============================================="
    );

    console.log(
        " PROCESO TERMINADO"
    );

    console.log(
        "=============================================="
    );

    console.log(
        `Series confirmadas:       ${stats.confirmedSeries}`
    );

    console.log(
        `Series nuevas:            ${stats.newSeries}`
    );

    console.log(
        `Temporadas nuevas:        ${stats.newSeasons}`
    );

    console.log(
        `Episodios nuevos:         ${stats.newEpisodes}`
    );

    console.log(
        `➕ Sources lista-1:        ${stats.sourcesAdded}`
    );

    console.log(
        `⏭️ Ya tenían lista-1:      ${stats.alreadyHadSource}`
    );

    console.log(
        `⚠️ Sin URL:                ${stats.missingUrl}`
    );

    console.log();

    console.log(
        "📄 Catálogo actualizado:"
    );

    console.log(
        CATALOG_FILE
    );

    console.log();

    console.log(
        "💾 Backup:"
    );

    console.log(
        backup
    );

    console.log(
        "=============================================="
    );
}

main();