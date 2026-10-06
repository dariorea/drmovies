import "dotenv/config";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

const execFileAsync =
    promisify(execFile);

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const DATA_DIR =
    path.join(
        __dirname,
        "../data"
    );

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

const OUTPUT_FILE =
    path.join(
        DATA_DIR,
        "movie-streams-all.json"
    );

const BACKUP_FILE =
    path.join(
        DATA_DIR,
        "movie-streams-all.backup.json"
    );

const TEMP_FILE =
    path.join(
        DATA_DIR,
        "movie-streams-all.tmp.json"
    );

const CONCURRENCY = 2;

const PROBE_TIMEOUT =
    15 * 60 * 1000;

/*
 * ==================================================
 * JSON
 * ==================================================
 */

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

        return JSON.parse(
            content
        );

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
 * HASH
 * ==================================================
 */

function hashUrl(
    url
) {
    return crypto
        .createHash(
            "sha256"
        )
        .update(url)
        .digest("hex");
}

/*
 * ==================================================
 * SANITIZAR URL
 * ==================================================
 */

function sanitizeStreamUrl(
    streamUrl
) {
    try {
        const url =
            new URL(
                streamUrl
            );

        const parts =
            url.pathname.split(
                "/"
            );

        const typeIndex =
            parts.findIndex(
                part =>
                    part ===
                        "movie" ||
                    part ===
                        "series"
            );

        if (
            typeIndex === -1
        ) {
            return streamUrl;
        }

        const userIndex =
            typeIndex + 1;

        const passwordIndex =
            typeIndex + 2;

        if (
            !parts[userIndex] ||
            !parts[passwordIndex]
        ) {
            return streamUrl;
        }

        parts[userIndex] =
            "{user}";

        parts[passwordIndex] =
            "{password}";

        url.pathname =
            parts.join(
                "/"
            );

        return url.toString();

    } catch {
        return streamUrl;
    }
}

/*
 * ==================================================
 * VALIDAR PROBE
 * ==================================================
 */

function isValidProbe(
    probe
) {
    if (!probe) {
        return false;
    }

    if (
        probe.ok !== true
    ) {
        return false;
    }

    if (
        !probe.codec_name
    ) {
        return false;
    }

    if (
        !Number.isFinite(
            Number(
                probe.width
            )
        )
    ) {
        return false;
    }

    if (
        !Number.isFinite(
            Number(
                probe.height
            )
        )
    ) {
        return false;
    }

    if (
        !Number.isFinite(
            Number(
                probe.duration
            )
        )
    ) {
        return false;
    }

    return true;
}

/*
 * ==================================================
 * FFPROBE
 * ==================================================
 */

async function probeStream(
    url
) {
    try {
        const {
            stdout
        } =
            await execFileAsync(
                "ffprobe",
                [
                    "-v",
                    "error",

                    "-rw_timeout",
                    "15000000",

                    "-select_streams",
                    "v:0",

                    "-show_entries",
                    "stream=codec_name,width,height,r_frame_rate,bit_rate",

                    "-show_entries",
                    "format=duration,bit_rate,size",

                    "-of",
                    "json",

                    url
                ],
                {
                    timeout:
                        PROBE_TIMEOUT,

                    maxBuffer:
                        1024 * 1024
                }
            );

        const data =
            JSON.parse(
                stdout
            );

        const stream =
            data.streams?.[0];

        const format =
            data.format ??
            {};

        if (!stream) {
            return {
                ok: false,
                error:
                    "No se encontró stream de video"
            };
        }

        return {
            ok: true,

            codec_name:
                stream.codec_name ??
                null,

            width:
                Number(
                    stream.width
                ) || null,

            height:
                Number(
                    stream.height
                ) || null,

            r_frame_rate:
                stream.r_frame_rate ??
                null,

            video_bit_rate:
                Number(
                    stream.bit_rate
                ) || null,

            duration:
                Number(
                    format.duration
                ) || null,

            size:
                Number(
                    format.size
                ) || null,

            format_bit_rate:
                Number(
                    format.bit_rate
                ) || null
        };

    } catch (
        error
    ) {
        return {
            ok: false,

            error:
                error.stderr?.trim() ||
                error.message ||
                "ffprobe error"
        };
    }
}

/*
 * ==================================================
 * NORMALIZAR STREAMS PRIVADOS
 * ==================================================
 *
 * Soporta ambos formatos:
 *
 * viejo:
 * {
 *   streamUrl
 * }
 *
 * nuevo:
 * {
 *   streams: [
 *      { streamUrl }
 *   ]
 * }
 */

function getPrivateStreams(
    privateMovie
) {
    const streams = [];

    /*
     * Formato nuevo
     */

    if (
        Array.isArray(
            privateMovie?.streams
        )
    ) {
        for (
            const stream
            of privateMovie.streams
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
     */

    if (
        privateMovie?.streamUrl &&
        !streams.some(
            stream =>
                stream.streamUrl ===
                privateMovie.streamUrl
        )
    ) {
        streams.push({
            streamUrl:
                privateMovie.streamUrl
        });
    }

    return streams;
}

/*
 * ==================================================
 * STREAMS ANTERIORES
 * ==================================================
 */

function getPreviousStreams(
    previousMovie
) {
    /*
     * Formato nuevo
     */

    if (
        Array.isArray(
            previousMovie?.streams
        )
    ) {
        return previousMovie.streams;
    }

    /*
     * Formato viejo
     */

    if (
        previousMovie?.streamUrl
    ) {
        return [
            {
                streamUrl:
                    previousMovie.streamUrl,

                probe:
                    previousMovie.probe,

                probeUrlHash:
                    previousMovie.probeUrlHash
            }
        ];
    }

    return [];
}

/*
 * ==================================================
 * BUSCAR PROBE ANTERIOR
 * ==================================================
 */

function findPreviousProbe(
    previousMovie,
    currentHash
) {
    const previousStreams =
        getPreviousStreams(
            previousMovie
        );

    for (
        const stream
        of previousStreams
    ) {
        if (
            stream.probeUrlHash ===
                currentHash &&
            isValidProbe(
                stream.probe
            )
        ) {
            return stream.probe;
        }
    }

    return null;
}

/*
 * ==================================================
 * PROCESAR UNA PELÍCULA
 * ==================================================
 */

async function processMovie(
    movie,
    privateMovie,
    previousMovie
) {
    const privateStreams =
        getPrivateStreams(
            privateMovie
        );

    /*
     * No tiene URLs privadas.
     */

    if (
        privateStreams.length === 0
    ) {
        return {
            ...movie,

            streamUrl:
                sanitizeStreamUrl(
                    movie.streamUrl
                ),

            streams: []
        };
    }

    const resultStreams = [];

    /*
     * ==================================================
     * PROBAR TODAS LAS URLS
     * ==================================================
     */

    for (
        let i = 0;
        i <
        privateStreams.length;
        i++
    ) {
        const privateStream =
            privateStreams[i];

        const realUrl =
            privateStream.streamUrl;

        const currentUrlHash =
            hashUrl(
                realUrl
            );

        /*
         * Intentamos reutilizar
         * el probe anterior.
         */

        const previousProbe =
            findPreviousProbe(
                previousMovie,
                currentUrlHash
            );

        let probe;

        if (
            previousProbe
        ) {
            probe =
                previousProbe;

            console.log(
                `♻️ Probe reutilizado TMDB ${movie.tmdbId} - ${movie.title} [${i + 1}/${privateStreams.length}]`
            );

            console.log(
                `   ${probe.codec_name} ${probe.width}x${probe.height}`
            );

        } else {
            console.log(
                `🔎 Probe TMDB ${movie.tmdbId} - ${movie.title} [${i + 1}/${privateStreams.length}]`
            );

            probe =
                await probeStream(
                    realUrl
                );

            if (
                probe.ok
            ) {
                console.log(
                    `   ✅ ${probe.codec_name} ${probe.width}x${probe.height}`
                );
            } else {
                console.log(
                    `   ❌ ${probe.error}`
                );
            }
        }

        /*
         * URL segura
         */

        const safeUrl =
            sanitizeStreamUrl(
                realUrl
            );

        resultStreams.push({
            streamUrl:
                safeUrl,

            probe,

            probeUrlHash:
                currentUrlHash
        });
    }

    /*
     * ==================================================
     * RESULTADO
     * ==================================================
     */

    return {
        ...movie,

        /*
         * Compatibilidad con código viejo.
         *
         * Se utiliza la primera URL.
         */

        streamUrl:
            resultStreams[0]
                ?.streamUrl ??
            sanitizeStreamUrl(
                movie.streamUrl
            ),

        streams:
            resultStreams
    };
}

/*
 * ==================================================
 * CONCURRENCIA
 * ==================================================
 */

async function processWithConcurrency(
    movies,
    privateStreams,
    previousStreams
) {
    const results =
        new Array(
            movies.length
        );

    let nextIndex = 0;

    async function worker() {
        while (true) {
            const index =
                nextIndex++;

            if (
                index >=
                movies.length
            ) {
                return;
            }

            const movie =
                movies[index];

            const key =
                String(
                    movie.tmdbId
                );

            const privateMovie =
                privateStreams[
                    key
                ];

            const previousMovie =
                previousStreams[
                    key
                ];

            results[index] =
                await processMovie(
                    movie,
                    privateMovie,
                    previousMovie
                );
        }
    }

    const workers =
        Array.from(
            {
                length:
                    Math.min(
                        CONCURRENCY,
                        movies.length
                    )
            },
            () =>
                worker()
        );

    await Promise.all(
        workers
    );

    return results;
}

/*
 * ==================================================
 * MAIN
 * ==================================================
 */

async function main() {
    console.log(
        "🚀 Iniciando escaneo de streams...\n"
    );

    await fs.mkdir(
        DATA_DIR,
        {
            recursive: true
        }
    );

    /*
     * ==================================================
     * CARGAR CATÁLOGO
     * ==================================================
     */

    const publicStreams =
        await readJson(
            STREAMS_FILE,
            {}
        );

    /*
     * ==================================================
     * CARGAR URLS PRIVADAS
     * ==================================================
     */

    const privateStreams =
        await readJson(
            PRIVATE_STREAMS_FILE,
            {}
        );

    /*
     * ==================================================
     * RESULTADO ANTERIOR
     * ==================================================
     */

    const previousStreams =
        await readJson(
            OUTPUT_FILE,
            {}
        );

    const movies =
        Object.values(
            publicStreams
        );

    console.log(
        `🎬 Películas del catálogo: ${movies.length}`
    );

    console.log(
        `🔐 Películas privadas: ${Object.keys(privateStreams).length}`
    );

    console.log(
        `💾 Resultado anterior: ${Object.keys(previousStreams).length}`
    );

    /*
     * ==================================================
     * CONTADORES
     * ==================================================
     */

    let privateMovieCount = 0;

    let totalPrivateUrls = 0;

    for (
        const movie
        of movies
    ) {
        const privateMovie =
            privateStreams[
                String(
                    movie.tmdbId
                )
            ];

        const urls =
            getPrivateStreams(
                privateMovie
            );

        if (
            urls.length > 0
        ) {
            privateMovieCount++;
        }

        totalPrivateUrls +=
            urls.length;
    }

    console.log(
        `🔗 Películas con URLs privadas: ${privateMovieCount}/${movies.length}`
    );

    console.log(
        `🔗 URLs privadas totales: ${totalPrivateUrls}\n`
    );

    /*
     * ==================================================
     * BACKUP
     * ==================================================
     */

    try {
        await fs.copyFile(
            OUTPUT_FILE,
            BACKUP_FILE
        );

        console.log(
            "💾 Backup creado:"
        );

        console.log(
            "   data/movie-streams-all.backup.json\n"
        );

    } catch {
        console.log(
            "ℹ️ No había movie-streams-all.json anterior.\n"
        );
    }

    /*
     * ==================================================
     * PROCESAMIENTO
     * ==================================================
     */

    const results =
        await processWithConcurrency(
            movies,
            privateStreams,
            previousStreams
        );

    /*
     * ==================================================
     * CONSTRUIR OUTPUT
     * ==================================================
     */

    const output = {};

    for (
        const movie
        of results
    ) {
        output[
            String(
                movie.tmdbId
            )
        ] = {
            tmdbId:
                movie.tmdbId,

            title:
                movie.title,

            originalTitle:
                movie.originalTitle,

            year:
                movie.year,

            posterPath:
                movie.posterPath,

            /*
             * NUEVO FORMATO
             */

            streams:
                movie.streams ??
                []
        };
    }

    /*
     * ==================================================
     * GUARDADO ATÓMICO
     * ==================================================
     */

    await writeJson(
        TEMP_FILE,
        output
    );

    await fs.rename(
        TEMP_FILE,
        OUTPUT_FILE
    );

    /*
     * ==================================================
     * ESTADÍSTICAS
     * ==================================================
     */

    let moviesWithStreams = 0;

    let moviesWithoutStreams = 0;

    let validProbes = 0;

    let invalidProbes = 0;

    let totalStreams = 0;

    for (
        const movie
        of Object.values(
            output
        )
    ) {
        if (
            movie.streams.length >
            0
        ) {
            moviesWithStreams++;
        } else {
            moviesWithoutStreams++;
        }

        totalStreams +=
            movie.streams.length;

        for (
            const stream
            of movie.streams
        ) {
            if (
                isValidProbe(
                    stream.probe
                )
            ) {
                validProbes++;
            } else {
                invalidProbes++;
            }
        }
    }

    /*
     * ==================================================
     * FINAL
     * ==================================================
     */

    console.log(
        "\n================================="
    );

    console.log(
        "🎉 ESCANEO TERMINADO"
    );

    console.log(
        "================================="
    );

    console.log(
        "Películas:",
        Object.keys(
            output
        ).length
    );

    console.log(
        "Streams totales:",
        totalStreams
    );

    console.log(
        "Con streams:",
        moviesWithStreams
    );

    console.log(
        "Sin streams:",
        moviesWithoutStreams
    );

    console.log(
        "Probes válidos:",
        validProbes
    );

    console.log(
        "Probes con error:",
        invalidProbes
    );

    console.log(
        "\nArchivo generado:"
    );

    console.log(
        "→ data/movie-streams-all.json"
    );

    console.log(
        "\nBackup:"
    );

    console.log(
        "→ data/movie-streams-all.backup.json"
    );
}

main().catch(
    error => {
        console.error(
            "\n❌ Error fatal:",
            error
        );

        process.exit(1);
    }
);