import "dotenv/config";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
    downloadM3U,
    parseM3U,
    sanitizeStreamUrl
} from "../services/m3u.service.js";

import {
    matchMovie
} from "../services/movieMatcher.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");

const STREAMS_FILE = path.join(DATA_DIR, "movie-streams.json");
const UNMATCHED_FILE = path.join(DATA_DIR, "unmatched-movies.json");
const CACHE_FILE = path.join(DATA_DIR, "tmdb-cache.json");

// Tiempo entre peticiones a TMDB
const DELAY_MS = 250;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJson(file, defaultValue) {
    try {
        const content = await fs.readFile(file, "utf8");
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

function createCacheKey(movie) {
    return [
        movie.name,
        movie.year ?? "",
        movie.posterPath ?? ""
    ].join("|");
}

function createUnmatchedKey(movie) {
    return [
        movie.name,
        movie.year ?? "",
        movie.posterPath ?? ""
    ].join("|");
}

async function main() {
    console.log("🚀 Iniciando sincronización...\n");

    await fs.mkdir(DATA_DIR, { recursive: true });

    const streams = await readJson(STREAMS_FILE, {});
    const unmatched = await readJson(UNMATCHED_FILE, []);
    const cache = await readJson(CACHE_FILE, {});

    const content = await downloadM3U();

    const movies = parseM3U(content);

    console.log(`🎬 Películas encontradas: ${movies.length}\n`);

    // Creamos un Set para evitar duplicados en unmatched
    const unmatchedKeys = new Set(
        unmatched.map(movie =>
            createUnmatchedKey(movie)
        )
    );

    let matchedCount = 0;
    let unmatchedCount = 0;
    let cacheCount = 0;

    for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];

        const cacheKey = createCacheKey(movie);

        console.log(
            `[${i + 1}/${movies.length}] ${movie.name}`
        );

        let match = cache[cacheKey];

        if (match) {
            console.log("  💾 Usando caché");
            cacheCount++;
        } else {
            try {
                match = await matchMovie(movie);

                cache[cacheKey] = match;

                await writeJson(
                    CACHE_FILE,
                    cache
                );

                await sleep(DELAY_MS);
            } catch (error) {
                console.error(
                    "  ❌ Error TMDB:",
                    error.response?.data ?? error.message
                );

                continue;
            }
        }

        if (match.matched) {
            streams[match.tmdbId] = {
                tmdbId: match.tmdbId,
                title: match.title,
                originalTitle: match.originalTitle,
                year: match.year,
                posterPath: match.posterPath,
                streamUrl: sanitizeStreamUrl(
                    movie.streamUrl
                ),
                matchMethod: match.matchMethod,
                confidence: match.confidence
            };

            matchedCount++;

            console.log(
                `  ✅ TMDB ${match.tmdbId}`
            );

            console.log(
                `  Método: ${match.matchMethod}`
            );
        } else {
            const unmatchedKey =
                createUnmatchedKey(movie);

            if (!unmatchedKeys.has(unmatchedKey)) {
                unmatched.push({
                    name: movie.name,
                    year: movie.year,
                    posterPath: movie.posterPath,
                    streamUrl: movie.streamUrl,
                    reason: match.reason,
                    candidates: match.candidates ?? []
                });

                unmatchedKeys.add(unmatchedKey);
            }

            unmatchedCount++;

            console.log(
                "  ⚠️ Sin coincidencia segura"
            );
        }

        // Guardar progreso cada 25 películas
        if ((i + 1) % 25 === 0) {
            await writeJson(
                STREAMS_FILE,
                streams
            );

            await writeJson(
                UNMATCHED_FILE,
                unmatched
            );

            await writeJson(
                CACHE_FILE,
                cache
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
        unmatched
    );

    await writeJson(
        CACHE_FILE,
        cache
    );

    console.log("\n=================================");
    console.log("🎉 SINCRONIZACIÓN TERMINADA");
    console.log("=================================");

    console.log(
        "Películas M3U:",
        movies.length
    );

    console.log(
        "Matches:",
        matchedCount
    );

    console.log(
        "Sin match:",
        unmatchedCount
    );

    console.log(
        "Usadas desde caché:",
        cacheCount
    );

    console.log("\nArchivos:");

    console.log(
        "→ data/movie-streams.json"
    );

    console.log(
        "→ data/unmatched-movies.json"
    );

    console.log(
        "→ data/tmdb-cache.json"
    );
}

main().catch(error => {
    console.error(
        "\n❌ Error fatal:",
        error
    );

    process.exit(1);
});