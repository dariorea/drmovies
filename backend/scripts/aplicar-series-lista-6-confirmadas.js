
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";

const DATA_DIR = path.resolve("data");

const CATALOG_FILE = path.join(
    DATA_DIR,
    "series-streams-combined.json"
);

const CHECKPOINT_FILE = path.join(
    DATA_DIR,
    "series-streams-combined.import-checkpoint-lista-6.json"
);

const JSONL_FILE = path.join(
    DATA_DIR,
    "series-import-results-lista-6.jsonl"
);

const RESULTS_FILE = path.join(
    DATA_DIR,
    "series-import-results-lista-6-complete.json"
);

const SIMULATION_FILE = path.join(
    DATA_DIR,
    "series-import-results-lista-6-simulation.json"
);

const BACKUP_FILE = path.join(
    DATA_DIR,
    "series-streams-combined.lista-6-before-apply.json"
);

const SOURCE_NAME = "lista-6";
const APPLY = process.argv.includes("--apply");

const IPTV_URL =
    process.env.IPTV_M3U_URL_6 ||
    process.env.IPTV_URL_6;

const IPTV_USER = process.env.IPTV_USER_6 || "";
const IPTV_PASSWORD = process.env.IPTV_PASSWORD_6 || "";


// ============================================================
// UTILIDADES
// ============================================================

function normalize(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/&/g, " y ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}


function getAttribute(line, attribute) {
    const escaped = attribute.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );

    const match = line.match(
        new RegExp(
            `(?:^|\\s)${escaped}="([^"]*)"`,
            "i"
        )
    );

    return match?.[1]?.trim() || "";
}


function validTmdbId(value) {
    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0
        ? id
        : null;
}


function uniqueBy(items, getKey) {
    const seen = new Set();
    const output = [];

    for (const item of items) {
        const key = getKey(item);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        output.push(item);
    }

    return output;
}


// ============================================================
// PARSEAR NOMBRE DEL EPISODIO
// ============================================================

function parseEpisodeName(name) {
    const value = String(name || "").trim();

    const patterns = [
        /^(.*?)\s+S(\d{1,3})\s*E(?:P)?\s*(\d{1,4})(?=$|[\s._-])/i,
        /^(.*?)\s+(\d{1,3})x(\d{1,4})(?=$|[\s._-])/i,
        /^(.*?)\s+Temporada\s*(\d{1,3})\s*(?:Cap[ií]tulo|Episodio|Episódio)\s*(\d{1,4})(?=$|[\s._-])/i
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);

        if (!match) {
            continue;
        }

        const seriesName = match[1]
            .trim()
            .replace(/[|:–—-]+$/, "")
            .trim();

        const season = Number(match[2]);
        const episode = Number(match[3]);

        if (
            seriesName.length < 2 ||
            !Number.isInteger(season) ||
            !Number.isInteger(episode) ||
            season < 1 ||
            episode < 1
        ) {
            continue;
        }

        return {
            seriesName,
            season,
            episode
        };
    }

    return null;
}


// ============================================================
// CONSTRUIR URL M3U
// ============================================================

function buildM3UUrl() {
    if (!IPTV_URL) {
        throw new Error(
            "Falta IPTV_M3U_URL_6 o IPTV_URL_6 en .env"
        );
    }

    const url = IPTV_URL
        .replaceAll("{username}", IPTV_USER)
        .replaceAll("{password}", IPTV_PASSWORD);

    const parsed = new URL(url);

    if (IPTV_USER && IPTV_PASSWORD) {
        if (!parsed.searchParams.has("username")) {
            parsed.searchParams.set("username", IPTV_USER);
        }

        if (!parsed.searchParams.has("password")) {
            parsed.searchParams.set("password", IPTV_PASSWORD);
        }

        if (!parsed.searchParams.has("type")) {
            parsed.searchParams.set("type", "m3u_plus");
        }

        if (!parsed.searchParams.has("output")) {
            parsed.searchParams.set("output", "m3u8");
        }
    }

    return parsed.toString();
}


// ============================================================
// DESCARGAR M3U
// ============================================================

async function downloadM3U() {
    const url = buildM3UUrl();

    console.log("Descargando nuevamente la M3U de lista-6...");

    const response = await axios.get(url, {
        timeout: 180000,
        responseType: "text",
        maxContentLength: 1024 * 1024 * 1024
    });

    if (
        typeof response.data !== "string" ||
        !response.data.includes("#EXTINF")
    ) {
        throw new Error(
            "La respuesta descargada no parece una M3U válida."
        );
    }

    return response.data;
}


// ============================================================
// PARSEAR M3U
// ============================================================

function parseM3U(content) {
    const lines = content.split(/\r?\n/);
    const episodes = [];

    let extinf = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) continue;

        if (line.startsWith("#EXTINF:")) {
            extinf = line;
            continue;
        }

        if (line.startsWith("#")) continue;
        if (!extinf) continue;

        const comma = extinf.indexOf(",");

        const displayName = comma >= 0
            ? extinf.slice(comma + 1).trim()
            : "";

        const name =
            getAttribute(extinf, "tvg-name") ||
            displayName;

        const parsed = parseEpisodeName(name);

        if (parsed) {
            episodes.push({
                ...parsed,
                name,
                url: line,
                tvgId: getAttribute(extinf, "tvg-id"),
                tvgLogo: getAttribute(extinf, "tvg-logo"),
                groupTitle: getAttribute(extinf, "group-title")
            });
        }

        extinf = null;
    }

    return episodes;
}


// ============================================================
// AGRUPAR EPISODIOS POR NOMBRE DE SERIE
// ============================================================

function groupEpisodes(episodes) {
    const groups = new Map();

    for (const episode of episodes) {
        const key = normalize(episode.seriesName);

        if (!key) continue;

        if (!groups.has(key)) {
            groups.set(key, {
                name: episode.seriesName,
                episodes: []
            });
        }

        groups.get(key).episodes.push(episode);
    }

    return groups;
}


// ============================================================
// LEER MATCH_CONFIRMED
// ============================================================

async function loadConfirmedResults() {
    const confirmed = new Map();

    function addResult(result, origin) {
        if (result.classification !== "MATCH_CONFIRMED") {
            return;
        }

        const tmdbId = validTmdbId(
            result.bestMatch?.tmdbId
        );

        if (!tmdbId) {
            return;
        }

        const key = normalize(result.seriesName);

        if (!key) return;

        // El JSONL se procesa después del checkpoint y prevalece.
        confirmed.set(key, {
            seriesName: result.seriesName,
            tmdbId,
            result,
            origin
        });
    }

    try {
        const checkpoint = JSON.parse(
            await fs.readFile(CHECKPOINT_FILE, "utf8")
        );

        for (const result of checkpoint.results || []) {
            addResult(result, "checkpoint");
        }
    } catch (error) {
        console.log(
            `Aviso al leer checkpoint: ${error.message}`
        );
    }

    try {
        const content = await fs.readFile(JSONL_FILE, "utf8");

        for (const line of content.split(/\r?\n/).filter(Boolean)) {
            try {
                addResult(JSON.parse(line), "jsonl");
            } catch {
                // Ignorar líneas JSONL inválidas.
            }
        }
    } catch (error) {
        console.log(`Aviso al leer JSONL: ${error.message}`);
    }

    return confirmed;
}


// ============================================================
// CREAR ESTRUCTURA DE SERIE
// ============================================================

function createSeries(tmdbId, result) {
    const best = result.bestMatch || {};

    return {
        tmdbId,
        name: best.name || result.seriesName,
        originalName:
            best.originalName ||
            best.name ||
            result.seriesName,
        posterPath: best.posterPath || null,
        overview: "",
        backdropPath: null,
        firstAirDate: best.firstAirDate || null,
        originCountry: best.originCountry || [],
        seasons: {}
    };
}


// ============================================================
// AGREGAR FUENTE A UN EPISODIO
// ============================================================

function addEpisode(series, episode) {
    const seasonKey = String(episode.season);
    const episodeKey = String(episode.episode);

    series.seasons ??= {};

    series.seasons[seasonKey] ??= {
        season: episode.season,
        episodes: {}
    };

    const season = series.seasons[seasonKey];
    season.episodes ??= {};

    season.episodes[episodeKey] ??= {
        episode: episode.episode,
        name: episode.name,
        streamUrl: episode.url,
        sources: []
    };

    const target = season.episodes[episodeKey];
    target.sources ??= [];

    // Evitar duplicados exactos de esta fuente y URL.
    const exists = target.sources.some(source =>
        source.source === SOURCE_NAME &&
        source.url === episode.url
    );

    if (exists) {
        return false;
    }

    target.sources.push({
        source: SOURCE_NAME,
        url: episode.url
    });

    // No reemplazar nunca el stream principal existente.
    target.streamUrl ??= episode.url;

    return true;
}


// ============================================================
// CONTAR EPISODIOS ÚNICOS
// ============================================================

function countUniqueEpisodes(episodes) {
    return new Set(
        episodes.map(episode =>
            `${episode.season}:${episode.episode}`
        )
    ).size;
}


// ============================================================
// PROCESAR POR ID TMDB
// ============================================================

async function main() {
    console.log("====================================================");
    console.log(" IMPORTADOR LISTA 6 — AGRUPADO POR ID TMDB");
    console.log("====================================================");

    console.log(
        `Modo: ${APPLY ? "APLICAR CAMBIOS" : "SIMULACIÓN"}`
    );

    console.log(
        "La simulación no modifica el catálogo original."
    );

    // 1. Leer coincidencias confirmadas.
    const confirmedByName = await loadConfirmedResults();

    console.log(
        `Coincidencias confirmadas por nombre: ${confirmedByName.size}`
    );

    // 2. Agrupar las coincidencias por ID de TMDB.
    const confirmedById = new Map();

    for (const item of confirmedByName.values()) {
        const id = String(item.tmdbId);

        if (!confirmedById.has(id)) {
            confirmedById.set(id, {
                tmdbId: item.tmdbId,
                entries: []
            });
        }

        confirmedById.get(id).entries.push(item);
    }

    const duplicateIds = [...confirmedById.values()]
        .filter(group => group.entries.length > 1)
        .map(group => ({
            tmdbId: group.tmdbId,
            names: group.entries.map(entry => entry.seriesName)
        }));

    console.log(
        `IDs TMDB únicos: ${confirmedById.size}`
    );

    console.log(
        `IDs con varios nombres confirmados: ${duplicateIds.length}`
    );

    if (duplicateIds.length) {
        console.log(
            "Nombres agrupados por ID:",
            JSON.stringify(duplicateIds, null, 2)
        );
    }

    // 3. Descargar y analizar la M3U.
    const m3u = await downloadM3U();
    const episodes = parseM3U(m3u);

    console.log(
        `Episodios detectados en M3U: ${episodes.length}`
    );

    if (!episodes.length) {
        throw new Error(
            "No se encontraron episodios en la M3U."
        );
    }

    const groups = groupEpisodes(episodes);

    console.log(
        `Nombres de series detectados en M3U: ${groups.size}`
    );

    // 4. Leer el catálogo.
    const catalog = JSON.parse(
        await fs.readFile(CATALOG_FILE, "utf8")
    );

    if (
        !catalog ||
        typeof catalog !== "object" ||
        Array.isArray(catalog)
    ) {
        throw new Error("El catálogo no tiene una estructura válida.");
    }

    // 5. Estadísticas.
    let newSeries = 0;
    let existingSeries = 0;
    let newSources = 0;
    let existingSources = 0;
    let missingSeries = 0;
    let unmatchedAliases = 0;

    const finalResults = [];

    // 6. Procesar cada ID una sola vez.
    let counter = 0;

    for (const groupById of confirmedById.values()) {
        counter++;

        const { tmdbId, entries } = groupById;
        const catalogKey = String(tmdbId);

        const names = uniqueBy(
            entries.map(entry => ({
                seriesName: entry.seriesName,
                key: normalize(entry.seriesName)
            })),
            entry => entry.key
        );

        console.log(
            `\n[${counter}/${confirmedById.size}] ` +
            `${names.map(item => item.seriesName).join(" / ")} ` +
            `→ TMDB ${tmdbId}`
        );

        // Reunir los episodios de todos los nombres asociados al ID.
        const matchedNames = [];
        const missingNames = [];
        const mergedEpisodes = [];

        for (const nameEntry of names) {
            const sourceGroup = groups.get(nameEntry.key);

            if (!sourceGroup) {
                missingNames.push(nameEntry.seriesName);
                continue;
            }

            matchedNames.push(nameEntry.seriesName);
            mergedEpisodes.push(...sourceGroup.episodes);
        }

        if (!matchedNames.length) {
            missingSeries++;

            finalResults.push({
                tmdbId,
                seriesNames: names.map(item => item.seriesName),
                status: "M3U_NOT_FOUND",
                episodes: 0,
                newSources: 0,
                existingSources: 0,
                missingNames
            });

            console.log("  No encontrada en la M3U actual.");
            continue;
        }

        // Evitar procesar repetidamente el mismo registro de episodio
        // cuando un mismo nombre se repite en los resultados.
        // No eliminar URLs distintas: pueden ser fuentes alternativas.
        const uniqueInputs = uniqueBy(
            mergedEpisodes,
            episode => [
                episode.season,
                episode.episode,
                episode.url
            ].join("|")
        );

        if (missingNames.length) {
            unmatchedAliases += missingNames.length;

            console.log(
                `  Aviso: nombres alternativos no encontrados: ` +
                missingNames.join(", ")
            );
        }

        let series = catalog[catalogKey];

        const wasExisting = Boolean(series);

        if (!series) {
            // Todos los registros de este ID apuntan al mismo ID TMDB.
            // Elegimos el primer resultado confirmado como metadatos.
            series = createSeries(tmdbId, entries[0].result);
            newSeries++;
        } else {
            existingSeries++;
            series.seasons ??= {};
        }

        let added = 0;
        let already = 0;

        for (const episode of uniqueInputs) {
            if (addEpisode(series, episode)) {
                added++;
            } else {
                already++;
            }
        }

        catalog[catalogKey] = series;

        newSources += added;
        existingSources += already;

        const uniqueEpisodeCount =
            countUniqueEpisodes(uniqueInputs);

        console.log(
            `  Episodios únicos: ${uniqueEpisodeCount}`
        );

        console.log(
            `  Fuentes nuevas: ${added}`
        );

        console.log(
            `  Fuentes ya existentes: ${already}`
        );

        finalResults.push({
            tmdbId,
            seriesNames: names.map(item => item.seriesName),
            matchedNames,
            missingNames,
            status: "READY",
            episodes: uniqueEpisodeCount,
            inputEntries: uniqueInputs.length,
            newSources: added,
            existingSources: already,
            wasExisting
        });
    }

    // 7. Construir informe.
    const report = {
        generatedAt: new Date().toISOString(),
        source: SOURCE_NAME,
        mode: APPLY ? "APPLY" : "SIMULATION",
        confirmedNames: confirmedByName.size,
        uniqueTmdbIds: confirmedById.size,
        duplicateIds,
        newSeries,
        existingSeries,
        newSources,
        existingSources,
        missingSeries,
        unmatchedAliases,
        results: finalResults
    };

    // 8. Resumen antes de escribir archivos.
    console.log("\n====================================================");
    console.log(" RESUMEN");
    console.log("====================================================");

    console.log(`Nombres confirmados: ${confirmedByName.size}`);
    console.log(`IDs TMDB únicos: ${confirmedById.size}`);
    console.log(`IDs con varios nombres: ${duplicateIds.length}`);
    console.log(`Series nuevas: ${newSeries}`);
    console.log(`Series existentes: ${existingSeries}`);
    console.log(`Episodios/fuentes nuevas: ${newSources}`);
    console.log(`Fuentes ya existentes: ${existingSources}`);
    console.log(`Series no encontradas: ${missingSeries}`);
    console.log(`Nombres alternativos no encontrados: ${unmatchedAliases}`);

    // 9. Simulación: solo escribir un informe independiente.
    if (!APPLY) {
        await fs.writeFile(
            SIMULATION_FILE,
            JSON.stringify(report, null, 2),
            "utf8"
        );

        console.log(
            `\nInforme de simulación: ${SIMULATION_FILE}`
        );

        console.log(
            "SIMULACIÓN FINALIZADA: el catálogo NO fue modificado."
        );

        console.log(
            "Revisá los IDs duplicados y las estadísticas antes de aplicar."
        );

        return;
    }

    // 10. Protección: no sobrescribir un backup anterior.
    try {
        await fs.access(BACKUP_FILE);

        throw new Error(
            `Ya existe el backup ${BACKUP_FILE}. ` +
            "No se sobrescribió. Revisalo antes de continuar."
        );
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    // 11. Crear backup antes de modificar el catálogo.
    console.log("\nCreando backup del catálogo...");

    await fs.copyFile(CATALOG_FILE, BACKUP_FILE);

    console.log(`Backup creado: ${BACKUP_FILE}`);

    // 12. Escribir en archivo temporal y reemplazar el catálogo.
    const temporary = `${CATALOG_FILE}.tmp`;

    try {
        await fs.writeFile(
            temporary,
            JSON.stringify(catalog, null, 2),
            "utf8"
        );

        await fs.rename(temporary, CATALOG_FILE);
    } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
    }

    // El informe definitivo solo se escribe en modo --apply.
    await fs.writeFile(
        RESULTS_FILE,
        JSON.stringify(report, null, 2),
        "utf8"
    );

    console.log("\n====================================================");
    console.log(" APLICACIÓN FINALIZADA");
    console.log("====================================================");
    console.log(`Series nuevas: ${newSeries}`);
    console.log(`Series existentes: ${existingSeries}`);
    console.log(`Fuentes nuevas: ${newSources}`);
    console.log(`Fuentes ya existentes: ${existingSources}`);
    console.log(`Backup: ${BACKUP_FILE}`);
    console.log(`Catálogo: ${CATALOG_FILE}`);
    console.log(`Informe definitivo: ${RESULTS_FILE}`);
}

main().catch(error => {
    console.error("\nERROR:");
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
