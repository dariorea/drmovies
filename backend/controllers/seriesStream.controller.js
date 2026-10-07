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


        const streams =
            await loadStreams();


        const series =
            streams[String(id)];


        if (!series) {
            return res.status(404).json({
                error:
                    "No existe esa serie en el catálogo de streams",
                tmdbId: Number(id)
            });
        }


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


        const sources =
            Array.isArray(
                selectedEpisode.sources
            )
                ? selectedEpisode.sources
                : [];


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


        return res.json({

            tmdbId:
                Number(id),

            seriesName:
                series.name,

            season,

            episode,

            episodeName:
                selectedEpisode.name,

            streamUrl:
                sources[0].url,

            source:
                sources[0].source,

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


// ======================================================
// PROXY DEL VIDEO
// GET /series/:id/proxy?season=1&episode=1
// ======================================================

export async function proxySeriesStream(req, res) {

    try {

        const { id } = req.params;

        const season =
            Number(req.query.season);

        const episode =
            Number(req.query.episode);


        // =========================================
        // VALIDACIONES
        // =========================================

        if (
            !id ||
            !Number.isInteger(season) ||
            season < 1 ||
            !Number.isInteger(episode) ||
            episode < 1
        ) {

            return res.status(400).json({
                error: "Parámetros inválidos"
            });
        }


        // =========================================
        // CARGAR CATÁLOGO
        // =========================================

        const streams =
            await loadStreams();


        const series =
            streams[String(id)];


        if (!series) {

            return res.status(404).json({
                error: "Serie no encontrada"
            });
        }


        // =========================================
        // TEMPORADA
        // =========================================

        const selectedSeason =
            series.seasons?.[
                String(season)
            ];


        if (!selectedSeason) {

            return res.status(404).json({
                error: "Temporada no encontrada"
            });
        }


        // =========================================
        // EPISODIO
        // =========================================

        const selectedEpisode =
            selectedSeason.episodes?.[
                String(episode)
            ];


        if (!selectedEpisode) {

            return res.status(404).json({
                error: "Episodio no encontrado"
            });
        }


        // =========================================
        // FUENTES
        // =========================================

        const sources =
            Array.isArray(
                selectedEpisode.sources
            )
                ? selectedEpisode.sources
                : [];


        const streamUrl =
            sources[0]?.url ||
            selectedEpisode.streamUrl;


        if (!streamUrl) {

            return res.status(404).json({
                error: "No hay stream disponible"
            });
        }


        console.log(
            `📺 Proxy S${season} E${episode}:`,
            streamUrl
        );


        // =========================================
        // HEADERS
        // =========================================

        const headers = {};

        if (req.headers.range) {

            headers.Range =
                req.headers.range;

            console.log(
                "➡️ Range:",
                req.headers.range
            );
        }


        // =========================================
        // REQUEST AL STREAM ORIGINAL
        // =========================================

        const response =
            await fetch(
                streamUrl,
                {
                    headers
                }
            );


        console.log(
            `⬅️ Stream original: HTTP ${response.status}`
        );


        if (!response.ok) {

            return res.status(
                response.status
            ).json({
                error:
                    `El servidor del video respondió ${response.status}`
            });
        }


        // =========================================
        // COPIAR HEADERS IMPORTANTES
        // =========================================

        const contentType =
            response.headers.get(
                "content-type"
            );

        const contentLength =
            response.headers.get(
                "content-length"
            );

        const contentRange =
            response.headers.get(
                "content-range"
            );

        const acceptRanges =
            response.headers.get(
                "accept-ranges"
            );


        if (contentType) {

            res.setHeader(
                "Content-Type",
                contentType
            );
        }


        if (contentLength) {

            res.setHeader(
                "Content-Length",
                contentLength
            );
        }


        if (contentRange) {

            res.setHeader(
                "Content-Range",
                contentRange
            );
        }


        res.setHeader(
            "Accept-Ranges",
            acceptRanges || "bytes"
        );


        // =========================================
        // STATUS
        // =========================================

        res.status(
            response.status
        );


        // =========================================
        // STREAM
        // =========================================

        if (!response.body) {

            return res.end();
        }


        const { Readable } =
            await import("stream");


        Readable
            .fromWeb(response.body)
            .pipe(res);


    } catch (error) {

        console.error(
            "❌ Error en proxy de serie:",
            error
        );


        if (!res.headersSent) {

            return res.status(500).json({
                error:
                    "Error haciendo proxy del video"
            });
        }


        res.destroy(error);
    }
}