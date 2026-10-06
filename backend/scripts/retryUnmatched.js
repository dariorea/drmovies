import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { matchMovie } from "../services/movieMatcher.service.js";
import { sanitizeStreamUrl } from "../services/m3u.service.js";

dotenv.config()
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");

const SOURCE = process.argv[2];

if (!SOURCE) {
    console.error("Uso: node scripts/retryUnmatched.js lista-3");
    process.exit(1);
}

const CATALOG_FILE = path.join(
    DATA_DIR,
    "movie-streams-all.json"
);

const UNMATCHED_FILE = path.join(
    DATA_DIR,
    `unmatched-movies-${SOURCE}.json`
);

const CATALOG_BACKUP = path.join(
    DATA_DIR,
    `movie-streams-all.before-retry-${SOURCE}.json`
);

const PROGRESS_FILE = path.join(
    DATA_DIR,
    `unmatched-movies-${SOURCE}.retry-progress.json`
);

const TEMP_CATALOG_FILE = path.join(
    DATA_DIR,
    `movie-streams-all.retry-${SOURCE}.tmp.json`
);

const TEMP_UNMATCHED_FILE = path.join(
    DATA_DIR,
    `unmatched-movies-${SOURCE}.retry.tmp.json`
);

const DELAY_MS = 250;

async function readJson(file, fallback = null) {
    try {
        return JSON.parse(
            await fs.readFile(file, "utf8")
        );
    } catch {
        return fallback;
    }
}

async function saveJson(file, data) {
    await fs.writeFile(
        file,
        JSON.stringify(data, null, 4),
        "utf8"
    );
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("========================================");
    console.log(" RETRY UNMATCHED");
    console.log("========================================");
    console.log(`Fuente: ${SOURCE}`);
    console.log();

    const catalog = await readJson(CATALOG_FILE, null);
    const unmatched = await readJson(UNMATCHED_FILE, null);

    if (!catalog) {
        throw new Error(
            `No se pudo leer ${CATALOG_FILE}`
        );
    }

    if (!unmatched) {
        throw new Error(
            `No se pudo leer ${UNMATCHED_FILE}`
        );
    }

    console.log(
        `Películas en catálogo: ${Object.keys(catalog).length}`
    );

    console.log(
        `Películas pendientes: ${unmatched.length}`
    );

    /*
     * Si no existe progreso, creamos un backup del catálogo.
     */
    let progress = await readJson(PROGRESS_FILE, null);

    if (!progress) {
        console.log();
        console.log("Creando backup del catálogo...");

        await fs.copyFile(
            CATALOG_FILE,
            CATALOG_BACKUP
        );

        progress = {
            nextIndex: 0,
            matchedCount: 0,
            ambiguousCount: 0,
            noMatchCount: 0,
            errorCount: 0,
            unmatched: []
        };

        await saveJson(
            PROGRESS_FILE,
            progress
        );

        console.log(
            `Backup: ${CATALOG_BACKUP}`
        );
    } else {
        console.log();
        console.log(
            `Retomando desde ${progress.nextIndex + 1}/${unmatched.length}`
        );
    }

    const startIndex = progress.nextIndex;

    let matchedCount = progress.matchedCount;
    let ambiguousCount = progress.ambiguousCount;
    let noMatchCount = progress.noMatchCount;
    let errorCount = progress.errorCount;
    let newUnmatched = progress.unmatched;

    /*
     * Trabajamos sobre una copia del catálogo en memoria.
     * El archivo original no se modifica durante el proceso.
     */
    for (
        let i = startIndex;
        i < unmatched.length;
        i++
    ) {
        const movie = unmatched[i];

        console.log(
            `\n[${i + 1}/${unmatched.length}] ${movie.name}`
        );

        try {
            const result = await matchMovie(movie.name);

            if (result?.match) {
                const match = result.match;

                const tmdbId = String(
                    match.tmdbId
                );

                if (!catalog[tmdbId]) {
                    catalog[tmdbId] = {
                        tmdbId: match.tmdbId,
                        title: match.title,
                        originalTitle:
                            match.originalTitle,
                        year: match.year,
                        posterPath:
                            match.posterPath,
                        streams: []
                    };
                }

                if (!catalog[tmdbId].streams) {
                    catalog[tmdbId].streams = [];
                }

                const streamUrl =
                    sanitizeStreamUrl(
                        movie.streamUrl
                    );

                const alreadyExists =
                    catalog[tmdbId].streams.some(
                        stream =>
                            stream.source === SOURCE &&
                            sanitizeStreamUrl(
                                stream.streamUrl
                            ) === streamUrl
                    );

                if (!alreadyExists) {
                    catalog[tmdbId].streams.push({
                        streamUrl,
                        source: SOURCE,
                        confidence:
                            match.confidence
                    });

                    matchedCount++;

                    console.log(
                        `  ✅ ${match.title} (${match.tmdbId})`
                    );
                    console.log(
                        `     Confianza: ${match.confidence}`
                    );
                } else {
                    console.log(
                        "  ↪️ Stream ya existente"
                    );
                }

            } else {
                const item = {
                    name: movie.name,
                    streamUrl: movie.streamUrl,
                    source: movie.source,
                    reason:
                        result?.reason ??
                        "no-match"
                };

                if (result?.candidates) {
                    item.candidates =
                        result.candidates;
                }

                newUnmatched.push(item);

                if (
                    result?.reason?.includes(
                        "ambiguous"
                    )
                ) {
                    ambiguousCount++;

                    console.log(
                        "  ⚠️ Coincidencia ambigua"
                    );
                } else {
                    noMatchCount++;

                    console.log(
                        "  ❌ Sin coincidencia"
                    );
                }
            }

        } catch (error) {
            errorCount++;

            console.log(
                `  💥 Error: ${error.message}`
            );

            /*
             * Un error de red no se considera una película
             * definitivamente no encontrada.
             * La dejamos pendiente para poder reintentarlo.
             */
            newUnmatched.push({
                name: movie.name,
                streamUrl: movie.streamUrl,
                source: movie.source,
                reason: "retry-error",
                error: error.message
            });
        }

        /*
         * Guardamos TODO el estado en archivos temporales.
         */
        await saveJson(
            TEMP_CATALOG_FILE,
            catalog
        );

        await saveJson(
            TEMP_UNMATCHED_FILE,
            newUnmatched
        );

        await saveJson(
            PROGRESS_FILE,
            {
                nextIndex: i + 1,
                matchedCount,
                ambiguousCount,
                noMatchCount,
                errorCount,
                unmatched: newUnmatched
            }
        );

        if (i < unmatched.length - 1) {
            await sleep(DELAY_MS);
        }
    }

    console.log();
    console.log("========================================");
    console.log(" PROCESAMIENTO TERMINADO");
    console.log("========================================");
    console.log(`Encontradas:        ${matchedCount}`);
    console.log(`Ambiguas:           ${ambiguousCount}`);
    console.log(`Sin coincidencia:   ${noMatchCount}`);
    console.log(`Errores:            ${errorCount}`);
    console.log(`Pendientes finales: ${newUnmatched.length}`);
    console.log();

    /*
     * Solo ahora reemplazamos los archivos originales.
     */
    console.log("Actualizando catálogo...");

    await fs.copyFile(
        TEMP_CATALOG_FILE,
        CATALOG_FILE
    );

    await fs.copyFile(
        TEMP_UNMATCHED_FILE,
        UNMATCHED_FILE
    );

    /*
     * El progreso ya no es necesario.
     */
    await fs.rm(
        PROGRESS_FILE,
        { force: true }
    );

    await fs.rm(
        TEMP_CATALOG_FILE,
        { force: true }
    );

    await fs.rm(
        TEMP_UNMATCHED_FILE,
        { force: true }
    );

    console.log();
    console.log("========================================");
    console.log(" ✅ RETRY FINALIZADO");
    console.log("========================================");
    console.log(
        `Backup disponible en:`
    );
    console.log(CATALOG_BACKUP);
}

main().catch(error => {
    console.error();
    console.error("❌ Error fatal:");
    console.error(error);
    process.exit(1);
});