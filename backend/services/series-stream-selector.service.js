import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const CACHE_FILE = path.resolve(
    "./data/series-stream-selection.json"
);

let selectionCache = null;

async function loadCache() {
    if (selectionCache) {
        return selectionCache;
    }

    try {
        const content = await fs.readFile(
            CACHE_FILE,
            "utf8"
        );

        selectionCache = JSON.parse(content);

    } catch {
        selectionCache = {};
    }

    return selectionCache;
}

async function saveCache() {
    await fs.writeFile(
        CACHE_FILE,
        JSON.stringify(selectionCache, null, 2),
        "utf8"
    );
}

function probeStream(url) {
    return new Promise((resolve, reject) => {
        const process = spawn("ffprobe", [
            "-v",
            "error",

            "-show_entries",
            "stream=codec_type,codec_name,profile,width,height,pix_fmt",

            "-of",
            "json",

            url
        ]);

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", data => {
            stdout += data.toString();
        });

        process.stderr.on("data", data => {
            stderr += data.toString();
        });

        process.on("error", reject);

        process.on("close", code => {
            if (code !== 0) {
                return reject(
                    new Error(
                        stderr || `ffprobe terminó con código ${code}`
                    )
                );
            }

            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(
                    new Error("Respuesta inválida de ffprobe")
                );
            }
        });
    });
}

function scoreStream(data) {
    const streams = data.streams || [];

    const video = streams.find(
        stream => stream.codec_type === "video"
    );

    const audio = streams.find(
        stream => stream.codec_type === "audio"
    );

    if (!video) {
        return {
            score: -9999,
            video,
            audio
        };
    }

    let score = 0;

    // -------------------------
    // VIDEO
    // -------------------------

    if (video.codec_name === "h264") {
        score += 50;
    } else if (video.codec_name === "hevc") {
        score += 15;
    } else {
        score += 5;
    }

    // 8-bit compatible
    if (video.pix_fmt === "yuv420p") {
        score += 30;
    }

    // 10-bit
    if (
        video.pix_fmt?.includes("10") ||
        video.profile?.includes("10")
    ) {
        score -= 35;
    }

    // HEVC Main 10
    if (
        video.codec_name === "hevc" &&
        video.profile?.includes("Main 10")
    ) {
        score -= 30;
    }

    // 4K: no lo rechazamos,
    // simplemente pierde prioridad.
    if (
        video.width >= 3840 ||
        video.height >= 2160
    ) {
        score -= 5;
    }

    // -------------------------
    // AUDIO
    // -------------------------

    if (!audio) {
        score -= 40;
    } else if (audio.codec_name === "aac") {
        score += 50;
    } else if (audio.codec_name === "eac3") {
        score += 5;
    } else {
        score += 10;
    }

    return {
        score,
        video,
        audio
    };
}

export async function selectBestSeriesStream(
    tmdbId,
    season,
    episode,
    sources
) {
    const cache = await loadCache();

    const cacheKey =
        `${tmdbId}:${season}:${episode}`;

    // -------------------------
    // CACHE
    // -------------------------

    const cached = cache[cacheKey];

    if (cached) {
        console.log(
            `♻️ Stream reutilizado: ${cacheKey}`
        );

        return cached;
    }

    console.log(
        `🔎 Buscando mejor stream: ${cacheKey}`
    );

    const candidates = [];

    // -------------------------
    // PROBAR FUENTES
    // -------------------------

    for (const source of sources) {
        try {
            console.log(
                `🔍 ffprobe ${source.source}`
            );

            const data = await probeStream(
                source.url
            );

            const result = scoreStream(data);

            console.log(
                `   ${source.source}: ` +
                `${result.video?.codec_name ?? "?"} + ` +
                `${result.audio?.codec_name ?? "sin audio"} ` +
                `→ ${result.score} puntos`
            );

            candidates.push({
                source: source.source,
                url: source.url,
                score: result.score,
                video: result.video
                    ? {
                        codec: result.video.codec_name,
                        profile: result.video.profile,
                        width: result.video.width,
                        height: result.video.height,
                        pix_fmt: result.video.pix_fmt
                    }
                    : null,
                audio: result.audio
                    ? {
                        codec: result.audio.codec_name
                    }
                    : null
            });

        } catch (error) {
            console.log(
                `❌ ${source.source}: ${
                    error.message
                }`
            );
        }
    }

    if (!candidates.length) {
        return null;
    }

    // -------------------------
    // ORDENAR
    // -------------------------

    candidates.sort(
        (a, b) => b.score - a.score
    );

    const selected = candidates[0];

    console.log(
        `🏆 Seleccionado: ${selected.source}`
    );

    console.log(
        `   Video: ${selected.video?.codec}`
    );

    console.log(
        `   Audio: ${selected.audio?.codec ?? "sin audio"}`
    );

    console.log(
        `   Score: ${selected.score}`
    );

    // -------------------------
    // GUARDAR CACHE
    // -------------------------

    cache[cacheKey] = selected;

    await saveCache();

    return selected;
}