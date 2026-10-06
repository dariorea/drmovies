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

function usage() {
    console.log(`
Uso:

  node assign-movie.js "Título de película" TMDB_ID

Ejemplo:

  node assign-movie.js "Chica robada" 123456
`);

    process.exit(1);
}

const [, , title, tmdbIdArg] = process.argv;

if (!title || !tmdbIdArg) {
    usage();
}

const tmdbId = Number(tmdbIdArg);

if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    console.error("❌ El TMDB ID no es válido.");
    process.exit(1);
}

function normalizeTitle(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function backupFile(file) {
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const backup = `${file}.${timestamp}.bak`;

    fs.copyFileSync(file, backup);

    return backup;
}

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
        .replace(/\{password\}|%7Bpassword%7D/gi, password);
}

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
                    codec_name: stream.codec_name ?? null,
                    width: stream.width ?? null,
                    height: stream.height ?? null,
                    r_frame_rate: stream.r_frame_rate ?? null,
                    bit_rate: stream.bit_rate
                        ? Number(stream.bit_rate)
                        : null,

                    duration: result.format?.duration
                        ? Number(result.format.duration)
                        : null,

                    format_bit_rate: result.format?.bit_rate
                        ? Number(result.format.bit_rate)
                        : null,

                    size: result.format?.size
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

function createUrlHash(url) {
    return crypto
        .createHash("sha256")
        .update(url)
        .digest("hex");
}

async function main() {

    console.log("");
    console.log("======================================");
    console.log("       ASIGNAR PELÍCULA A TMDB");
    console.log("======================================");
    console.log("");

    console.log(`🎬 Título: ${title}`);
    console.log(`🆔 TMDB ID: ${tmdbId}`);
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

    // --------------------------------------
    // BUSCAR TÍTULO
    // --------------------------------------

    const normalizedTarget =
        normalizeTitle(title);

    const matches = unmatched.filter(
        movie =>
            normalizeTitle(movie.name) ===
            normalizedTarget
    );

    if (matches.length === 0) {

        console.error(
            `❌ No encontré "${title}" en unmatched-movies-lista-2.json`
        );

        process.exit(1);
    }

    if (matches.length > 1) {

        console.log(
            `⚠️ Encontré ${matches.length} entradas con ese título:`
        );

        matches.forEach((movie, index) => {

            console.log("");
            console.log(`[${index + 1}]`);
            console.log(`Título: ${movie.name}`);
            console.log(
                `Año: ${movie.year ?? "????"}`
            );
            console.log(
                `URL: ${movie.streamUrl}`
            );
            console.log(
                `Fuente: ${movie.source}`
            );
        });

        console.log("");
        console.log(
            "❌ No se modificó nada."
        );

        process.exit(1);
    }

    const movie = matches[0];

    console.log("✅ Entrada encontrada:");
    console.log("");
    console.log(`Título: ${movie.name}`);
    console.log(
        `Año: ${movie.year ?? "????"}`
    );
    console.log(`Fuente: ${movie.source}`);
    console.log(`URL: ${movie.streamUrl}`);
    console.log("");

    // --------------------------------------
    // REEMPLAZAR CREDENCIALES
    // --------------------------------------

    let realUrl;

    try {

        realUrl = replaceCredentials(
            movie.streamUrl,
            movie.source
        );

    } catch (error) {

        console.error(
            `❌ ${error.message}`
        );

        process.exit(1);
    }

    console.log("🔐 Credenciales reemplazadas.");
    console.log("");

    // --------------------------------------
    // FFPROBE
    // --------------------------------------

    console.log("🔎 Ejecutando ffprobe...");
    console.log("");

    let probe;

    try {

        probe = await probeStream(realUrl);

    } catch (error) {

        console.error(
            "❌ FFPROBE FALLÓ"
        );

        console.error("");
        console.error(error.message);

        console.error("");
        console.error(
            "⚠️ No se modificó ningún JSON."
        );

        process.exit(1);
    }

    // --------------------------------------
    // MOSTRAR RESULTADO
    // --------------------------------------

    console.log("✅ FFPROBE OK");
    console.log("");

    console.log(
        `Codec: ${probe.codec_name}`
    );

    console.log(
        `Resolución: ${probe.width}x${probe.height}`
    );

    console.log(
        `FPS: ${probe.r_frame_rate}`
    );

    if (probe.duration) {
        console.log(
            `Duración: ${probe.duration}s`
        );
    }

    if (probe.size) {
        console.log(
            `Tamaño: ${(probe.size / 1024 / 1024 / 1024).toFixed(2)} GB`
        );
    }

    console.log("");

    // --------------------------------------
    // STREAM FINAL
    // --------------------------------------

    const stream = {
        streamUrl: movie.streamUrl,
        source: movie.source,
        probe,
        probeUrlHash: createUrlHash(realUrl)
    };

    // --------------------------------------
    // EXISTE TMDB?
    // --------------------------------------

    const existing =
        movies[String(tmdbId)];

    if (existing) {

        console.log(
            `ℹ️ El TMDB ${tmdbId} ya existe.`
        );

        if (!Array.isArray(existing.streams)) {
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

            console.log(
                "❌ No se modificó el catálogo."
            );

            process.exit(0);
        }

        existing.streams.push(stream);

        console.log(
            "✅ Stream agregado a la película existente."
        );

    } else {

        movies[String(tmdbId)] = {

            tmdbId,

            title: movie.name,

            originalTitle: movie.name,

            year: movie.year ?? null,

            posterPath: null,

            streams: [
                stream
            ]
        };

        console.log(
            `✅ Película creada con TMDB ${tmdbId}.`
        );
    }

    // --------------------------------------
    // BACKUPS
    // --------------------------------------

    console.log("");
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

    // --------------------------------------
    // QUITAR DE UNMATCHED
    // --------------------------------------

    const index =
        unmatched.findIndex(
            item => item === movie
        );

    if (index !== -1) {
        unmatched.splice(index, 1);
    }

    // --------------------------------------
    // GUARDAR
    // --------------------------------------

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

    // --------------------------------------
    // RESULTADO
    // --------------------------------------

    console.log("");
    console.log("======================================");
    console.log("             COMPLETADO");
    console.log("======================================");
    console.log("");

    console.log(
        `🎬 ${movie.name}`
    );

    console.log(
        `🆔 TMDB: ${tmdbId}`
    );

    console.log(
        `🎥 Codec: ${probe.codec_name}`
    );

    console.log(
        `📺 Resolución: ${probe.width}x${probe.height}`
    );

    console.log(
        `📡 Fuente: ${movie.source}`
    );

    console.log("");
    console.log(
        "✅ Agregada a movie-streams-all.json"
    );

    console.log(
        "✅ Eliminada de unmatched-movies-lista-1.json"
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