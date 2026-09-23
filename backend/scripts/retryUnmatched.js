import "dotenv/config";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { matchMovie } from "../services/movieMatcher.service.js";
import {
    sanitizeStreamUrl
} from "../services/m3u.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");

const STREAMS_FILE = path.join(
    DATA_DIR,
    "movie-streams.json"
);

const UNMATCHED_FILE = path.join(
    DATA_DIR,
    "unmatched-movies.json"
);

const DELAY_MS = 250;

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

async function readJson(file, defaultValue) {
    try {
        const content = await fs.readFile(
            file,
            "utf8"
        );

        return JSON.parse(content);
    } catch {
        return defaultValue;
    }
}

async function writeJson(file, data) {
    await fs.writeFile(
        file,
        JSON.stringify(data, null, 4),
        "utf8"
    );
}

async function main() {
    console.log(
        "🔄 Reintentando películas sin coincidencia...\n"
    );

    const streams = await readJson(
        STREAMS_FILE,
        {}
    );

    const unmatched = await readJson(
        UNMATCHED_FILE,
        []
    );

    console.log(
        `⚠️ Películas sin match: ${unmatched.length}\n`
    );

    if (!unmatched.length) {
        console.log(
            "✅ No hay películas para reprocesar."
        );

        return;
    }

    const newUnmatched = [];

    let matchedCount = 0;
    let stillUnmatchedCount = 0;

    for (
        let i = 0;
        i < unmatched.length;
        i++
    ) {
        const movie = unmatched[i];

        console.log(
            `[${i + 1}/${unmatched.length}] ${movie.name}`
        );

        try {
            const match = await matchMovie(movie);

            if (match.matched) {
                streams[match.tmdbId] = {
                    tmdbId: match.tmdbId,
                    title: match.title,
                    originalTitle:
                        match.originalTitle,
                    year: match.year,
                    posterPath:
                        match.posterPath,
                    streamUrl: sanitizeStreamUrl(
                        movie.streamUrl
                    ),
                    matchMethod:
                        match.matchMethod,
                    confidence:
                        match.confidence
                };

                matchedCount++;

                console.log(
                    `  ✅ TMDB ${match.tmdbId}`
                );

                console.log(
                    `  Método: ${match.matchMethod}`
                );

                console.log(
                    `  Confianza: ${match.confidence}`
                );
            } else {
                newUnmatched.push({
                    ...movie,
                    reason: match.reason,
                    candidates:
                        match.candidates ?? []
                });

                stillUnmatchedCount++;

                console.log(
                    "  ⚠️ Sigue sin coincidencia"
                );
            }

            await sleep(DELAY_MS);

        } catch (error) {
            console.error(
                "  ❌ Error:",
                error.response?.data ??
                    error.message
            );

            // Si ocurre un error, conservamos
            // la película para no perderla.
            newUnmatched.push(movie);

            stillUnmatchedCount++;
        }

        // Guardar progreso cada 25 películas
        if ((i + 1) % 25 === 0) {
            await writeJson(
                STREAMS_FILE,
                streams
            );

            await writeJson(
                UNMATCHED_FILE,
                newUnmatched
            );

            console.log(
                "  💾 Progreso guardado"
            );
        }
    }

    // Guardado final
    await writeJson(
        STREAMS_FILE,
        streams
    );

    await writeJson(
        UNMATCHED_FILE,
        newUnmatched
    );

    console.log("\n=================================");
    console.log(
        "🎉 REINTENTO TERMINADO"
    );
    console.log("=================================");

    console.log(
        "Procesadas:",
        unmatched.length
    );

    console.log(
        "Nuevos matches:",
        matchedCount
    );

    console.log(
        "Siguen sin match:",
        stillUnmatchedCount
    );

    console.log("\nArchivos actualizados:");

    console.log(
        "→ data/movie-streams.json"
    );

    console.log(
        "→ data/unmatched-movies.json"
    );
}

main().catch(error => {
    console.error(
        "\n❌ Error fatal:",
        error
    );

    process.exit(1);
});