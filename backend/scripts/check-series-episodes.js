import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FILE = path.join(
    __dirname,
    "../data/series-streams-combined.json"
)

const tmdbId = process.argv[2]

if (!tmdbId) {
    console.error("❌ Tenés que indicar un tmdbId")
    console.error("Ejemplo:")
    console.error("node scripts/checkSeriesEpisodes.js 81983")
    process.exit(1)
}

const data = JSON.parse(
    await fs.readFile(FILE, "utf8")
)

const series = data[String(tmdbId)]

if (!series) {
    console.error(`❌ No se encontró ninguna serie con TMDB ID ${tmdbId}`)
    process.exit(1)
}

console.log("")
console.log("=================================")
console.log(`📺 ${series.name}`)
console.log("=================================")
console.log("")
console.log(`TMDB ID: ${series.tmdbId}`)
console.log("")

const seasons = Object.entries(series.seasons ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))

let totalEpisodes = 0
let totalSources = 0

if (seasons.length === 0) {
    console.log("⚠️ La serie no tiene temporadas")
    process.exit(0)
}

for (const [seasonNumber, season] of seasons) {

    const episodes = Object.entries(season.episodes ?? {})
        .sort(([a], [b]) => Number(a) - Number(b))

    const episodeNumbers = episodes.map(
        ([episodeNumber]) => Number(episodeNumber)
    )

    totalEpisodes += episodes.length

    for (const [, episode] of episodes) {
        totalSources += Array.isArray(episode.sources)
            ? episode.sources.length
            : 0
    }

    console.log(
        `Temporada ${seasonNumber}: ${episodes.length} episodios`
    )

    if (episodeNumbers.length > 0) {

        const episodeSet = new Set(episodeNumbers)

        const maxEpisode = Math.max(...episodeNumbers)

        const missingEpisodes = []

        for (let i = 1; i <= maxEpisode; i++) {
            if (!episodeSet.has(i)) {
                missingEpisodes.push(i)
            }
        }

        if (missingEpisodes.length > 0) {
            console.log(
                `  ⚠️ Faltan: ${missingEpisodes
                    .map(ep => `E${String(ep).padStart(2, "0")}`)
                    .join(", ")}`
            )
        } else {
            console.log("  ✅ Sin huecos en la numeración")
        }
    }

    console.log("")
}

console.log("---------------------------------")
console.log(`TOTAL: ${totalEpisodes} episodios`)
console.log(`FUENTES: ${totalSources}`)
console.log("---------------------------------")
console.log("")