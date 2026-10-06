import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const data = JSON.parse(
    fs.readFileSync(
        "./data/series-streams-combined.json",
        "utf8"
    )
);

const series = data["111800"];

if (!series) {
    console.log("❌ No se encontró the old man");
    process.exit(1);
}

console.log("\n🎬 the old man - RESUMEN COMPLETO");
console.log("========================================");

for (const [seasonNumber, season] of Object.entries(
    series.seasons ?? {}
)) {

    console.log(`\n📀 TEMPORADA ${seasonNumber}`);
    console.log("----------------------------------------");

    for (const [episodeNumber, episode] of Object.entries(
        season.episodes ?? {}
    )) {

        const results = [];

        for (const source of episode.sources ?? []) {

            try {

                const { stdout } = await execFileAsync(
                    "ffprobe",
                    [
                        "-v", "error",
                        "-show_entries",
                        "stream=codec_type,codec_name:stream_tags=language",
                        "-of", "json",
                        source.url
                    ],
                    {
                        timeout: 30000
                    }
                );

                const result = JSON.parse(stdout);

                const videos = (result.streams ?? [])
                    .filter(
                        stream =>
                            stream.codec_type === "video" &&
                            stream.codec_name !== "png"
                    )
                    .map(
                        stream =>
                            stream.codec_name
                    );

                const audios = (result.streams ?? [])
                    .filter(
                        stream =>
                            stream.codec_type === "audio"
                    )
                    .map(
                        stream => {

                            const language =
                                stream.tags?.language;

                            return language
                                ? `${stream.codec_name}/${language}`
                                : stream.codec_name;
                        }
                    );

                results.push(
                    `${source.source}: ` +
                    `V=${videos.join(",") || "?"} ` +
                    `A=${audios.join(",") || "SIN AUDIO"}`
                );

            } catch (error) {

                results.push(
                    `${source.source}: ERROR`
                );
            }
        }

        console.log(
            `E${episodeNumber}: ` +
            results.join(" | ")
        );
    }
}

console.log(
    "\n========================================\n"
);