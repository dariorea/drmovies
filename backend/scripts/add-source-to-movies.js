import fs from "fs/promises";

const FILE = "./data/movie-streams-all.json";

async function main() {
    const data = JSON.parse(
        await fs.readFile(FILE, "utf8")
    );

    let moviesUpdated = 0;
    let streamsUpdated = 0;

    for (const movie of Object.values(data)) {
        if (!Array.isArray(movie.streams)) {
            continue;
        }

        let movieChanged = false;

        for (const stream of movie.streams) {
            if (!stream.source) {
                stream.source = "lista-1";
                streamsUpdated++;
                movieChanged = true;
            }
        }

        if (movieChanged) {
            moviesUpdated++;
        }
    }

    await fs.writeFile(
        FILE,
        JSON.stringify(data, null, 4),
        "utf8"
    );

    console.log("✅ Migración terminada");
    console.log(`🎬 Películas modificadas: ${moviesUpdated}`);
    console.log(`📺 Streams modificados: ${streamsUpdated}`);
}

main().catch(error => {
    console.error("❌ Error:", error);
    process.exit(1);
});