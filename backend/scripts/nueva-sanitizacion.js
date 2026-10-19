import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data/series-streams-combined.json");
const APPLY = process.argv.includes("--apply");
const TARGET_SOURCE = "lista-6";

function decodeSegment(segment) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

function sanitizeUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        return { url: rawUrl, changed: false, ok: false };
    }

    let parsed;

    try {
        parsed = new URL(rawUrl);
    } catch {
        return { url: rawUrl, changed: false, ok: false };
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        return { url: rawUrl, changed: false, ok: false };
    }

    const segments = parsed.pathname.split("/");

    const resourceIndex = segments.findIndex(segment =>
        ["series", "movie"].includes(
            decodeSegment(segment).toLowerCase()
        )
    );

    if (
        resourceIndex < 0 ||
        !segments[resourceIndex + 1] ||
        !segments[resourceIndex + 2] ||
        !segments[resourceIndex + 3]
    ) {
        return { url: rawUrl, changed: false, ok: false };
    }

    // Sustituye las credenciales, conservando host y archivo.
    segments[resourceIndex + 1] = "%7Buser%7D";
    segments[resourceIndex + 2] = "%7Bpassword%7D";

    parsed.pathname = segments.join("/");

    return {
        url: parsed.href,
        changed: parsed.href !== rawUrl,
        ok: true
    };
}

const catalog = JSON.parse(fs.readFileSync(FILE, "utf8"));

let episodesVisited = 0;
let targetSourcesVisited = 0;
let sourceUrlsChanged = 0;
let streamUrlsChanged = 0;
let unrecognizedUrls = 0;
let targetSourcesWithoutUrl = 0;
let targetSourcesUnrecognized = 0;
let backup = null;

for (const [tmdbId, series] of Object.entries(catalog)) {
    for (const [seasonNumber, season] of Object.entries(
        series.seasons || {}
    )) {
        for (const [episodeNumber, episode] of Object.entries(
            season.episodes || {}
        )) {
            episodesVisited++;

            const sources = Array.isArray(episode.sources)
                ? episode.sources
                : [];

            // Modificar únicamente las fuentes de Lista 6.
            for (const source of sources) {
                if (source?.source !== TARGET_SOURCE) continue;

                targetSourcesVisited++;

                if (typeof source.url !== "string" || !source.url.trim()) {
                    targetSourcesWithoutUrl++;
                    continue;
                }

                const result = sanitizeUrl(source.url);

                if (!result.ok) {
                    unrecognizedUrls++;
                    targetSourcesUnrecognized++;

                    console.warn(
                        `URL de lista-6 no reconocida: ${tmdbId}, ` +
                        `T${seasonNumber}E${episodeNumber}`
                    );

                    continue;
                }

                if (result.changed) {
                    sourceUrlsChanged++;

                    if (APPLY) {
                        source.url = result.url;
                    }
                }
            }

            // Sanitizar la URL principal de forma independiente.
            // Nunca reemplazarla por sources[0].
            if (
                typeof episode.streamUrl === "string" &&
                episode.streamUrl.trim()
            ) {
                const result = sanitizeUrl(episode.streamUrl);

                if (!result.ok) {
                    unrecognizedUrls++;

                    console.warn(
                        `URL principal no reconocida: ${tmdbId}, ` +
                        `T${seasonNumber}E${episodeNumber}`
                    );
                } else if (result.changed) {
                    streamUrlsChanged++;

                    if (APPLY) {
                        episode.streamUrl = result.url;
                    }
                }
            }
        }
    }
}

console.log("\n======================================");
console.log(" SANITIZACIÓN SEGURA DE SERIES");
console.log("======================================");
console.log(`Modo: ${APPLY ? "APLICAR CAMBIOS" : "SIMULACIÓN"}`);
console.log(`Episodios revisados: ${episodesVisited}`);
console.log(`Fuentes de lista-6 revisadas: ${targetSourcesVisited}`);
console.log(`URLs de fuentes para cambiar: ${sourceUrlsChanged}`);
console.log(`URLs principales para cambiar: ${streamUrlsChanged}`);
console.log(`URLs no reconocidas: ${unrecognizedUrls}`);
console.log(`Fuentes lista-6 sin URL: ${targetSourcesWithoutUrl}`);
console.log(`Fuentes lista-6 no reconocidas: ${targetSourcesUnrecognized}`);

if (APPLY) {
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    backup = `${FILE}.backup-sanitizacion-${timestamp}`;

    // Crear la copia antes de modificar el archivo original.
    fs.copyFileSync(FILE, backup);

    try {
        fs.writeFileSync(
            FILE,
            JSON.stringify(catalog, null, 2) + "\n",
            "utf8"
        );

        console.log("\nCatálogo actualizado correctamente.");
        console.log(`Copia de seguridad: ${backup}`);
    } catch (error) {
        console.error("\nERROR al guardar el catálogo:", error.message);
        console.error(`Copia de seguridad disponible: ${backup}`);
        process.exitCode = 1;
    }
} else {
    console.log("\nSimulación terminada: no se modificó el catálogo.");
    console.log("Revisá los resultados antes de ejecutar con --apply.");
}