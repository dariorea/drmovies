
import fs from "fs";
import path from "path";

// ======================================================
// CONFIGURACIÓN
// ======================================================

const INPUT_FILE =
    process.argv[2] ||
    path.resolve(
        process.cwd(),
        "data/series-m3u-structural-lista-16.json"
    );

const OUTPUT_FILE =
    process.argv[3] ||
    path.resolve(
        process.cwd(),
        "data/series-m3u-structural-lista-16-sin-anios.json"
    );

// ======================================================
// NORMALIZACIÓN
// ======================================================

function normalizeText(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

// ======================================================
// ELIMINAR AÑOS DE LOS TÍTULOS
// ======================================================

function removeYear(title) {
    if (typeof title !== "string") {
        return title;
    }

    return title
        // Elimina años entre paréntesis o corchetes,
        // incluso cuando después aparece S01 E01.
        .replace(/\s*[(\[](?:19|20)\d{2}[)\]]/g, "")

        // Elimina años al final sin paréntesis.
        .replace(/\s+(?:19|20)\d{2}\s*$/g, "")

        // Limpia espacios sobrantes.
        .replace(/\s{2,}/g, " ")
        .trim();
}

// ======================================================
// LIMPIAR UNA SERIE
// ======================================================

function cleanSeries(series) {
    let seriesModified = false;
    let episodesModified = 0;

    if (!series || typeof series !== "object") {
        return { seriesModified, episodesModified };
    }

    // --------------------------------------------------
    // NOMBRE DE LA SERIE
    // --------------------------------------------------

    if (typeof series.name === "string") {
        const cleanName = removeYear(series.name);

        if (cleanName !== series.name) {
            series.name = cleanName;
            seriesModified = true;
        }

        const normalizedName = normalizeText(series.name);

        if (series.normalizedName !== normalizedName) {
            series.normalizedName = normalizedName;
            seriesModified = true;
        }
    }

    // --------------------------------------------------
    // NOMBRES DE LOS EPISODIOS
    // --------------------------------------------------

    if (series.seasons && typeof series.seasons === "object") {
        for (const season of Object.values(series.seasons)) {
            if (!season || typeof season !== "object") {
                continue;
            }

            if (
                !season.episodes ||
                typeof season.episodes !== "object"
            ) {
                continue;
            }

            for (const episode of Object.values(season.episodes)) {
                if (!episode || typeof episode !== "object") {
                    continue;
                }

                if (typeof episode.name !== "string") {
                    continue;
                }

                const cleanEpisodeName = removeYear(episode.name);

                if (cleanEpisodeName !== episode.name) {
                    episode.name = cleanEpisodeName;
                    episodesModified++;
                    seriesModified = true;
                }
            }
        }
    }

    return { seriesModified, episodesModified };
}

// ======================================================
// PROCESAMIENTO PRINCIPAL
// ======================================================

function main() {
    console.log("\n======================================");
    console.log("       LIMPIEZA DE AÑOS");
    console.log("======================================\n");

    if (!fs.existsSync(INPUT_FILE)) {
        console.error("ERROR: No existe el archivo:", INPUT_FILE);
        process.exit(1);
    }

    if (path.resolve(INPUT_FILE) === path.resolve(OUTPUT_FILE)) {
        console.error("ERROR: Entrada y salida no pueden ser iguales.");
        process.exit(1);
    }

    console.log("Entrada:", INPUT_FILE);
    console.log("Salida:", OUTPUT_FILE);

    const data = JSON.parse(
        fs.readFileSync(INPUT_FILE, "utf8")
    );

    // IMPORTANTE:
    // La lista 16 guarda las series dentro de data.series.
    // También admite archivos que tengan las series directamente
    // en el objeto principal.

    const seriesCollection =
        data.series &&
        typeof data.series === "object"
            ? data.series
            : data;

    let totalSeries = 0;
    let modifiedSeries = 0;
    let modifiedEpisodes = 0;

    for (const [key, series] of Object.entries(seriesCollection)) {
        if (!series || typeof series !== "object") {
            continue;
        }

        // Evitar procesar propiedades que no sean series.
        if (!series.name && !series.seasons) {
            continue;
        }

        totalSeries++;

        const result = cleanSeries(series);

        if (result.seriesModified) {
            modifiedSeries++;
        }

        modifiedEpisodes += result.episodesModified;
    }

    // Crear directorio si no existe.
    fs.mkdirSync(path.dirname(OUTPUT_FILE), {
        recursive: true
    });

    // Guardar sin modificar el original.
    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    console.log("\n======================================");
    console.log("          LIMPIEZA COMPLETADA");
    console.log("======================================");
    console.log("Series procesadas:", totalSeries);
    console.log("Series modificadas:", modifiedSeries);
    console.log("Episodios modificados:", modifiedEpisodes);
    console.log("--------------------------------------");
    console.log("Archivo original: SIN MODIFICAR");
    console.log("Nuevo archivo:", OUTPUT_FILE);
    console.log("======================================\n");
}

main();
