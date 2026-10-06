import fs from "fs/promises";
import dotenv from "dotenv"

dotenv.config()

const M3U_URL =
    process.env.IPTV_M3U_URL_2;

const OUTPUT =
    "./data/series-parsed-extra.json";

function parseExtinf(line) {
    const tvgName =
        line.match(/tvg-name="([^"]*)"/)?.[1] || "";

    const tvgLogo =
        line.match(/tvg-logo="([^"]*)"/)?.[1] || "";

    const groupTitle =
        line.match(/group-title="([^"]*)"/)?.[1] || "";

    const commaIndex =
        line.indexOf(",");

    const displayName =
        commaIndex !== -1
            ? line
                .slice(commaIndex + 1)
                .trim()
            : "";

    return {
        tvgName,
        tvgLogo,
        groupTitle,
        displayName
    };
}

function parseEpisodeName(name) {
    /*
     * Acepta:
     *
     * Serie S01 E01
     * Serie S1 E1
     *
     * También tolera espacios.
     */

    const match =
        name.match(
            /^(.*?)\s+S(\d+)\s*E(\d+)$/i
        );

    if (!match) {
        return null;
    }

    return {
        seriesName: match[1].trim(),
        season: Number(match[2]),
        episode: Number(match[3])
    };
}

async function main() {

    if (!M3U_URL) {
        throw new Error(
            "Falta IPTV_M3U_URL_2 en .env"
        );
    }

    console.log(
        "🚀 PARSEANDO LISTA 2"
    );

    console.log(
        `📡 ${M3U_URL.replace(
            /username=[^&]+/,
            "username=***"
        ).replace(
            /password=[^&]+/,
            "password=***"
        )}`
    );

    const response =
        await fetch(M3U_URL);

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}`
        );
    }

    const m3u =
        await response.text();

    console.log(
        `📦 Tamaño: ${m3u.length.toLocaleString()} caracteres`
    );

    const lines =
        m3u.split(/\r?\n/);

    const series = {};

    let entries = 0;
    let seriesEntries = 0;
    let episodes = 0;
    let ignored = 0;

    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line =
            lines[i].trim();

        if (!line.startsWith("#EXTINF")) {
            continue;
        }

        entries++;

        const url =
            lines[i + 1]?.trim();

        if (!url) {
            ignored++;
            continue;
        }

        /*
         * Solo series.
         */

        if (
            !url.toLowerCase().includes(
                "/series/"
            )
        ) {
            continue;
        }

        seriesEntries++;

        const meta =
            parseExtinf(line);

        /*
         * Usamos primero tvg-name.
         */

        const rawName =
            meta.tvgName ||
            meta.displayName;

        const parsed =
            parseEpisodeName(rawName);

        if (!parsed) {
            ignored++;
            continue;
        }

        const {
            seriesName,
            season,
            episode
        } = parsed;

        if (!series[seriesName]) {

            series[seriesName] = {
                name: seriesName,

                logo:
                    meta.tvgLogo,

                groupTitle:
                    meta.groupTitle,

                seasons: {}
            };
        }

        if (
            !series[
                seriesName
            ].seasons[
                season
            ]
        ) {

            series[
                seriesName
            ].seasons[
                season
            ] = {

                season,

                episodes: {}
            };
        }

        /*
         * Si el proveedor tiene duplicado
         * un episodio, conservamos el primero.
         */

        if (
            !series[
                seriesName
            ].seasons[
                season
            ].episodes[
                episode
            ]
        ) {

            series[
                seriesName
            ].seasons[
                season
            ].episodes[
                episode
            ] = {

                episode,

                name: rawName,

                streamUrl: url
            };

            episodes++;
        }
    }

    await fs.writeFile(
        OUTPUT,
        JSON.stringify(
            series,
            null,
            2
        ),
        "utf8"
    );

    const seriesCount =
        Object.keys(series).length;

    let totalEpisodes = 0;

    for (
        const serie of Object.values(series)
    ) {

        for (
            const season
            of Object.values(
                serie.seasons
            )
        ) {

            totalEpisodes +=
                Object.keys(
                    season.episodes
                ).length;
        }
    }

    console.log(
        "\n======================================"
    );

    console.log(
        "✅ LISTA 2 PARSEADA"
    );

    console.log(
        "======================================"
    );

    console.log(
        `📄 Entradas EXTINF: ${entries}`
    );

    console.log(
        `📺 Entradas de series: ${seriesEntries}`
    );

    console.log(
        `📚 Series: ${seriesCount}`
    );

    console.log(
        `🎬 Episodios únicos: ${totalEpisodes}`
    );

    console.log(
        `⚠️ Ignorados: ${ignored}`
    );

    console.log(
        `\n📄 ${OUTPUT}`
    );
}

main().catch(error => {

    console.error(
        "\n❌ ERROR:"
    );

    console.error(
        error.message
    );

    process.exit(1);
});