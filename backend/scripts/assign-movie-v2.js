import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const DATA_DIR = path.join(process.cwd(), "data");

const UNMATCHED_FILE = path.join(
    DATA_DIR,
    "unmatched-movies-lista-2.json"
);

const MOVIES_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.json"
);

// ======================================================
// PELÍCULAS A ASIGNAR
// ======================================================

const MOVIES_TO_ASSIGN = [
    {
        title: "One Last Shot",
        tmdbId: 1607127
    },

    {
        title: "Hechizo de amor : La Magia Continua",
        tmdbId: 1302904
    },

    {
        title: "Kraken",
        tmdbId: 1110034
    },

    {
        title: "Fall 2: Punto muerto",
        tmdbId: 1101412
    },

    {
        title: "Los Extraños - Capítulo 3",
        tmdbId: 1010755
    },

    {
        title: "Gary",
        tmdbId: 1688652
    },


];

// ======================================================
// NORMALIZAR TÍTULOS
// ======================================================

function normalizeTitle(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

// ======================================================
// LIMPIAR ETIQUETAS DE LA LISTA
// ======================================================

function cleanTitle(value) {
    return normalizeTitle(value)
        .replace(
            /\b(telesync|ts|cam|hd|full hd|latino|castellano|subtitulada|subtitulado|dual|1080p|1080|720p|720|4k)\b/gi,
            ""
        )
        .replace(/\s+/g, " ")
        .trim();
}

// ======================================================
// BACKUP
// ======================================================

function backupFile(file) {
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const backup = `${file}.${timestamp}.bak`;

    fs.copyFileSync(file, backup);

    return backup;
}

// ======================================================
// CREDENCIALES
// ======================================================

function replaceCredentials(streamUrl, source) {
    const match = source?.match(/^lista-(\d+)$/);

    if (!match) {
        throw new Error(
            `Fuente de stream desconocida: ${source}`
        );
    }

    const listNumber = match[1];

    let user;
    let password;

    if (listNumber === "1") {
        user =
            process.env.IPTV_USER_1 ||
            process.env.IPTV_USER;

        password =
            process.env.IPTV_PASSWORD_1 ||
            process.env.IPTV_PASSWORD;
    } else {
        user =
            process.env[`IPTV_USER_${listNumber}`];

        password =
            process.env[`IPTV_PASSWORD_${listNumber}`];
    }

    if (!user || !password) {
        throw new Error(
            `Faltan las credenciales para ${source}`
        );
    }

    return streamUrl
        .replace(/\{user\}|%7Buser%7D/gi, user)
        .replace(/\{password\}|%7Bpassword\}/gi, password);
}

// ======================================================
// FFPROBE
// ======================================================

function probeStream(url) {
    return new Promise((resolve, reject) => {

        const args = [
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
        ];

        const process = spawn("ffprobe", args);

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", data => {
            stdout += data.toString();
        });

        process.stderr.on("data", data => {
            stderr += data.toString();
        });

        process.on("error", error => {
            reject(error);
        });

        process.on("close", code => {

            if (code !== 0) {
                reject(
                    new Error(
                        stderr.trim() ||
                        `ffprobe terminó con código ${code}`
                    )
                );

                return;
            }

            try {

                const result = JSON.parse(stdout);

                const stream = result.streams?.[0];

                if (!stream) {
                    reject(
                        new Error(
                            "ffprobe no encontró un stream de video"
                        )
                    );

                    return;
                }

                resolve({
                    ok: true,

                    codec_name:
                        stream.codec_name ?? null,

                    width:
                        stream.width ?? null,

                    height:
                        stream.height ?? null,

                    r_frame_rate:
                        stream.r_frame_rate ?? null,

                    bit_rate:
                        stream.bit_rate
                            ? Number(stream.bit_rate)
                            : null,

                    duration:
                        result.format?.duration
                            ? Number(result.format.duration)
                            : null,

                    format_bit_rate:
                        result.format?.bit_rate
                            ? Number(result.format.bit_rate)
                            : null,

                    size:
                        result.format?.size
                            ? Number(result.format.size)
                            : null
                });

            } catch (error) {

                reject(
                    new Error(
                        `Respuesta inválida de ffprobe: ${error.message}`
                    )
                );
            }
        });
    });
}

// ======================================================
// HASH URL
// ======================================================

function createUrlHash(url) {
    return crypto
        .createHash("sha256")
        .update(url)
        .digest("hex");
}

// ======================================================
// BUSCAR PELÍCULA EN UNMATCHED
// ======================================================

function findMovie(unmatched, targetTitle) {

    const normalizedTarget =
        normalizeTitle(targetTitle);

    const cleanedTarget =
        cleanTitle(targetTitle);

    // Primero: coincidencia exacta normalizada
    let matches = unmatched.filter(
        movie =>
            normalizeTitle(movie.name) ===
            normalizedTarget
    );

    if (matches.length > 0) {
        return matches;
    }

    // Segundo: coincidencia quitando etiquetas
    matches = unmatched.filter(
        movie =>
            cleanTitle(movie.name) ===
            cleanedTarget
    );

    return matches;
}

// ======================================================
// MOSTRAR PROBE
// ======================================================

function printProbe(probe) {

    console.log(
        `   Codec: ${probe.codec_name}`
    );

    console.log(
        `   Resolución: ${probe.width}x${probe.height}`
    );

    console.log(
        `   FPS: ${probe.r_frame_rate}`
    );

    if (probe.duration) {
        console.log(
            `   Duración: ${probe.duration}s`
        );
    }

    if (probe.size) {
        console.log(
            `   Tamaño: ${(probe.size / 1024 / 1024 / 1024).toFixed(2)} GB`
        );
    }
}

// ======================================================
// MAIN
// ======================================================

async function main() {

    console.log("");
    console.log("======================================");
    console.log("     ASIGNACIÓN MASIVA DE PELÍCULAS");
    console.log("======================================");
    console.log("");

    console.log(
        `Películas a procesar: ${MOVIES_TO_ASSIGN.length}`
    );

    console.log("");

    if (!fs.existsSync(UNMATCHED_FILE)) {
        throw new Error(
            `No existe ${UNMATCHED_FILE}`
        );
    }

    if (!fs.existsSync(MOVIES_FILE)) {
        throw new Error(
            `No existe ${MOVIES_FILE}`
        );
    }

    const unmatched = JSON.parse(
        fs.readFileSync(
            UNMATCHED_FILE,
            "utf8"
        )
    );

    const movies = JSON.parse(
        fs.readFileSync(
            MOVIES_FILE,
            "utf8"
        )
    );

    // ==================================================
    // BACKUPS UNA SOLA VEZ
    // ==================================================

    console.log("📦 Creando backups...");

    const unmatchedBackup =
        backupFile(UNMATCHED_FILE);

    const moviesBackup =
        backupFile(MOVIES_FILE);

    console.log(
        `   ${unmatchedBackup}`
    );

    console.log(
        `   ${moviesBackup}`
    );

    console.log("");

    // ==================================================
    // ESTADÍSTICAS
    // ==================================================

    let success = 0;
    let failed = 0;
    let notFound = 0;
    let duplicated = 0;

    // ==================================================
    // PROCESAR UNA POR UNA
    // ==================================================

    for (
        let i = 0;
        i < MOVIES_TO_ASSIGN.length;
        i++
    ) {

        const item =
            MOVIES_TO_ASSIGN[i];

        console.log("");
        console.log("--------------------------------------");
        console.log(
            `[${i + 1}/${MOVIES_TO_ASSIGN.length}]`
        );
        console.log("--------------------------------------");

        console.log(
            `🎬 ${item.title}`
        );

        console.log(
            `🆔 TMDB: ${item.tmdbId}`
        );

        // ----------------------------------------------
        // VALIDAR ID
        // ----------------------------------------------

        const tmdbId =
            Number(item.tmdbId);

        if (
            !Number.isInteger(tmdbId) ||
            tmdbId <= 0
        ) {

            console.log(
                "❌ TMDB ID inválido."
            );

            failed++;

            continue;
        }

        // ----------------------------------------------
        // BUSCAR
        // ----------------------------------------------

        const matches =
            findMovie(
                unmatched,
                item.title
            );

        if (matches.length === 0) {

            console.log(
                "❌ No encontrada en unmatched."
            );

            notFound++;

            continue;
        }

        if (matches.length > 1) {

            console.log(
                `⚠️ Hay ${matches.length} coincidencias.`
            );

            matches.forEach(
                (movie, index) => {

                    console.log(
                        `   [${index + 1}] ${movie.name} (${movie.year ?? "????"})`
                    );
                }
            );

            console.log(
                "❌ Se omite para evitar asignar la película incorrecta."
            );

            failed++;

            continue;
        }

        const movie = matches[0];

        console.log(
            `✅ Encontrada: ${movie.name}`
        );

        console.log(
            `   Año: ${movie.year ?? "????"}`
        );

        console.log(
            `   Fuente: ${movie.source}`
        );

        // ----------------------------------------------
        // CREDENCIALES
        // ----------------------------------------------

        let realUrl;

        try {

            realUrl =
                replaceCredentials(
                    movie.streamUrl,
                    movie.source
                );

        } catch (error) {

            console.log(
                `❌ ${error.message}`
            );

            failed++;

            continue;
        }

        // ----------------------------------------------
        // FFPROBE
        // ----------------------------------------------

        console.log(
            "🔎 Ejecutando ffprobe..."
        );

        let probe;

        try {

            probe =
                await probeStream(
                    realUrl
                );

        } catch (error) {

            console.log(
                "❌ FFPROBE FALLÓ"
            );

            console.log(
                `   ${error.message}`
            );

            console.log(
                "   ⚠️ No se agregará esta película."
            );

            failed++;

            continue;
        }

        console.log(
            "✅ FFPROBE OK"
        );

        printProbe(probe);

        // ----------------------------------------------
        // STREAM
        // ----------------------------------------------

        const stream = {

            streamUrl:
                movie.streamUrl,

            source:
                movie.source,

            probe,

            probeUrlHash:
                createUrlHash(realUrl)
        };

        // ----------------------------------------------
        // BUSCAR TMDB EXISTENTE
        // ----------------------------------------------

        const existing =
            movies[String(tmdbId)];

        if (existing) {

            console.log(
                `ℹ️ TMDB ${tmdbId} ya existe.`
            );

            if (
                !Array.isArray(
                    existing.streams
                )
            ) {

                existing.streams = [];
            }

            const alreadyExists =
                existing.streams.some(
                    existingStream =>
                        existingStream.streamUrl ===
                            stream.streamUrl &&
                        existingStream.source ===
                            stream.source
                );

            if (alreadyExists) {

                console.log(
                    "⚠️ El stream ya existe."
                );

                duplicated++;

                continue;
            }

            existing.streams.push(
                stream
            );

            console.log(
                "✅ Stream agregado a la película existente."
            );

        } else {

            movies[String(tmdbId)] = {

                tmdbId,

                title:
                    movie.name,

                originalTitle:
                    movie.name,

                year:
                    movie.year ?? null,

                posterPath:
                    null,

                streams: [
                    stream
                ]
            };

            console.log(
                "✅ Película nueva creada."
            );
        }

        // ----------------------------------------------
        // QUITAR DE UNMATCHED
        // ----------------------------------------------

        const index =
            unmatched.findIndex(
                item => item === movie
            );

        if (index !== -1) {

            unmatched.splice(
                index,
                1
            );
        }

        success++;
    }

    // ==================================================
    // GUARDAR TODO AL FINAL
    // ==================================================

    fs.writeFileSync(
        MOVIES_FILE,
        JSON.stringify(
            movies,
            null,
            2
        ),
        "utf8"
    );

    fs.writeFileSync(
        UNMATCHED_FILE,
        JSON.stringify(
            unmatched,
            null,
            2
        ),
        "utf8"
    );

    // ==================================================
    // RESUMEN
    // ==================================================

    console.log("");
    console.log("");
    console.log("======================================");
    console.log("              RESULTADO");
    console.log("======================================");
    console.log("");

    console.log(
        `✅ Agregadas: ${success}`
    );

    console.log(
        `❌ Fallidas: ${failed}`
    );

    console.log(
        `🔎 No encontradas: ${notFound}`
    );

    console.log(
        `⚠️ Duplicadas: ${duplicated}`
    );

    console.log("");

    console.log(
        "📁 movie-streams-all.json actualizado."
    );

    console.log(
        "📁 unmatched-movies-lista-2.json actualizado."
    );

    console.log("");
}

main().catch(error => {

    console.error("");
    console.error(
        "❌ Error:",
        error.message
    );

    process.exit(1);
});