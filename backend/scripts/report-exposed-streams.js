import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREAMS_FILE = path.join(
    __dirname,
    "../data/movie-streams.json"
);

const REPORT_FILE = path.join(
    __dirname,
    "../data/exposed-streams.json"
);

function sanitizeStreamUrl(streamUrl) {
    try {
        const url = new URL(streamUrl);

        const parts = url.pathname.split("/");

        const typeIndex = parts.findIndex(
            part =>
                part === "movie" ||
                part === "series"
        );

        if (typeIndex === -1) {
            return streamUrl;
        }

        const userIndex = typeIndex + 1;
        const passwordIndex = typeIndex + 2;

        if (
            !parts[userIndex] ||
            !parts[passwordIndex]
        ) {
            return streamUrl;
        }

        parts[userIndex] = "{user}";
        parts[passwordIndex] = "{password}";

        url.pathname = parts.join("/");

        return url.toString();

    } catch {
        return streamUrl;
    }
}

function hasRealCredentials(streamUrl) {
    try {
        const url = new URL(streamUrl);

        const parts = url.pathname.split("/");

        const typeIndex = parts.findIndex(
            part =>
                part === "movie" ||
                part === "series"
        );

        if (typeIndex === -1) {
            return false;
        }

        const user = parts[typeIndex + 1];
        const password = parts[typeIndex + 2];

        if (!user || !password) {
            return false;
        }

        const decodedUser = decodeURIComponent(user);
        const decodedPassword = decodeURIComponent(password);

        return !(
            decodedUser === "{user}" &&
            decodedPassword === "{password}"
        );

    } catch {
        return false;
    }
}

async function main() {
    console.log("🔎 Generando reporte...\n");

    const content = await fs.readFile(
        STREAMS_FILE,
        "utf8"
    );

    const streams = JSON.parse(content);

    const exposed = [];

    for (const [tmdbId, movie] of Object.entries(streams)) {

        if (!movie.streamUrl) {
            continue;
        }

        if (!hasRealCredentials(movie.streamUrl)) {
            continue;
        }

        const sanitizedUrl =
            sanitizeStreamUrl(movie.streamUrl);

        exposed.push({
            tmdbId: movie.tmdbId ?? Number(tmdbId),
            title: movie.title,
            originalTitle: movie.originalTitle,
            year: movie.year,
            matchMethod: movie.matchMethod,
            confidence: movie.confidence,

            originalStreamUrl:
                movie.streamUrl,

            sanitizedStreamUrl:
                sanitizedUrl
        });
    }

    await fs.writeFile(
        REPORT_FILE,
        JSON.stringify(
            exposed,
            null,
            4
        ),
        "utf8"
    );

    console.log("=================================");
    console.log("📊 REPORTE GENERADO");
    console.log("=================================");

    console.log(
        "Entradas con credenciales:",
        exposed.length
    );

    console.log(
        "\nArchivo:"
    );

    console.log(
        "→ data/exposed-streams.json"
    );

    console.log("\nPrimeras entradas:");

    for (
        const movie of exposed.slice(0, 10)
    ) {
        console.log("\n-----------------------------------");

        console.log(
            `TMDB: ${movie.tmdbId}`
        );

        console.log(
            `Título: ${movie.title}`
        );

        console.log(
            `Original: ${movie.originalTitle}`
        );

        console.log(
            `URL original: ${movie.originalStreamUrl}`
        );

        console.log(
            `URL sanitizada: ${movie.sanitizedStreamUrl}`
        );
    }

    console.log("\n✅ movie-streams.json NO fue modificado.");
}

main().catch(error => {
    console.error(
        "\n❌ Error:",
        error
    );

    process.exit(1);
});