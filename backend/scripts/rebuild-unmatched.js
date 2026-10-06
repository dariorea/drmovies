import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import axios from "axios";

import { parseM3U } from "../services/m3u.service.js";

dotenv.config()
const SOURCE = process.argv[2];

if (!SOURCE) {
    console.error("Uso: node scripts/rebuild-unmatched.js lista-3");
    process.exit(1);
}

const SOURCE_NUMBER = SOURCE.replace("lista-", "");

if (!/^\d+$/.test(SOURCE_NUMBER)) {
    console.error(`Fuente inválida: ${SOURCE}`);
    process.exit(1);
}

const URL_KEY =
    SOURCE_NUMBER === "1"
        ? "IPTV_M3U_URL"
        : `IPTV_M3U_URL_${SOURCE_NUMBER}`;

const M3U_URL = process.env[URL_KEY];

if (!M3U_URL) {
    console.error(`No existe ${URL_KEY} en .env`);
    process.exit(1);
}

const DATA_DIR = path.resolve("data");

const CATALOG_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.json"
);

const OUTPUT_FILE = path.join(
    DATA_DIR,
    `unmatched-movies-${SOURCE}-rebuilt.json`
);

async function readJson(file) {
    return JSON.parse(
        await fs.readFile(file, "utf8")
    );
}

function sanitizeStreamUrl(url) {
    return url
        .replace(
            /\/movie\/[^/]+\/[^/]+\//,
            "/movie/{user}/{password}/"
        )
        .replace(
            /\/series\/[^/]+\/[^/]+\//,
            "/series/{user}/{password}/"
        );
}

function normalizeUrl(url) {
    return sanitizeStreamUrl(url).trim();
}

async function main() {
    console.log("========================================");
    console.log(" RECONSTRUIR UNMATCHED");
    console.log("========================================");
    console.log(`Fuente: ${SOURCE}`);
    console.log(`Variable: ${URL_KEY}`);
    console.log();

    console.log("Leyendo catálogo...");
    const catalog = await readJson(CATALOG_FILE);

    console.log(
        `Películas en catálogo: ${Object.keys(catalog).length}`
    );

    console.log();
    console.log("Descargando lista M3U...");
    console.log(`URL: ${M3U_URL.replace(/(username=)[^&]+/, "$1***")
        .replace(/(password=)[^&]+/, "$1***")}`);

    const response = await axios.get(M3U_URL, {
        timeout: 120000,
        responseType: "text"
    });

    console.log("Lista descargada.");
    console.log();

    const parsedMovies = parseM3U(response.data);

    console.log(
        `Películas encontradas en M3U: ${parsedMovies.length}`
    );

    const unmatched = [];

    let alreadyInCatalog = 0;
    let withoutSource = 0;

    for (const movie of parsedMovies) {
        if (!movie.streamUrl) {
            withoutSource++;
            continue;
        }

        const normalizedUrl = normalizeUrl(movie.streamUrl);

        let found = false;

        for (const tmdbId of Object.keys(catalog)) {
            const entry = catalog[tmdbId];

            if (!entry?.streams) {
                continue;
            }

            const exists = entry.streams.some((stream) => {
                if (stream.source !== SOURCE) {
                    return false;
                }

                return normalizeUrl(stream.streamUrl) === normalizedUrl;
            });

            if (exists) {
                found = true;
                break;
            }
        }

        if (found) {
            alreadyInCatalog++;
        } else {
            unmatched.push({
                name: movie.name,
                streamUrl: normalizedUrl,
                source: SOURCE
            });
        }
    }

    console.log();
    console.log("========================================");
    console.log(" RESULTADO");
    console.log("========================================");
    console.log(`Entradas M3U:       ${parsedMovies.length}`);
    console.log(`Ya en catálogo:     ${alreadyInCatalog}`);
    console.log(`Sin URL:            ${withoutSource}`);
    console.log(`No encontradas:     ${unmatched.length}`);
    console.log();

    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(unmatched, null, 4),
        "utf8"
    );

    console.log(`Archivo generado:`);
    console.log(OUTPUT_FILE);
    console.log();
    console.log("El catálogo NO fue modificado.");
}

main().catch((error) => {
    console.error();
    console.error("❌ Error:");
    console.error(error.message);
    process.exit(1);
});