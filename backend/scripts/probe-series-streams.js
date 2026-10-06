import "dotenv/config";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

const execFileAsync =
    promisify(execFile);


// ======================================================
// PATHS
// ======================================================

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
        "series-streams-combined.json"
    );


const BACKUP_FILE =
    path.join(
        DATA_DIR,
        "series-streams-combined.backup.json"
    );


const TEMP_FILE =
    path.join(
        DATA_DIR,
        "series-streams-combined.tmp.json"
    );


// ======================================================
// CONFIG
// ======================================================

const CONCURRENCY = 2;

const PROBE_TIMEOUT =
    15 * 60 * 1000;


// ======================================================
// JSON
// ======================================================

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
            2
        ),
        "utf8"
    );
}


// ======================================================
// HASH URL
// ======================================================

function hashUrl(
    url
) {

    return crypto
        .createHash(
            "sha256"
        )
        .update(
            url
        )
        .digest(
            "hex"
        );
}


// ======================================================
// VALIDAR PROBE
// ======================================================

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
        !probe.video?.codec_name
    ) {
        return false;
    }


    if (
        !Number.isFinite(
            Number(
                probe.video.width
            )
        )
    ) {
        return false;
    }


    if (
        !Number.isFinite(
            Number(
                probe.video.height
            )
        )
    ) {
        return false;
    }


    return true;
}


// ======================================================
// FFPROBE
// ======================================================

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

                    // ----------------------------------
                    // Menos ruido
                    // ----------------------------------

                    "-v",
                    "error",


                    // ----------------------------------
                    // Timeout de lectura
                    // ----------------------------------

                    "-rw_timeout",
                    "15000000",


                    // ----------------------------------
                    // Video + audio
                    // ----------------------------------

                    "-show_entries",

                    "stream=" +
                    [
                        "index",
                        "codec_type",
                        "codec_name",
                        "profile",
                        "pix_fmt",
                        "width",
                        "height",
                        "r_frame_rate",
                        "bit_rate"
                    ].join(","),


                    // ----------------------------------
                    // Información del archivo
                    // ----------------------------------

                    "-show_entries",

                    "format=" +
                    [
                        "duration",
                        "bit_rate",
                        "size"
                    ].join(","),


                    // ----------------------------------
                    // JSON
                    // ----------------------------------

                    "-of",
                    "json",


                    // ----------------------------------
                    // URL
                    // ----------------------------------

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


        const streams =
            Array.isArray(
                data.streams
            )
                ? data.streams
                : [];


        const video =
            streams.find(
                stream =>
                    stream.codec_type ===
                    "video"
            );


        const audio =
            streams.find(
                stream =>
                    stream.codec_type ===
                    "audio"
            );


        // ------------------------------------------
        // No encontramos video
        // ------------------------------------------

        if (!video) {

            return {

                ok: false,

                error:
                    "No se encontró stream de video"

            };
        }


        const format =
            data.format ??
            {};


        // ------------------------------------------
        // Resultado
        // ------------------------------------------

        return {

            ok: true,

            video: {

                codec_name:
                    video.codec_name ??
                    null,

                profile:
                    video.profile ??
                    null,

                pix_fmt:
                    video.pix_fmt ??
                    null,

                width:
                    Number(
                        video.width
                    ) || null,

                height:
                    Number(
                        video.height
                    ) || null,

                r_frame_rate:
                    video.r_frame_rate ??
                    null,

                bit_rate:
                    Number(
                        video.bit_rate
                    ) || null

            },


            audio: {

                codec_name:
                    audio?.codec_name ??
                    null,

                bit_rate:
                    Number(
                        audio?.bit_rate
                    ) || null

            },


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


// ======================================================
// BUSCAR PROBE ANTERIOR
// ======================================================

function findPreviousProbe(
    previousSource,
    currentHash
) {

    if (
        !previousSource
    ) {
        return null;
    }


    if (
        previousSource.probeUrlHash !==
        currentHash
    ) {
        return null;
    }


    if (
        !isValidProbe(
            previousSource.probe
        )
    ) {
        return null;
    }


    return previousSource.probe;
}


// ======================================================
// PROCESAR UNA FUENTE
// ======================================================

async function processSource(
    source,
    previousSource,
    context
) {

    const realUrl =
        source.url;


    if (
        !realUrl
    ) {

        return {

            ...source,

            probe: {

                ok: false,

                error:
                    "La fuente no tiene URL"

            },

            probeUrlHash:
                null

        };
    }


    const currentUrlHash =
        hashUrl(
            realUrl
        );


    // ================================================
    // INTENTAR REUTILIZAR PROBE
    // ================================================

    const previousProbe =
        findPreviousProbe(
            previousSource,
            currentUrlHash
        );


    let probe;


    if (
        previousProbe
    ) {

        probe =
            previousProbe;


        console.log(
            `♻️ Probe reutilizado`
        );

        console.log(
            `   ${context}`
        );

        console.log(
            `   ${probe.video.codec_name} ${probe.video.width}x${probe.video.height}`
        );


    } else {

        console.log(
            `🔎 Probe`
        );

        console.log(
            `   ${context}`
        );

        console.log(
            `   ${realUrl}`
        );


        probe =
            await probeStream(
                realUrl
            );


        if (
            probe.ok
        ) {

            console.log(
                `   ✅ Video: ${probe.video.codec_name} ${probe.video.width}x${probe.video.height}`
            );

            console.log(
                `   🎞️ Perfil: ${probe.video.profile ?? "N/A"}`
            );

            console.log(
                `   🎨 Pixel format: ${probe.video.pix_fmt ?? "N/A"}`
            );

            console.log(
                `   🔊 Audio: ${probe.audio.codec_name ?? "N/A"}`
            );

        } else {

            console.log(
                `   ❌ ${probe.error}`
            );

        }

    }


    // ================================================
    // DEVOLVER FUENTE
    // ================================================

    return {

        ...source,

        probe,

        probeUrlHash:
            currentUrlHash

    };
}


// ======================================================
// PROCESAR EPISODIO
// ======================================================

async function processEpisode(
    episode,
    previousEpisode,
    context
) {

    const sources =
        Array.isArray(
            episode.sources
        )
            ? episode.sources
            : [];


    const previousSources =
        Array.isArray(
            previousEpisode?.sources
        )
            ? previousEpisode.sources
            : [];


    const resultSources = [];


    for (
        let i = 0;
        i < sources.length;
        i++
    ) {

        const source =
            sources[i];


        const previousSource =
            previousSources.find(
                previous =>
                    previous.source ===
                        source.source &&
                    previous.url ===
                        source.url
            );


        const processedSource =
            await processSource(
                source,
                previousSource,
                `${context} | fuente ${source.source}`
            );


        resultSources.push(
            processedSource
        );
    }


    return {

        ...episode,

        sources:
            resultSources

    };
}


// ======================================================
// PROCESAR UNA SERIE
// ======================================================

async function processSeries(
    series,
    previousSeries
) {

    const resultSeries = {

        ...series,

        seasons: {}

    };


    const seasons =
        series.seasons || {};


    for (
        const [
            seasonNumber,
            season
        ]
        of Object.entries(
            seasons
        )
    ) {

        const previousSeason =
            previousSeries?.seasons?.[
                seasonNumber
            ];


        const resultSeason = {

            ...season,

            episodes: {}

        };


        const episodes =
            season.episodes || {};


        for (
            const [
                episodeNumber,
                episode
            ]
            of Object.entries(
                episodes
            )
        ) {

            const previousEpisode =
                previousSeason?.episodes?.[
                    episodeNumber
                ];


            const context =
                `${series.name} | T${seasonNumber} E${episodeNumber}`;


            resultSeason.episodes[
                episodeNumber
            ] =
                await processEpisode(
                    episode,
                    previousEpisode,
                    context
                );
        }


        resultSeries.seasons[
            seasonNumber
        ] =
            resultSeason;
    }


    return resultSeries;
}


// ======================================================
// TAREAS
// ======================================================

async function processAllSeries(
    catalog,
    previousCatalog
) {

    const entries =
        Object.entries(
            catalog
        );


    const results = {};


    let nextIndex = 0;


    async function worker() {

        while (true) {

            const index =
                nextIndex++;


            if (
                index >=
                entries.length
            ) {

                return;

            }


            const [
                tmdbId,
                series
            ] =
                entries[index];


            console.log(
                "\n======================================"
            );


            console.log(
                `📺 Serie ${index + 1}/${entries.length}`
            );


            console.log(
                `🎬 ${series.name}`
            );


            console.log(
                `🆔 TMDB: ${tmdbId}`
            );


            console.log(
                "======================================"
            );


            const previousSeries =
                previousCatalog[
                    tmdbId
                ];


            results[
                tmdbId
            ] =
                await processSeries(
                    series,
                    previousSeries
                );
        }
    }


    const workers =
        Array.from(
            {
                length:
                    Math.min(
                        CONCURRENCY,
                        entries.length
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


// ======================================================
// ESTADÍSTICAS
// ======================================================

function calculateStats(
    catalog
) {

    let totalSeries = 0;

    let totalSeasons = 0;

    let totalEpisodes = 0;

    let totalSources = 0;

    let validProbes = 0;

    let invalidProbes = 0;

    let h264 = 0;

    let hevc = 0;

    let otherVideo = 0;

    let withAudio = 0;

    let withoutAudio = 0;


    for (
        const series
        of Object.values(
            catalog
        )
    ) {

        totalSeries++;


        for (
            const season
            of Object.values(
                series.seasons || {}
            )
        ) {

            totalSeasons++;


            for (
                const episode
                of Object.values(
                    season.episodes || {}
                )
            ) {

                totalEpisodes++;


                for (
                    const source
                    of episode.sources || []
                ) {

                    totalSources++;


                    const probe =
                        source.probe;


                    if (
                        isValidProbe(
                            probe
                        )
                    ) {

                        validProbes++;


                        const codec =
                            probe.video.codec_name;


                        if (
                            codec ===
                            "h264"
                        ) {

                            h264++;

                        } else if (
                            codec ===
                                "hevc" ||
                            codec ===
                                "h265"
                        ) {

                            hevc++;

                        } else {

                            otherVideo++;

                        }


                        if (
                            probe.audio
                                ?.codec_name
                        ) {

                            withAudio++;

                        } else {

                            withoutAudio++;

                        }


                    } else {

                        invalidProbes++;

                    }
                }
            }
        }
    }


    return {

        totalSeries,

        totalSeasons,

        totalEpisodes,

        totalSources,

        validProbes,

        invalidProbes,

        h264,

        hevc,

        otherVideo,

        withAudio,

        withoutAudio

    };
}


// ======================================================
// MAIN
// ======================================================

async function main() {

    console.log(
        "🚀 PROBE DE STREAMS DE SERIES"
    );

    console.log(
        "======================================\n"
    );


    await fs.mkdir(
        DATA_DIR,
        {
            recursive: true
        }
    );


    // ==================================================
    // CARGAR CATÁLOGO
    // ==================================================

    const catalog =
        await readJson(
            STREAMS_FILE,
            null
        );


    if (
        !catalog ||
        typeof catalog !==
            "object"
    ) {

        throw new Error(
            `No se pudo cargar ${STREAMS_FILE}`
        );

    }


    console.log(
        `📚 Series encontradas: ${
            Object.keys(catalog).length
        }`
    );


    // ==================================================
    // CARGAR RESULTADO ANTERIOR
    // ==================================================

    const previousCatalog =
        await readJson(
            STREAMS_FILE,
            {}
        );


    /*
     * Como vamos a modificar el mismo archivo,
     * primero hacemos backup.
     */

    try {

        await fs.copyFile(
            STREAMS_FILE,
            BACKUP_FILE
        );


        console.log(
            "\n💾 Backup creado:"
        );


        console.log(
            `   ${BACKUP_FILE}`
        );


    } catch {

        console.log(
            "\nℹ️ No se pudo crear backup."
        );

    }


    // ==================================================
    // PROCESAR
    // ==================================================

    const processedCatalog =
        await processAllSeries(
            catalog,
            previousCatalog
        );


    // ==================================================
    // GUARDADO TEMPORAL
    // ==================================================

    await writeJson(
        TEMP_FILE,
        processedCatalog
    );


    // ==================================================
    // REEMPLAZAR ARCHIVO
    // ==================================================

    await fs.rename(
        TEMP_FILE,
        STREAMS_FILE
    );


    // ==================================================
    // ESTADÍSTICAS
    // ==================================================

    const stats =
        calculateStats(
            processedCatalog
        );


    console.log(
        "\n======================================"
    );

    console.log(
        "🎉 PROBE TERMINADO"
    );

    console.log(
        "======================================"
    );


    console.log(
        `📺 Series: ${stats.totalSeries}`
    );


    console.log(
        `📚 Temporadas: ${stats.totalSeasons}`
    );


    console.log(
        `🎬 Episodios: ${stats.totalEpisodes}`
    );


    console.log(
        `🔗 Fuentes: ${stats.totalSources}`
    );


    console.log(
        `✅ Probes válidos: ${stats.validProbes}`
    );


    console.log(
        `❌ Probes inválidos: ${stats.invalidProbes}`
    );


    console.log(
        `🎞️ H264: ${stats.h264}`
    );


    console.log(
        `🎞️ HEVC: ${stats.hevc}`
    );


    console.log(
        `🎞️ Otros codecs: ${stats.otherVideo}`
    );


    console.log(
        `🔊 Con audio: ${stats.withAudio}`
    );


    console.log(
        `🔇 Sin audio: ${stats.withoutAudio}`
    );


    console.log(
        "\n📄 Archivo actualizado:"
    );


    console.log(
        `→ ${STREAMS_FILE}`
    );


    console.log(
        "\n💾 Backup:"
    );


    console.log(
        `→ ${BACKUP_FILE}`
    );
}


// ======================================================
// ERROR FATAL
// ======================================================

main().catch(
    error => {

        console.error(
            "\n❌ ERROR FATAL:"
        );

        console.error(
            error
        );


        process.exit(1);

    }
);