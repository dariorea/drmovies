import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FILE = "./data/series-streams-combined.json";

async function probe(url) {
    try {
        const { stdout } = await execFileAsync(
            "ffprobe",
            [
                "-v",
                "error",
                "-show_entries",
                "stream=index,codec_type,codec_name:stream_tags=language,title",
                "-of",
                "json",
                url
            ],
            {
                maxBuffer: 1024 * 1024 * 5
            }
        );

        const data = JSON.parse(stdout);

        const streams = data.streams || [];

        const video = streams
            .filter(
                stream =>
                    stream.codec_type === "video" &&
                    stream.codec_name
            )
            .map(stream => stream.codec_name);

        const audio = streams
            .filter(
                stream =>
                    stream.codec_type === "audio" &&
                    stream.codec_name
            )
            .map(stream => ({
                codec: stream.codec_name,
                language: stream.tags?.language || null,
                title: stream.tags?.title || null
            }));

        return {
            ok: true,
            video,
            audio
        };
    } catch (error) {
        return {
            ok: false,
            error: error.message
        };
    }
}

function formatAudio(audio) {
    if (!audio.length) {
        return "sin-audio";
    }

    return audio
        .map(item => {
            let result = item.codec;

            if (item.language) {
                result += `/${item.language}`;
            }

            return result;
        })
        .join(",");
}

async function main() {
    console.log("🎬 ANALIZADOR COMPLETO DE SERIES");
    console.log("========================================\n");

    const content = await fs.readFile(FILE, "utf8");
    const catalog = JSON.parse(content);

    const stats = {
        series: 0,
        seasons: 0,
        episodes: 0,
        sources: 0,
        ok: 0,
        errors: 0,

        videoCodecs: {},
        audioCodecs: {},
        audioLanguages: {},

        sourceWithAAC: 0,
        sourceWithAC3: 0,
        sourceWithEAC3: 0,
        sourceWithoutAudio: 0
    };

    const detailedResults = [];

    for (const [tmdbId, series] of Object.entries(catalog)) {
        stats.series++;

        console.log(`\n🎬 ${series.name || "Sin nombre"} (${tmdbId})`);

        const seasons = series.seasons || {};

        for (const [seasonNumber, season] of Object.entries(seasons)) {
            stats.seasons++;

            const episodes = season.episodes || {};

            for (const [episodeNumber, episode] of Object.entries(episodes)) {
                stats.episodes++;

                const sources = Array.isArray(episode.sources)
                    ? episode.sources
                    : [];

                if (!sources.length) {
                    continue;
                }

                const episodeResults = [];

                for (const source of sources) {
                    stats.sources++;

                    process.stdout.write(
                        `   T${seasonNumber} E${episodeNumber} ${source.source} ... `
                    );

                    const result = await probe(source.url);

                    if (!result.ok) {
                        stats.errors++;

                        console.log("❌ ERROR");

                        episodeResults.push({
                            source: source.source,
                            url: source.url,
                            ok: false,
                            error: result.error
                        });

                        continue;
                    }

                    stats.ok++;

                    // VIDEO
                    for (const codec of result.video) {
                        stats.videoCodecs[codec] =
                            (stats.videoCodecs[codec] || 0) + 1;
                    }

                    // AUDIO
                    const codecsInSource = new Set();

                    for (const audio of result.audio) {
                        stats.audioCodecs[audio.codec] =
                            (stats.audioCodecs[audio.codec] || 0) + 1;

                        codecsInSource.add(audio.codec);

                        if (audio.language) {
                            stats.audioLanguages[audio.language] =
                                (stats.audioLanguages[audio.language] || 0) + 1;
                        }
                    }

                    if (codecsInSource.has("aac")) {
                        stats.sourceWithAAC++;
                    }

                    if (codecsInSource.has("ac3")) {
                        stats.sourceWithAC3++;
                    }

                    if (codecsInSource.has("eac3")) {
                        stats.sourceWithEAC3++;
                    }

                    if (!result.audio.length) {
                        stats.sourceWithoutAudio++;
                    }

                    console.log(
                        `✅ V=${result.video.join(",") || "?"} A=${formatAudio(result.audio)}`
                    );

                    episodeResults.push({
                        source: source.source,
                        url: source.url,
                        ok: true,
                        video: result.video,
                        audio: result.audio
                    });
                }

                detailedResults.push({
                    tmdbId,
                    seriesName: series.name,
                    season: Number(seasonNumber),
                    episode: Number(episodeNumber),
                    episodeName: episode.name || null,
                    sources: episodeResults
                });
            }
        }
    }

    console.log("\n");
    console.log("========================================");
    console.log("📊 RESUMEN GLOBAL");
    console.log("========================================");

    console.log(`\nSeries:       ${stats.series}`);
    console.log(`Temporadas:   ${stats.seasons}`);
    console.log(`Episodios:    ${stats.episodes}`);
    console.log(`Fuentes:      ${stats.sources}`);
    console.log(`Probe OK:     ${stats.ok}`);
    console.log(`Probe ERROR:  ${stats.errors}`);

    console.log("\n🎥 VIDEO");
    console.log("----------------------------------------");

    for (const [codec, count] of Object.entries(stats.videoCodecs)) {
        console.log(`${codec}: ${count}`);
    }

    console.log("\n🔊 AUDIO");
    console.log("----------------------------------------");

    for (const [codec, count] of Object.entries(stats.audioCodecs)) {
        console.log(`${codec}: ${count}`);
    }

    console.log("\n🌎 IDIOMAS");
    console.log("----------------------------------------");

    for (const [language, count] of Object.entries(stats.audioLanguages)) {
        console.log(`${language}: ${count}`);
    }

    console.log("\n🎯 FUENTES POR CODEC");
    console.log("----------------------------------------");

    console.log(`AAC:  ${stats.sourceWithAAC}`);
    console.log(`AC3:  ${stats.sourceWithAC3}`);
    console.log(`EAC3: ${stats.sourceWithEAC3}`);

    console.log(`Sin audio: ${stats.sourceWithoutAudio}`);

    // Guardar resultado completo
    await fs.writeFile(
        "./backend/data/series-codec-analysis.json",
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                stats,
                results: detailedResults
            },
            null,
            2
        ),
        "utf8"
    );

    console.log("\n💾 Resultado guardado en:");
    console.log("backend/data/series-codec-analysis.json");
}

main().catch(error => {
    console.error("\n❌ Error general:", error);
    process.exit(1);
});