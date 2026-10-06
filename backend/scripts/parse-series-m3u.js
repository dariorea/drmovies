import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const M3U_URL = process.env.IPTV_M3U_URL;

const OUTPUT_FILE = "./data/series-parsed.json";

if (!M3U_URL) {
    console.error("❌ Falta IPTV_M3U_URL en .env");
    process.exit(1);
}

async function main() {

    console.log("📥 Descargando lista M3U...");

    const response = await fetch(M3U_URL);

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} - ${response.statusText}`
        );
    }

    const content = await response.text();

    console.log(
        `📦 Lista descargada: ${content.length.toLocaleString()} caracteres`
    );

    const lines = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const series = {};

    let totalEpisodes = 0;
    let ignored = 0;

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i];

        if (!line.startsWith("#EXTINF")) {
            continue;
        }

        const url = lines[i + 1];

        if (!url || !url.startsWith("http")) {
            continue;
        }

        // Solo contenido de series
        if (!url.includes("/series/")) {
            continue;
        }

        // -------------------------
        // Datos del EXTINF
        // -------------------------

        const tvgName =
            line.match(/tvg-name="([^"]+)"/)?.[1] || "";

        const tvgLogo =
            line.match(/tvg-logo="([^"]+)"/)?.[1] || "";

        const groupTitle =
            line.match(/group-title="([^"]+)"/)?.[1] || "";

        // -------------------------
        // Detectar S01 E01
        // -------------------------

        const episodeMatch = tvgName.match(
            /^(.*?)\s+S(\d+)\s+E(\d+)$/i
        );

        if (!episodeMatch) {
            ignored++;
            continue;
        }

        const name = episodeMatch[1].trim();

        const season = Number(episodeMatch[2]);
        const episode = Number(episodeMatch[3]);

        // -------------------------
        // Crear serie
        // -------------------------

        if (!series[name]) {

            series[name] = {
                name,
                logo: tvgLogo,
                groupTitle,
                seasons: {}
            };
        }

        // -------------------------
        // Crear temporada
        // -------------------------

        if (!series[name].seasons[season]) {

            series[name].seasons[season] = {
                season,
                episodes: {}
            };
        }

        // -------------------------
        // Guardar episodio
        // -------------------------

        series[name].seasons[season].episodes[episode] = {

            episode,

            name: tvgName,

            streamUrl: url
        };

        totalEpisodes++;
    }

    // -------------------------
    // Guardar JSON
    // -------------------------

    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(series, null, 4),
        "utf8"
    );

    // -------------------------
    // Resumen
    // -------------------------

    console.log("");
    console.log("================================");
    console.log("📺 PARSER DE SERIES");
    console.log("================================");
    console.log("");

    for (const serie of Object.values(series)) {

        console.log(`📺 ${serie.name}`);

        for (const season of Object.values(serie.seasons)) {

            const episodes =
                Object.keys(season.episodes).length;

            console.log(
                `   S${String(season.season).padStart(2, "0")} → ${episodes} episodios`
            );
        }
    }

    console.log("");
    console.log("--------------------------------");
    console.log(`📺 Series: ${Object.keys(series).length}`);
    console.log(`🎬 Episodios: ${totalEpisodes}`);
    console.log(`⚠️ Ignorados: ${ignored}`);
    console.log("--------------------------------");
    console.log("");
    console.log(`💾 ${OUTPUT_FILE}`);
}

main().catch(error => {

    console.error("");
    console.error("❌ Error:", error.message);

    process.exit(1);
});