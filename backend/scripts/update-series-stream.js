import fs from "fs";

const [, , seriesName, tmdbId] = process.argv;

if (!seriesName || !tmdbId) {
    console.error(
        "Uso: node scripts/update-series-stream.js \"Nombre de serie\" TMDB_ID"
    );
    process.exit(1);
}

const MAIN_PARSED = "./data/series-parsed.json";
const EXTRA_PARSED = "./data/series-parsed-extra.json";
const COMBINED = "./data/series-streams-combined.json";

function loadJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

const mainParsed = loadJson(MAIN_PARSED);
const extraParsed = loadJson(EXTRA_PARSED);
const combined = loadJson(COMBINED);

const mainSeries = mainParsed[seriesName];
const extraSeries = extraParsed[seriesName];

if (!mainSeries && !extraSeries) {
    console.error(`❌ No se encontró "${seriesName}" en ninguna lista.`);
    process.exit(1);
}

const existingSeries = combined[String(tmdbId)];

if (!existingSeries) {
    console.error(
        `❌ El TMDB ID ${tmdbId} no existe actualmente en el catálogo combinado.`
    );
    process.exit(1);
}

function getEpisodes(series) {
    const result = [];

    if (!series?.seasons) {
        return result;
    }

    for (const season of Object.values(series.seasons)) {
        for (const episode of Object.values(season.episodes || {})) {
            result.push({
                season: Number(season.season),
                episode: Number(episode.episode),
                name: episode.name,
                streamUrl: episode.streamUrl
            });
        }
    }

    return result;
}

function addSource(episode, source, url) {
    if (!url) return;

    if (!Array.isArray(episode.sources)) {
        episode.sources = [];

        if (episode.streamUrl) {
            episode.sources.push({
                source: "existing",
                url: episode.streamUrl
            });
        }
    }

    const exists = episode.sources.some(
        item => item.url === url
    );

    if (!exists) {
        episode.sources.push({
            source,
            url
        });
    }
}

function findEpisode(series, season, episode) {
    return series?.seasons?.[String(season)]
        ?.episodes?.[String(episode)];
}

let addedEpisodes = 0;
let addedSources = 0;

const lists = [
    {
        name: "lista-1",
        series: mainSeries
    },
    {
        name: "lista-2",
        series: extraSeries
    }
];

for (const list of lists) {
    const episodes = getEpisodes(list.series);

    for (const item of episodes) {
        let season = existingSeries.seasons?.[String(item.season)];

        if (!season) {
            season = {
                season: item.season,
                episodes: {}
            };

            existingSeries.seasons[String(item.season)] = season;

            console.log(
                `➕ Nueva temporada: T${item.season}`
            );
        }

        let episode = season.episodes?.[String(item.episode)];

        if (!episode) {
            episode = {
                episode: item.episode,
                name: item.name,
                streamUrl: item.streamUrl,
                sources: [
                    {
                        source: list.name,
                        url: item.streamUrl
                    }
                ]
            };

            season.episodes[String(item.episode)] = episode;

            addedEpisodes++;

            console.log(
                `➕ ${list.name}: T${item.season} E${item.episode}`
            );

            continue;
        }

        const before = episode.sources?.length || 0;

        addSource(
            episode,
            list.name,
            item.streamUrl
        );

        const after = episode.sources?.length || 0;

        if (after > before) {
            addedSources++;

            console.log(
                `🔗 ${list.name}: T${item.season} E${item.episode}`
            );
        }
    }
}

existingSeries.tmdbId = Number(tmdbId);
existingSeries.name =
    existingSeries.name ||
    mainSeries?.name ||
    extraSeries?.name ||
    seriesName;

combined[String(tmdbId)] = existingSeries;

fs.writeFileSync(
    COMBINED,
    JSON.stringify(combined, null, 2)
);

console.log("");
console.log("================================");
console.log(`📺 Serie: ${seriesName}`);
console.log(`🎬 TMDB: ${tmdbId}`);
console.log(`➕ Episodios nuevos: ${addedEpisodes}`);
console.log(`🔗 Fuentes nuevas: ${addedSources}`);
console.log("================================");
console.log("✅ Catálogo actualizado");