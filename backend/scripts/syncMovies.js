import "dotenv/config";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
    downloadM3U,
    parseM3U,
    sanitizeStreamUrl
} from "../services/m3u.service.js";

import {
    matchMovie
} from "../services/movieMatcher.service.js";

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const DATA_DIR =
    path.join(__dirname, "../data");

const STREAMS_FILE =
    path.join(
        DATA_DIR,
        "movie-streams.json"
    );

const PRIVATE_STREAMS_FILE =
    path.join(
        DATA_DIR,
        "movie-streams-private.json"
    );

const UNMATCHED_FILE =
    path.join(
        DATA_DIR,
        "unmatched-movies.json"
    );

const CACHE_FILE =
    path.join(
        DATA_DIR,
        "tmdb-cache.json"
    );

const BACKUP_DIR =
    path.join(
        DATA_DIR,
        "sync-backups"
    );

async function readJson(
    file,
    defaultValue
) {
    try {
        const content =
            await fs.readFile(
                file,
                "utf8"
            );

        return JSON.parse(content);

    } catch {
        return defaultValue;
    }
}

async function writeJson(
    file,
    data
) {
    await fs.writeFile(
        file,
        JSON.stringify(
            data,
            null,
            4
        ),
        "utf8"
    );
}

/*
 * ==================================================
 * NORMALIZAR PRIVATE STREAMS
 * ==================================================
 *
 * Soporta:
 *
 * FORMATO VIEJO
 *
 * {
 *   tmdbId,
 *   streamUrl
 * }
 *
 * FORMATO NUEVO
 *
 * {
 *   tmdbId,
 *   streams: [
 *      { streamUrl },
 *      { streamUrl }
 *   ]
 * }
 */

function normalizePrivateMovie(
    movie
) {
    if (!movie) {
        return null;
    }

    const streams = [];

    /*
     * Formato nuevo
     */
    if (
        Array.isArray(
            movie.streams
        )
    ) {
        for (
            const stream
            of movie.streams
        ) {
            if (
                stream?.streamUrl &&
                !streams.some(
                    existing =>
                        existing.streamUrl ===
                        stream.streamUrl
                )
            ) {
                streams.push({
                    streamUrl:
                        stream.streamUrl
                });
            }
        }
    }

    /*
     * Formato viejo
     *
     * Lo conservamos durante la migración.
     */
    if (
        movie.streamUrl &&
        !streams.some(
            stream =>
                stream.streamUrl ===
                movie.streamUrl
        )
    ) {
        streams.push({
            streamUrl:
                movie.streamUrl
        });
    }

    if (streams.length === 0) {
        return {
            tmdbId:
                movie.tmdbId,
            streams: []
        };
    }

    return {
        tmdbId:
            movie.tmdbId,
        streams
    };
}

/*
 * ==================================================
 * CREAR BACKUP
 * ==================================================
 */

async function backupFile(
    file
) {
    try {
        await fs.access(file);
    } catch {
        return;
    }

    await fs.mkdir(
        BACKUP_DIR,
        {
            recursive: true
        }
    );

    const filename =
        path.basename(file);

    const backupPath =
        path.join(
            BACKUP_DIR,
            `${filename}.${Date.now()}.backup.json`
        );

    await fs.copyFile(
        file,
        backupPath
    );

    console.log(
        `💾 Backup: ${backupPath}`
    );
}

/*
 * ==================================================
 * CACHE KEY
 * ==================================================
 */

function createCacheKey(
    movie
) {
    return [
        movie.name ?? "",
        movie.year ?? "",
        movie.posterPath ?? ""
    ].join("|");
}

/*
 * ==================================================
 * MAIN
 * ==================================================
 */

async function main() {
    console.log(
        "\n🚀 Iniciando sincronización M3U...\n"
    );

    await fs.mkdir(
        DATA_DIR,
        {
            recursive: true
        }
    );

    /*
     * ==================================================
     * CARGAR DATOS EXISTENTES
     * ==================================================
     */

    const publicStreams =
        await readJson(
            STREAMS_FILE,
            {}
        );

    const oldPrivateStreams =
        await readJson(
            PRIVATE_STREAMS_FILE,
            {}
        );

    const unmatchedMovies =
        await readJson(
            UNMATCHED_FILE,
            []
        );

    const tmdbCache =
        await readJson(
            CACHE_FILE,
            {}
        );

    /*
     * ==================================================
     * NORMALIZAR PRIVATE
     * ==================================================
     */

    const privateStreams = {};

    for (
        const [
            tmdbId,
            movie
        ]
        of Object.entries(
            oldPrivateStreams
        )
    ) {
        const normalized =
            normalizePrivateMovie(
                movie
            );

        if (normalized) {
            privateStreams[
                String(tmdbId)
            ] = normalized;
        }
    }

    /*
     * ==================================================
     * BACKUPS
     * ==================================================
     */

    await backupFile(
        STREAMS_FILE
    );

    await backupFile(
        PRIVATE_STREAMS_FILE
    );

    await backupFile(
        UNMATCHED_FILE
    );

    await backupFile(
        CACHE_FILE
    );

    /*
     * ==================================================
     * DESCARGAR M3U
     * ==================================================
     */

    const content =
        await downloadM3U();

    const movies =
        parseM3U(content);

    console.log(
        `🎬 Entradas de películas M3U: ${movies.length}\n`
    );

    /*
     * ==================================================
     * CONTADORES
     * ==================================================
     */

    let matchedCount = 0;
    let unmatchedCount = 0;
    let newMoviesCount = 0;
    let newStreamsCount = 0;
    let duplicateStreamsCount = 0;
    let cacheHits = 0;

    /*
     * ==================================================
     * PROCESAR M3U
     * ==================================================
     */

    for (
        let i = 0;
        i < movies.length;
        i++
    ) {
        const movie =
            movies[i];

        const cacheKey =
            createCacheKey(
                movie
            );

        let match =
            tmdbCache[
                cacheKey
            ];

        /*
         * ==============================================
         * CACHE
         * ==============================================
         */

        if (
            match &&
            match.matched
        ) {
            cacheHits++;

            console.log(
                `♻️ Cache: ${movie.name}`
            );

        } else {
            /*
             * Si el cache tenía un
             * unmatched, volvemos a intentar.
             */

            console.log(
                `🔎 TMDB: ${movie.name}`
            );

            match =
                await matchMovie(
                    movie
                );

            tmdbCache[
                cacheKey
            ] = match;
        }

        /*
         * ==============================================
         * SIN MATCH
         * ==============================================
         */

        if (
            !match?.matched
        ) {
            unmatchedCount++;

            /*
             * Evitamos duplicar unmatched.
             */

            const exists =
                unmatchedMovies.some(
                    item =>
                        item.name ===
                        movie.name &&
                        item.year ===
                        movie.year
                );

            if (!exists) {
                unmatchedMovies.push({
                    name:
                        movie.name,
                    year:
                        movie.year,
                    posterPath:
                        movie.posterPath,
                    streamUrl:
                        sanitizeStreamUrl(
                            movie.streamUrl
                        ),
                    reason:
                        match?.reason ??
                        "no-match"
                });
            }

            continue;
        }

        matchedCount++;

        const tmdbId =
            String(
                match.tmdbId
            );

        /*
         * ==============================================
         * CREAR CATÁLOGO PÚBLICO SI NO EXISTE
         * ==============================================
         */

        if (
            !publicStreams[
                tmdbId
            ]
        ) {
            publicStreams[
                tmdbId
            ] = {
                tmdbId:
                    match.tmdbId,

                title:
                    match.title,

                originalTitle:
                    match.originalTitle,

                year:
                    match.year,

                posterPath:
                    match.posterPath,

                streamUrl:
                    sanitizeStreamUrl(
                        movie.streamUrl
                    ),

                matchMethod:
                    match.matchMethod,

                confidence:
                    match.confidence
            };

            newMoviesCount++;

            console.log(
                `🆕 Nueva película TMDB ${tmdbId}: ${match.title}`
            );
        }

        /*
         * ==============================================
         * PRIVATE STREAMS
         * ==============================================
         */

        if (
            !privateStreams[
                tmdbId
            ]
        ) {
            privateStreams[
                tmdbId
            ] = {
                tmdbId:
                    match.tmdbId,

                streams: []
            };
        }

        /*
         * Por seguridad, si algo
         * quedó en formato viejo,
         * lo normalizamos.
         */

        if (
            !Array.isArray(
                privateStreams[
                    tmdbId
                ].streams
            )
        ) {
            privateStreams[
                tmdbId
            ] = normalizePrivateMovie(
                privateStreams[
                    tmdbId
                ]
            );
        }

        /*
         * ==============================================
         * AGREGAR URL
         * ==============================================
         */

        const exists =
            privateStreams[
                tmdbId
            ].streams.some(
                stream =>
                    stream.streamUrl ===
                    movie.streamUrl
            );

        if (exists) {
            duplicateStreamsCount++;

            console.log(
                `♻️ Stream ya existente TMDB ${tmdbId}`
            );

        } else {
            privateStreams[
                tmdbId
            ].streams.push({
                streamUrl:
                    movie.streamUrl
            });

            newStreamsCount++;

            console.log(
                `➕ Nuevo stream TMDB ${tmdbId}: ${privateStreams[tmdbId].streams.length} total`
            );
        }

        /*
         * ==============================================
         * GUARDADO INTERMEDIO
         * ==============================================
         *
         * Cada 25 entradas para evitar
         * perder todo si el proceso falla.
         */

        if (
            (i + 1) % 25 ===
            0
        ) {
            await writeJson(
                STREAMS_FILE,
                publicStreams
            );

            await writeJson(
                PRIVATE_STREAMS_FILE,
                privateStreams
            );

            await writeJson(
                UNMATCHED_FILE,
                unmatchedMovies
            );

            await writeJson(
                CACHE_FILE,
                tmdbCache
            );

            console.log(
                `\n💾 Progreso guardado: ${i + 1}/${movies.length}\n`
            );
        }
    }

    /*
     * ==================================================
     * GUARDADO FINAL
     * ==================================================
     */

    await writeJson(
        STREAMS_FILE,
        publicStreams
    );

    await writeJson(
        PRIVATE_STREAMS_FILE,
        privateStreams
    );

    await writeJson(
        UNMATCHED_FILE,
        unmatchedMovies
    );

    await writeJson(
        CACHE_FILE,
        tmdbCache
    );

    /*
     * ==================================================
     * ESTADÍSTICAS
     * ==================================================
     */

    let totalPrivateUrls = 0;

    for (
        const movie
        of Object.values(
            privateStreams
        )
    ) {
        totalPrivateUrls +=
            Array.isArray(
                movie.streams
            )
                ? movie.streams.length
                : 0;
    }

    console.log(
        "\n========================================"
    );

    console.log(
        "🎉 SINCRONIZACIÓN TERMINADA"
    );

    console.log(
        "========================================"
    );

    console.log(
        `Entradas M3U: ${movies.length}`
    );

    console.log(
        `Matches: ${matchedCount}`
    );

    console.log(
        `Sin match: ${unmatchedCount}`
    );

    console.log(
        `Cache hits: ${cacheHits}`
    );

    console.log(
        `Películas nuevas: ${newMoviesCount}`
    );

    console.log(
        `Streams nuevos: ${newStreamsCount}`
    );

    console.log(
        `Streams ya existentes: ${duplicateStreamsCount}`
    );

    console.log(
        `Películas con URLs privadas: ${Object.keys(privateStreams).length}`
    );

    console.log(
        `URLs privadas totales: ${totalPrivateUrls}`
    );

    console.log(
        "\nArchivos actualizados:"
    );

    console.log(
        "→ movie-streams.json"
    );

    console.log(
        "→ movie-streams-private.json"
    );

    console.log(
        "→ unmatched-movies.json"
    );

    console.log(
        "→ tmdb-cache.json"
    );
}

main().catch(
    error => {
        console.error(
            "\n❌ Error fatal:"
        );

        console.error(
            error
        );

        process.exit(1);
    }
);