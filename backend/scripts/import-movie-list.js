import dotenv from "dotenv";

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

import {
    parseM3U,
    sanitizeStreamUrl
} from "../services/m3u.service.js";

import {
    matchMovie
} from "../services/movieMatcher.service.js";

dotenv.config();

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(
    __dirname,
    "../data"
);

const OUTPUT_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.json"
);

const BACKUP_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.import-backup.json"
);

const TEMP_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.import.tmp.json"
);

const CHECKPOINT_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.import-checkpoint.json"
);

const CHECKPOINT_TEMP_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.import-checkpoint.tmp.json"
);

const CONCURRENCY = 2;

const PROBE_TIMEOUT =
    15 * 60 * 1000;

const CHECKPOINT_EVERY = 25;


// ============================================================
// CONFIGURACIÓN DE LA LISTA
// ============================================================

function getListConfig(listNumber) {
    if (!listNumber) {
        throw new Error(
            "Falta indicar la lista. Ejemplo: node scripts/import-movie-list.js 3"
        );
    }

    const m3uUrl =
        process.env[`IPTV_M3U_URL_${listNumber}`];

    const user =
        process.env[`IPTV_USER_${listNumber}`];

    const password =
        process.env[`IPTV_PASSWORD_${listNumber}`];

    if (!m3uUrl) {
        throw new Error(
            `Falta IPTV_M3U_URL_${listNumber} en .env`
        );
    }

    if (!user) {
        throw new Error(
            `Falta IPTV_USER_${listNumber} en .env`
        );
    }

    if (!password) {
        throw new Error(
            `Falta IPTV_PASSWORD_${listNumber} en .env`
        );
    }

    return {
        source: `lista-${listNumber}`,
        m3uUrl,
        user,
        password
    };
}


// ============================================================
// JSON
// ============================================================

async function readJson(file) {
    const content =
        await fs.readFile(
            file,
            "utf8"
        );

    return JSON.parse(content);
}

async function writeJson(file, data) {
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


// ============================================================
// GUARDAR ATÓMICAMENTE
// ============================================================

async function writeJsonAtomic(
    file,
    tempFile,
    data
) {
    await writeJson(
        tempFile,
        data
    );

    await fs.rename(
        tempFile,
        file
    );
}


// ============================================================
// HASH
// ============================================================

function hashUrl(url) {
    return crypto
        .createHash("sha256")
        .update(url)
        .digest("hex");
}


// ============================================================
// PROBE
// ============================================================

function isValidProbe(probe) {
    return Boolean(
        probe &&
        probe.ok === true &&
        typeof probe.codec_name === "string" &&
        Number.isFinite(probe.width) &&
        Number.isFinite(probe.height) &&
        Number.isFinite(probe.duration)
    );
}

async function probeStream(url) {
    console.log(
        "   🔎 ffprobe"
    );

    try {
        const { stdout } =
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
            JSON.parse(stdout);

        const stream =
            data.streams?.[0];

        if (!stream) {
            return {
                ok: false,
                error:
                    "No se encontró stream de video"
            };
        }

        const format =
            data.format ?? {};

        return {
            ok: true,

            codec_name:
                stream.codec_name ??
                null,

            width:
                Number(stream.width) ||
                null,

            height:
                Number(stream.height) ||
                null,

            r_frame_rate:
                stream.r_frame_rate ??
                null,

            video_bit_rate:
                stream.bit_rate != null
                    ? Number(stream.bit_rate)
                    : null,

            duration:
                format.duration != null
                    ? Number(format.duration)
                    : null,

            size:
                format.size != null
                    ? Number(format.size)
                    : null,

            format_bit_rate:
                format.bit_rate != null
                    ? Number(format.bit_rate)
                    : null
        };

    } catch (error) {
        return {
            ok: false,
            error: error.message
        };
    }
}


// ============================================================
// STREAMS EXISTENTES
// ============================================================

function streamAlreadyExists(
    movie,
    sanitizedUrl,
    source
) {
    if (
        !Array.isArray(
            movie.streams
        )
    ) {
        return false;
    }

    return movie.streams.some(
        stream =>
            stream.streamUrl ===
                sanitizedUrl &&
            stream.source ===
                source
    );
}


// ============================================================
// REUTILIZAR PROBE
// ============================================================

function findProbeByHash(
    catalog,
    currentHash
) {
    for (
        const movie
        of Object.values(catalog)
    ) {
        if (
            !Array.isArray(
                movie.streams
            )
        ) {
            continue;
        }

        for (
            const stream
            of movie.streams
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
    }

    return null;
}


// ============================================================
// PROCESAR STREAM
// ============================================================

async function processStream({
    movie,
    streamUrl,
    source,
    catalog,
    stats
}) {
    // --------------------------------------------------------
    // URL SANITIZADA
    // --------------------------------------------------------

    const sanitizedUrl =
        sanitizeStreamUrl(
            streamUrl
        );

    // --------------------------------------------------------
    // DUPLICADO
    // --------------------------------------------------------

    if (
        streamAlreadyExists(
            movie,
            sanitizedUrl,
            source
        )
    ) {
        stats.duplicateStreams++;

        return null;
    }

    // --------------------------------------------------------
    // HASH DE URL REAL
    // --------------------------------------------------------

    const probeUrlHash =
        hashUrl(
            streamUrl
        );

    // --------------------------------------------------------
    // BUSCAR PROBE EXISTENTE
    // --------------------------------------------------------

    let probe =
        findProbeByHash(
            catalog,
            probeUrlHash
        );

    if (probe) {
        stats.probesReused++;

        console.log(
            "   ♻️ Probe reutilizado"
        );

    } else {
        // ----------------------------------------------------
        // NUEVO PROBE
        // ----------------------------------------------------

        probe =
            await probeStream(
                streamUrl
            );

        stats.probesExecuted++;
    }

    // --------------------------------------------------------
    // VALIDAR PROBE
    // --------------------------------------------------------

    if (
        isValidProbe(probe)
    ) {
        stats.validProbes++;

        console.log(
            `   ✅ Probe válido: ${probe.codec_name} ${probe.width}x${probe.height}`
        );

    } else {
        stats.invalidProbes++;

        console.log(
            `   ⚠️ Probe inválido: ${probe?.error ?? "sin información"}`
        );
    }

    // --------------------------------------------------------
    // STREAM
    // --------------------------------------------------------

    stats.streamsAdded++;

    return {
        streamUrl:
            sanitizedUrl,

        source,

        probe,

        probeUrlHash
    };
}


// ============================================================
// PROCESAR PELÍCULA
// ============================================================

async function processMovie({
    parsedMovie,
    source,
    catalog,
    stats,
    unmatchedMovies
}) {
    let result;

    try {
        // ----------------------------------------------------
        // MATCHER ACTUAL
        // ----------------------------------------------------

        result =
            await matchMovie(
                parsedMovie.name,
                parsedMovie.year
            );

    } catch (error) {
        stats.errors++;

        console.error(
            `❌ Error buscando "${parsedMovie.name}":`,
            error.message
        );

        return;
    }

    // --------------------------------------------------------
    // SIN MATCH
    // --------------------------------------------------------

    if (
        !result?.match
    ) {
        stats.noTmdbMatch++;

        unmatchedMovies.push({
            name:
                parsedMovie.name,

            year:
                parsedMovie.year ?? null,

            streamUrl:
                sanitizeStreamUrl(
                    parsedMovie.streamUrl
                ),

            source,

            reason:
                result?.reason ??
                "no-confident-match"
        });

        console.log(
            `⚠️ Sin match TMDB: ${parsedMovie.name}`
        );

        return;
    }

    // --------------------------------------------------------
    // MATCH
    // --------------------------------------------------------

    const match =
        result.match;

    // --------------------------------------------------------
    // TMDB ID
    // --------------------------------------------------------

    const tmdbId =
        match.tmdbId;

    if (!tmdbId) {
        stats.errors++;

        console.error(
            `❌ Match sin TMDB ID: ${parsedMovie.name}`
        );

        return;
    }

    const key =
        String(tmdbId);

    // --------------------------------------------------------
    // BUSCAR PELÍCULA EXISTENTE
    // --------------------------------------------------------

    let movie =
        catalog[key];

    // --------------------------------------------------------
    // PELÍCULA NUEVA
    // --------------------------------------------------------

    if (!movie) {
        movie = {
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

            streams: []
        };

        catalog[key] =
            movie;

        stats.newMovies++;

        console.log(
            `🆕 Nueva película: ${match.title} (${tmdbId})`
        );
    }

    // --------------------------------------------------------
    // ASEGURAR STREAMS
    // --------------------------------------------------------

    if (
        !Array.isArray(
            movie.streams
        )
    ) {
        movie.streams = [];
    }

    // --------------------------------------------------------
    // STREAM
    // --------------------------------------------------------

    const newStream =
        await processStream({
            movie,

            streamUrl:
                parsedMovie.streamUrl,

            source,

            catalog,

            stats
        });

    if (!newStream) {
        return;
    }

    movie.streams.push(
        newStream
    );

    console.log(
        `   ✅ Stream agregado → ${source}`
    );
}


// ============================================================
// CONCURRENCIA
// ============================================================

async function processWithConcurrency(
    items,
    worker,
    concurrency
) {
    let index = 0;

    async function runWorker() {
        while (true) {
            const currentIndex =
                index++;

            if (
                currentIndex >=
                items.length
            ) {
                return;
            }

            await worker(
                items[currentIndex],
                currentIndex
            );
        }
    }

    const workers =
        Array.from(
            {
                length:
                    Math.min(
                        concurrency,
                        items.length
                    )
            },
            () =>
                runWorker()
        );

    await Promise.all(
        workers
    );
}


// ============================================================
// DESCARGAR M3U
// ============================================================

async function downloadM3U(
    url
) {
    console.log(
        "📥 Descargando lista M3U..."
    );

    const response =
        await axios.get(
            url,
            {
                responseType:
                    "text",

                timeout:
                    120000
            }
        );

    return response.data;
}


// ============================================================
// ESTADÍSTICAS
// ============================================================

function createEmptyStats() {
    return {
        newMovies: 0,
        streamsAdded: 0,
        duplicateStreams: 0,
        probesExecuted: 0,
        probesReused: 0,
        validProbes: 0,
        invalidProbes: 0,
        noTmdbMatch: 0,
        errors: 0
    };
}


// ============================================================
// CHECKPOINT
// ============================================================

async function saveCheckpoint({
    catalog,
    unmatchedMovies,
    stats,
    processedIndexes,
    source,
    totalMovies
}) {
    const checkpoint = {
        version: 1,

        source,

        totalMovies,

        processedIndexes:
            Array.from(
                processedIndexes
            ),

        catalog,

        unmatchedMovies,

        stats,

        updatedAt:
            new Date().toISOString()
    };

    await writeJsonAtomic(
        CHECKPOINT_FILE,
        CHECKPOINT_TEMP_FILE,
        checkpoint
    );

    console.log("");
    console.log(
        `💾 Checkpoint guardado: ${processedIndexes.size}/${totalMovies}`
    );
    console.log("");
}


// ============================================================
// CARGAR CHECKPOINT
// ============================================================

async function loadCheckpoint(
    source,
    totalMovies
) {
    try {
        const checkpoint =
            await readJson(
                CHECKPOINT_FILE
            );

        if (
            checkpoint.source !==
            source
        ) {
            console.log(
                "⚠️ Existe un checkpoint de otra lista. Se ignorará."
            );

            return null;
        }

        if (
            checkpoint.totalMovies !==
            totalMovies
        ) {
            console.log(
                "⚠️ El checkpoint no corresponde a esta M3U."
            );

            console.log(
                `   Checkpoint: ${checkpoint.totalMovies}`
            );

            console.log(
                `   M3U actual: ${totalMovies}`
            );

            return null;
        }

        if (
            !checkpoint.catalog ||
            !checkpoint.processedIndexes
        ) {
            console.log(
                "⚠️ Checkpoint incompleto. Se ignorará."
            );

            return null;
        }

        console.log("");
        console.log(
            "♻️ Checkpoint encontrado"
        );

        console.log(
            `📌 Películas ya procesadas: ${checkpoint.processedIndexes.length}/${totalMovies}`
        );

        console.log("");

        return checkpoint;

    } catch {
        return null;
    }
}


// ============================================================
// MAIN
// ============================================================

async function main() {
    const listNumber =
        process.argv[2];

    const config =
        getListConfig(
            listNumber
        );

    console.log("");
    console.log(
        "======================================"
    );
    console.log(
        "      IMPORTADOR IPTV MULTI-LISTA"
    );
    console.log(
        "======================================"
    );
    console.log("");

    console.log(
        `📋 Fuente: ${config.source}`
    );

    console.log("");

    // --------------------------------------------------------
    // DESCARGAR M3U
    // --------------------------------------------------------

    const content =
        await downloadM3U(
            config.m3uUrl
        );

    // --------------------------------------------------------
    // PARSER
    // --------------------------------------------------------

    console.log(
        "📦 Parseando M3U..."
    );

    const movies =
        parseM3U(
            content
        );

    console.log(
        `🎬 Películas encontradas: ${movies.length}`
    );

    if (
        movies.length === 0
    ) {
        throw new Error(
            "La M3U no contiene películas."
        );
    }

    // --------------------------------------------------------
    // CHECKPOINT
    // --------------------------------------------------------

    const existingCheckpoint =
        await loadCheckpoint(
            config.source,
            movies.length
        );

    let catalog;
    let unmatchedMovies;
    let stats;
    let processedIndexes;

    if (existingCheckpoint) {
        // ----------------------------------------------------
        // CONTINUAR DESDE CHECKPOINT
        // ----------------------------------------------------

        catalog =
            existingCheckpoint.catalog;

        unmatchedMovies =
            existingCheckpoint.unmatchedMovies ??
            [];

        stats =
            existingCheckpoint.stats ??
            createEmptyStats();

        processedIndexes =
            new Set(
                existingCheckpoint.processedIndexes
            );

        console.log(
            "▶️ Continuando importación anterior..."
        );

    } else {
        // ----------------------------------------------------
        // NUEVA IMPORTACIÓN
        // ----------------------------------------------------

        catalog =
            await readJson(
                OUTPUT_FILE
            );

        unmatchedMovies = [];

        stats =
            createEmptyStats();

        processedIndexes =
            new Set();

        // ----------------------------------------------------
        // CONTAR CATÁLOGO ACTUAL
        // ----------------------------------------------------

        const movieCountBefore =
            Object.keys(
                catalog
            ).length;

        const streamCountBefore =
            Object.values(
                catalog
            ).reduce(
                (total, movie) =>
                    total +
                    (
                        Array.isArray(
                            movie.streams
                        )
                            ? movie.streams.length
                            : 0
                    ),
                0
            );

        console.log(
            `🎬 Películas actuales: ${movieCountBefore}`
        );

        console.log(
            `📺 Streams actuales: ${streamCountBefore}`
        );

        // ----------------------------------------------------
        // BACKUP
        // ----------------------------------------------------

        console.log("");
        console.log(
            "💾 Creando backup..."
        );

        await fs.copyFile(
            OUTPUT_FILE,
            BACKUP_FILE
        );

        console.log(
            "✅ Backup creado"
        );
    }

    // --------------------------------------------------------
    // CONTADORES
    // --------------------------------------------------------

    const initialProcessed =
        processedIndexes.size;

    let completedSinceCheckpoint = 0;

    // --------------------------------------------------------
    // PROCESAR
    // --------------------------------------------------------

    console.log("");
    console.log(
        "🚀 Procesando..."
    );
    console.log("");

    await processWithConcurrency(
        movies,
        async (movie, index) => {
            // ------------------------------------------------
            // YA PROCESADO
            // ------------------------------------------------

            if (
                processedIndexes.has(
                    index
                )
            ) {
                return;
            }

            // ------------------------------------------------
            // PROCESAR
            // ------------------------------------------------

            try {
                await processMovie({
                    parsedMovie:
                        movie,

                    source:
                        config.source,

                    catalog,

                    stats,

                    unmatchedMovies
                });

            } catch (error) {
                stats.errors++;

                console.error(
                    `❌ Error procesando "${movie.name}":`,
                    error.message
                );
            }

            // ------------------------------------------------
            // MARCAR COMO PROCESADO
            // ------------------------------------------------

            processedIndexes.add(
                index
            );

            completedSinceCheckpoint++;

            const totalProcessed =
                processedIndexes.size;

            console.log(
                `📊 Progreso: ${totalProcessed}/${movies.length}`
            );

            // ------------------------------------------------
            // CHECKPOINT
            // ------------------------------------------------

            if (
                completedSinceCheckpoint >=
                CHECKPOINT_EVERY
            ) {
                completedSinceCheckpoint = 0;

                await saveCheckpoint({
                    catalog,

                    unmatchedMovies,

                    stats,

                    processedIndexes,

                    source:
                        config.source,

                    totalMovies:
                        movies.length
                });
            }
        },
        CONCURRENCY
    );

    // --------------------------------------------------------
    // CHECKPOINT FINAL
    // --------------------------------------------------------

    if (
        processedIndexes.size ===
        movies.length
    ) {
        await saveCheckpoint({
            catalog,

            unmatchedMovies,

            stats,

            processedIndexes,

            source:
                config.source,

            totalMovies:
                movies.length
        });
    }

    // --------------------------------------------------------
    // GUARDAR CATÁLOGO
    // --------------------------------------------------------

    console.log("");
    console.log(
        "💾 Guardando catálogo..."
    );

    await writeJsonAtomic(
        OUTPUT_FILE,
        TEMP_FILE,
        catalog
    );

    // --------------------------------------------------------
    // UNMATCHED
    // --------------------------------------------------------

    const UNMATCHED_FILE =
        path.join(
            DATA_DIR,
            `unmatched-movies-${config.source}.json`
        );

    await writeJson(
        UNMATCHED_FILE,
        unmatchedMovies
    );

    console.log(
        `📄 Películas sin match guardadas: ${UNMATCHED_FILE}`
    );

    // --------------------------------------------------------
    // ELIMINAR CHECKPOINT
    // --------------------------------------------------------

    try {
        await fs.unlink(
            CHECKPOINT_FILE
        );

        console.log(
            "🧹 Checkpoint eliminado: importación completada"
        );

    } catch {
        // No existe, no pasa nada
    }

    // --------------------------------------------------------
    // ESTADÍSTICAS FINALES
    // --------------------------------------------------------

    const movieCountBefore =
        Object.keys(
            catalog
        ).length -
        stats.newMovies;

    const movieCountAfter =
        Object.keys(
            catalog
        ).length;

    const streamCountAfter =
        Object.values(
            catalog
        ).reduce(
            (total, movie) =>
                total +
                (
                    Array.isArray(
                        movie.streams
                    )
                        ? movie.streams.length
                        : 0
                ),
            0
        );

    console.log("");
    console.log(
        "======================================"
    );
    console.log(
        "          IMPORTACIÓN OK"
    );
    console.log(
        "======================================"
    );
    console.log("");

    console.log(
        `📋 Fuente: ${config.source}`
    );

    console.log(
        `🎬 Películas procesadas: ${movies.length}`
    );

    console.log(
        `🎬 Películas nuevas: ${stats.newMovies}`
    );

    console.log(
        `🎬 Películas totales: ${movieCountAfter}`
    );

    console.log(
        `📺 Streams totales: ${streamCountAfter}`
    );

    console.log(
        `➕ Streams agregados: ${stats.streamsAdded}`
    );

    console.log(
        `♻️ Streams duplicados: ${stats.duplicateStreams}`
    );

    console.log(
        `🔎 ffprobe ejecutados: ${stats.probesExecuted}`
    );

    console.log(
        `♻️ Probes reutilizados: ${stats.probesReused}`
    );

    console.log(
        `✅ Probes válidos: ${stats.validProbes}`
    );

    console.log(
        `⚠️ Probes inválidos: ${stats.invalidProbes}`
    );

    console.log(
        `❓ Sin match TMDB: ${stats.noTmdbMatch}`
    );

    console.log(
        `❌ Errores: ${stats.errors}`
    );

    console.log("");

    console.log(
        `📄 Unmatched: ${unmatchedMovies.length}`
    );

    console.log(
        `💾 Backup: ${BACKUP_FILE}`
    );

    console.log("");
}


// ============================================================
// ERROR GLOBAL
// ============================================================

main().catch(
    async error => {
        console.error("");
        console.error(
            "❌ IMPORTACIÓN ABORTADA"
        );
        console.error("");

        console.error(
            error
        );

        console.error("");

        console.error(
            "💾 Si el proceso alcanzó un checkpoint,"
        );

        console.error(
            "   podés volver a ejecutar el mismo comando"
        );

        console.error(
            "   y continuará desde donde quedó."
        );

        console.error("");

        try {
            await fs.unlink(
                TEMP_FILE
            );
        } catch {
            // Nada que limpiar
        }

        try {
            await fs.unlink(
                CHECKPOINT_TEMP_FILE
            );
        } catch {
            // Nada que limpiar
        }

        process.exit(1);
    }
);