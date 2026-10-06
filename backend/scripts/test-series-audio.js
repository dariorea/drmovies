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

const episode =
    data["108978"]
        ?.seasons?.["3"]
        ?.episodes?.["2"];

if (!episode) {
    console.log("❌ No se encontró Reacher T3 E2");
    process.exit(1);
}

console.log("\n🎬 Reacher T3 E2");
console.log("==============================");

for (const source of episode.sources ?? []) {

    console.log("\n📡 Fuente:", source.source);
    console.log("🔗 URL:", source.url);

    try {

        const { stdout } = await execFileAsync(
            "ffprobe",
            [
                "-v", "error",
                "-show_entries",
                "stream=index,codec_type,codec_name:stream_tags=language,title",
                "-of", "json",
                source.url
            ],
            {
                timeout: 30000
            }
        );

        const result =
            JSON.parse(stdout);

            for (const stream of result.streams ?? []) {

                if (stream.codec_type === "video") {
            
                    console.log(
                        `🎥 Video: ${stream.codec_name}`
                    );
            
                    if (stream.tags?.language) {
                        console.log(
                            `   🌐 Idioma: ${stream.tags.language}`
                        );
                    }
            
                    if (stream.tags?.title) {
                        console.log(
                            `   🏷️ Título: ${stream.tags.title}`
                        );
                    }
            
                }
            
                if (stream.codec_type === "audio") {
            
                    console.log(
                        `🔊 Audio: ${stream.codec_name}`
                    );
            
                    if (stream.tags?.language) {
                        console.log(
                            `   🌐 Idioma: ${stream.tags.language}`
                        );
                    }
            
                    if (stream.tags?.title) {
                        console.log(
                            `   🏷️ Título: ${stream.tags.title}`
                        );
                    }
            
                }
            
            }

    } catch (error) {

        console.log(
            "❌ No se pudo analizar esta fuente"
        );

        console.log(
            error.message
        );
    }
}

console.log("\n==============================\n");