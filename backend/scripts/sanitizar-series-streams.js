
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve(
    "data/series-streams-combined.json"
);

const APPLY = process.argv.includes("--apply");

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

    // Xtream Codes: /series/usuario/contraseña/archivo
    //              /movie/usuario/contraseña/archivo
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

    const userPart = decodeSegment(segments[resourceIndex + 1]);
    const passwordPart = decodeSegment(segments[resourceIndex + 2]);

    const userIsPlaceholder = /^\{(?:user|username)\}$/i.test(userPart);
    const passwordIsPlaceholder = /^\{password\}$/i.test(passwordPart);

    if (userIsPlaceholder && passwordIsPlaceholder) {
        // Normalizar los marcadores al formato codificado que usa el backend.
        segments[resourceIndex + 1] = "%7Buser%7D";
        segments[resourceIndex + 2] = "%7Bpassword%7D";
    } else {
        // Sustituir los segmentos de credenciales, sin tocar host ni archivo.
        segments[resourceIndex + 1] = "%7Buser%7D";
        segments[resourceIndex + 2] = "%7Bpassword%7D";
    }

    parsed.pathname = segments.join("/");

    return {
        url: parsed.href,
        changed: parsed.href !== rawUrl,
        ok: true
    };
}

const catalog = JSON.parse(fs.readFileSync(FILE, "utf8"));

let episodesVisited = 0;
let sourceUrlsChanged = 0;
let streamUrlsChanged = 0;
let unrecognizedUrls = 0;
let legacyEpisodes = 0;

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

            let firstSourceSanitized = null;

            for (const source of sources) {
                if (!source?.url) continue;

                const result = sanitizeUrl(source.url);

                if (!result.ok) {
                    unrecognizedUrls++;
                    console.warn(
                        `⚠️ URL no reconocida: ${tmdbId}, ` +
                        `T${seasonNumber}E${episodeNumber}, ` +
                        `${source.source || "fuente sin identificar"}`
                    );
                    continue;
                }

                if (result.changed) {
                    sourceUrlsChanged++;

                    if (APPLY) {
                        source.url = result.url;
                    }
                }

                if (!firstSourceSanitized && result.ok) {
                    firstSourceSanitized = result.url;
                }
            }

            // streamUrl es la fuente principal redundante.
            // Sincronizarla con la primera fuente evita conservar otra URL.
            if (firstSourceSanitized) {
                if (episode.streamUrl !== firstSourceSanitized) {
                    streamUrlsChanged++;

                    if (APPLY) {
                        episode.streamUrl = firstSourceSanitized;
                    }
                }
            } else if (episode.streamUrl && sources.length === 0) {
                legacyEpisodes++;

                const result = sanitizeUrl(episode.streamUrl);

                if (result.ok) {
                    if (result.changed) {
                        streamUrlsChanged++;

                        if (APPLY) {
                            episode.streamUrl = result.url;
                        }
                    }
                } else {
                    unrecognizedUrls++;
                    console.warn(
                        `⚠️ Episodio antiguo sin fuente identificable: ` +
                        `${tmdbId}, T${seasonNumber}E${episodeNumber}`
                    );
                }
            }
        }
    }
}

console.log("\n======================================");
console.log(" AUDITORÍA DE SANITIZACIÓN DE SERIES");
console.log("======================================");
console.log(`Modo: ${APPLY ? "APLICAR CAMBIOS" : "SIMULACIÓN"}`);
console.log(`Episodios revisados: ${episodesVisited}`);
console.log(`URLs de fuentes para cambiar: ${sourceUrlsChanged}`);
console.log(`URLs principales para sincronizar: ${streamUrlsChanged}`);
console.log(`URLs no reconocidas: ${unrecognizedUrls}`);
console.log(`Episodios antiguos sin sources: ${legacyEpisodes}`);

if (APPLY) {
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const backup = `${FILE}.backup-${timestamp}`;

    fs.copyFileSync(FILE, backup);
    fs.writeFileSync(
        FILE,
        JSON.stringify(catalog, null, 2) + "\n",
        "utf8"
    );

    console.log(`\n✅ Catálogo actualizado.`);
    console.log(`🛟 Copia de seguridad: ${backup}`);
} else {
    console.log("\nSimulación terminada: el catálogo no fue modificado.");
    console.log("Revisá los avisos antes de ejecutar con --apply.");
}
