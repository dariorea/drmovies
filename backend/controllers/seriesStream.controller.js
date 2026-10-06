import fs from "fs/promises";
import path from "path";

const STREAMS_FILE = path.resolve(
    "./data/series-streams-combined.json"
);

let streamsCache = null;


// ======================================================
// CARGAR CATÁLOGO
// ======================================================

async function loadStreams() {
    if (streamsCache) {
        return streamsCache;
    }

    const content = await fs.readFile(
        STREAMS_FILE,
        "utf8"
    );

    streamsCache = JSON.parse(content);

    console.log(
        `📺 Catálogo de series cargado: ${
            Object.keys(streamsCache).length
        } TMDB IDs`
    );

    return streamsCache;
}


// ======================================================
// GET /series/:id/stream?season=1&episode=1
// ======================================================

export async function getSeriesStream(req, res) {

    try {

        const { id } = req.params;

        const season =
            Number(req.query.season);

        const episode =
            Number(req.query.episode);


        // =========================================
        // Validaciones
        // =========================================

        if (!id) {

            return res.status(400).json({
                error: "Falta el TMDB ID"
            });
        }


        if (
            !Number.isInteger(season) ||
            season < 1
        ) {

            return res.status(400).json({
                error: "Temporada inválida"
            });
        }


        if (
            !Number.isInteger(episode) ||
            episode < 1
        ) {

            return res.status(400).json({
                error: "Episodio inválido"
            });
        }


        // =========================================
        // Cargar catálogo combinado
        // =========================================

        const streams =
            await loadStreams();


        // =========================================
        // Buscar serie por TMDB ID
        // =========================================

        const series =
            streams[String(id)];


        if (!series) {

            return res.status(404).json({
                error:
                    "No existe esa serie en el catálogo de streams",
                tmdbId: Number(id)
            });
        }


        // =========================================
        // Buscar temporada
        // =========================================

        const selectedSeason =
            series.seasons?.[
                String(season)
            ];


        if (!selectedSeason) {

            return res.status(404).json({
                error:
                    "La temporada no tiene streams",
                tmdbId: Number(id),
                season
            });
        }


        // =========================================
        // Buscar episodio
        // =========================================

        const selectedEpisode =
            selectedSeason.episodes?.[
                String(episode)
            ];


        if (!selectedEpisode) {

            return res.status(404).json({
                error:
                    "El episodio no tiene streams",
                tmdbId: Number(id),
                season,
                episode
            });
        }


        // =========================================
        // Fuentes
        // =========================================

        const sources =
            Array.isArray(
                selectedEpisode.sources
            )
                ? selectedEpisode.sources
                : [];


        /*
         * Compatibilidad por si algún registro
         * solamente tiene streamUrl.
         */

        if (
            !sources.length &&
            selectedEpisode.streamUrl
        ) {

            sources.push({
                source: "unknown",
                url: selectedEpisode.streamUrl
            });
        }


        if (!sources.length) {

            return res.status(404).json({
                error:
                    "El episodio no tiene ninguna fuente disponible",
                tmdbId: Number(id),
                season,
                episode
            });
        }


  // =========================================
// RESPUESTA
// =========================================

return res.json({

    tmdbId:
        Number(id),

    seriesName:
        series.name,

    season,

    episode,

    episodeName:
        selectedEpisode.name,

    // Primera fuente como fuente inicial
    streamUrl:
        sources[0].url,

    source:
        sources[0].source,

    // Todas las fuentes disponibles
    sources:
        sources.map(item => ({
            source:
                item.source,

            url:
                item.url
        }))
});


    } catch (error) {

        console.error(
            "❌ Error obteniendo stream de serie:",
            error
        );

        return res.status(500).json({
            error:
                "Error interno del servidor"
        });
    }
}