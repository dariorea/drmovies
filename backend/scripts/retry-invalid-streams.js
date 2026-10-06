
import "dotenv/config";

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");

const INPUT_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.json"
);

const BACKUP_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.retry-backup.json"
);

const TEMP_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.retry.tmp.json"
);

const SOURCE = "lista-2";

const CONCURRENCY = 2;
const BATCH_SIZE = 20;
const PROBE_TIMEOUT = 15 * 60 * 1000;

const USER = process.env.IPTV_USER_2;
const PASSWORD = process.env.IPTV_PASSWORD_2;

function replaceCredentials(streamUrl) {
    if (!USER || !PASSWORD) {
        throw new Error(
            "Faltan IPTV_USER_2 o IPTV_PASSWORD_2 en .env"
        );
    }

    return streamUrl
        .replace(/\{user\}|%7Buser%7D/gi, USER)
        .replace(/\{password\}|%7Bpassword%7D/gi, PASSWORD);
}

function hashUrl(url) {
    return crypto
        .createHash("sha256")
        .update(url)
        .digest("hex");
}

function isValidProbe(probe) {
    return (
        probe?.ok === true &&
        Boolean(probe.codec_name) &&
        Number(probe.width) > 0 &&
        Number(probe.height) > 0 &&
        Number(probe.duration) > 0
    );
}

async function probeStream(url) {
    try {
        const { stdout } = await execFileAsync(
            "ffprobe",
            [
                "-v", "error",
                "-rw_timeout", "15000000",
                "-select_streams", "v:0",
                "-show_entries",
                "stream=codec_name,width,height,r_frame_rate,bit_rate",
                "-show_entries",
                "format=duration,bit_rate,size",
                "-of", "json",
                url
            ],
            {
                timeout: PROBE_TIMEOUT,
                maxBuffer: 1024 * 1024
            }
        );

        const data = JSON.parse(stdout);

        const video = data.streams?.[0];
        const format = data.format ?? {};

        if (!video) {
            return {
                ok: false,
                error: "No se encontró un stream de video"
            };
        }

        const probe = {
            ok: true,
            codec_name: video.codec_name ?? null,
            width: video.width ?? null,
            height: video.height ?? null,
            r_frame_rate: video.r_frame_rate ?? null,
            video_bit_rate: video.bit_rate
                ? Number(video.bit_rate)
                : null,
            duration: Number(format.duration) || null,
            size: Number(format.size) || null,
            format_bit_rate: format.bit_rate
                ? Number(format.bit_rate)
                : null
        };

        if (!isValidProbe(probe)) {
            return {
                ...probe,
                ok: false,
                error: "Probe incompleto o sin datos válidos"
            };
        }

        return probe;

    } catch (error) {
        const message =
            error.stderr?.trim() ||
            error.message ||
            "Error desconocido de ffprobe";

        return {
            ok: false,
            error: message.slice(0, 1500)
        };
    }
}

async function saveCatalog(catalog) {
    await fs.writeFile(
        TEMP_FILE,
        JSON.stringify(catalog, null, 4),
        "utf8"
    );

    await fs.rename(TEMP_FILE, INPUT_FILE);
}

async function processStream(item) {
    const { movie, stream } = item;

    try {
        const realUrl = replaceCredentials(
            stream.streamUrl
        );

        const probe = await probeStream(realUrl);

        stream.probe = probe;
        stream.probeUrlHash = hashUrl(realUrl);

        return {
            title: movie.title,
            valid: isValidProbe(probe),
            error: probe.error ?? null
        };

    } catch (error) {
        stream.probe = {
            ok: false,
            error: error.message
        };

        return {
            title: movie.title,
            valid: false,
            error: error.message
        };
    }
}

async function processBatch(items) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const index = nextIndex++;

            if (index >= items.length) {
                return;
            }

            results[index] = await processStream(
                items[index]
            );
        }
    }

    const workers = Array.from(
        {
            length: Math.min(
                CONCURRENCY,
                items.length
            )
        },
        () => worker()
    );

    await Promise.all(workers);

    return results;
}

async function main() {
    if (!USER || !PASSWORD) {
        throw new Error(
            "Configurá IPTV_USER_2 e IPTV_PASSWORD_2 en .env"
        );
    }

    console.log("📂 Leyendo catálogo...");

    const catalog = JSON.parse(
        await fs.readFile(INPUT_FILE, "utf8")
    );

    const targets = [];

    let totalList2 = 0;
    let alreadyValid = 0;

    for (const movie of Object.values(catalog)) {
        for (const stream of movie.streams ?? []) {
            if (stream.source !== SOURCE) {
                continue;
            }

            totalList2++;

            if (isValidProbe(stream.probe)) {
                alreadyValid++;
                continue;
            }

            targets.push({
                movie,
                stream
            });
        }
    }

    console.log("\n📊 RESUMEN INICIAL");
    console.log(`Streams de Lista 2: ${totalList2}`);
    console.log(`Ya válidos: ${alreadyValid}`);
    console.log(`Pendientes de reintento: ${targets.length}`);

    if (targets.length === 0) {
        console.log("\n✅ No hay streams para reintentar.");
        return;
    }

    console.log("\n💾 Creando backup...");

    await fs.copyFile(
        INPUT_FILE,
        BACKUP_FILE
    );

    console.log(`Backup: ${BACKUP_FILE}`);

    let recovered = 0;
    let failed = 0;
    let processed = 0;

    for (
        let start = 0;
        start < targets.length;
        start += BATCH_SIZE
    ) {
        const batch = targets.slice(
            start,
            start + BATCH_SIZE
        );

        console.log(
            `\n🔎 Procesando ${start + 1} a ${start + batch.length} de ${targets.length}`
        );

        const results = await processBatch(batch);

        for (const result of results) {
            processed++;

            if (result.valid) {
                recovered++;

                console.log(
                    `✅ Recuperado: ${result.title}`
                );
            } else {
                failed++;

                console.log(
                    `❌ Sigue inválido: ${result.title}`
                );
            }
        }

        await saveCatalog(catalog);

        console.log(
            `💾 Avance guardado: ${processed}/${targets.length}`
        );

        console.log(
            `   Recuperados: ${recovered} | Fallidos: ${failed}`
        );
    }

    console.log("\n================================");
    console.log("       REINTENTO TERMINADO");
    console.log("================================");

    console.log(`Fuente: ${SOURCE}`);
    console.log(`Streams revisados: ${processed}`);
    console.log(`Recuperados: ${recovered}`);
    console.log(`Siguen inválidos: ${failed}`);
    console.log(`Ya válidos antes: ${alreadyValid}`);
    console.log(`Total válidos ahora: ${alreadyValid + recovered}`);
    console.log(`Backup: ${BACKUP_FILE}`);
}

main().catch(error => {
    console.error("\n❌ Error:", error.message);
    process.exitCode = 1;
});