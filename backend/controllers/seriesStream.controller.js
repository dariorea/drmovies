
import fs from "fs/promises";
import path from "path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

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
// RESOLVER CREDENCIALES IPTV
// Ejemplo: lista-6 → IPTV_USER_6 / IPTV_PASSWORD_6
// ======================================================


function resolveIptvCredentials(streamUrl, source) {
    const match = String(source || "").match(/^lista-(\d+)$/i);

    if (!match) {
        throw new Error("La fuente no tiene un identificador lista-N válido");
    }

    const suffix = match[1];
    const username = process.env[`IPTV_USER_${suffix}`];
    const password = process.env[`IPTV_PASSWORD_${suffix}`];

    if (!username || !password) {
        throw new Error(
            `Faltan IPTV_USER_${suffix} o IPTV_PASSWORD_${suffix} en el .env`
        );
    }

    let template = String(streamUrl || "")
        .replace(/%7B(user|username|password)%7D/gi, "{$1}");

    const hasUser = /\{(?:user|username)\}/i.test(template);
    const hasPassword = /\{password\}/i.test(template);

    // Nunca usar una URL que pueda contener credenciales guardadas.
    if (!hasUser || !hasPassword) {
        throw new Error(
            `La URL de ${source} no está sanitizada o no contiene los marcadores necesarios`
        );
    }

    template = template
        .replace(/\{(?:user|username)\}/gi, () =>
            encodeURIComponent(username)
        )
        .replace(/\{password\}/gi, () =>
            encodeURIComponent(password)
        );

    const parsedUrl = new URL(template);
    console.log("🔎 Diagnóstico de URL resuelta:", {
        host: parsedUrl.hostname,
        rutaCorrecta: /^\/series\/[^/]+\/[^/]+\/[^/]+$/i.test(parsedUrl.pathname),
        contieneMarcadores: /\{(?:user|username|password)\}/i.test(
            decodeURIComponent(parsedUrl.pathname)
        ),
        usuarioPresente: Boolean(parsedUrl.pathname.split("/")[2]),
        passwordPresente: Boolean(parsedUrl.pathname.split("/")[3])
    });

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Protocolo de stream no permitido");
    }

    if (parsedUrl.username || parsedUrl.password) {
        throw new Error("No se permiten credenciales en la autoridad de la URL");
    }

    return parsedUrl.href;
}



// ======================================================
// GET /series/:id/stream?season=1&episode=1
// ======================================================

export async function getSeriesStream(req, res) {
    try {
        const { id } = req.params;
        const season = Number(req.query.season);
        const episode = Number(req.query.episode);

        if (!id) {
            return res.status(400).json({
                error: "Falta el TMDB ID"
            });
        }

        if (!Number.isInteger(season) || season < 1) {
            return res.status(400).json({
                error: "Temporada inválida"
            });
        }

        if (!Number.isInteger(episode) || episode < 1) {
            return res.status(400).json({
                error: "Episodio inválido"
            });
        }

        const streams = await loadStreams();
        const series = streams[String(id)];

        if (!series) {
            return res.status(404).json({
                error: "No existe esa serie en el catálogo de streams",
                tmdbId: Number(id)
            });
        }

        const selectedSeason = series.seasons?.[String(season)];

        if (!selectedSeason) {
            return res.status(404).json({
                error: "La temporada no tiene streams",
                tmdbId: Number(id),
                season
            });
        }

        const selectedEpisode =
            selectedSeason.episodes?.[String(episode)];

        if (!selectedEpisode) {
            return res.status(404).json({
                error: "El episodio no tiene streams",
                tmdbId: Number(id),
                season,
                episode
            });
        }

        const sources = Array.isArray(selectedEpisode.sources)
            ? selectedEpisode.sources.filter(item => item?.url)
            : [];

        // Compatibilidad con episodios del catálogo antiguo.
        if (sources.length === 0 && selectedEpisode.streamUrl) {
            sources.push({
                source: "unknown",
                url: selectedEpisode.streamUrl
            });
        }

        if (sources.length === 0) {
            return res.status(404).json({
                error: "El episodio no tiene ninguna fuente disponible",
                tmdbId: Number(id),
                season,
                episode
            });
        }

        // Conservamos las URL originales en el catálogo/API.
        // Las credenciales se resuelven en el proxy del video.
        
res.setHeader("Cache-Control", "no-store");

return res.json({
    tmdbId: Number(id),
    seriesName: series.name,
    season,
    episode,
    episodeName: selectedEpisode.name,
    source: sources[0].source,
    sources: sources.map(item => ({
        source: item.source
    }))
});


    } catch (error) {
        console.error(
            "❌ Error obteniendo stream de serie:",
            error.message
        );

        return res.status(500).json({
            error: "Error interno del servidor"
        });
    }
}


// ======================================================
// PROXY DEL VIDEO
// GET /series/:id/proxy?season=1&episode=1&sourceIndex=0
// ======================================================

export async function proxySeriesStream(req, res) {
    let upstreamResponse = null;
    let abortController = null;

    const abortUpstream = () => {
        // No abortar una respuesta que ya terminó correctamente.
        if (!res.writableEnded && abortController) {
            abortController.abort();
        }
    };

    try {
        const { id } = req.params;
        const season = Number(req.query.season);
        const episode = Number(req.query.episode);
        const sourceIndex = Number(req.query.sourceIndex ?? 0);

        // =========================================
        // VALIDACIONES
        // =========================================

        if (
            !id ||
            !Number.isInteger(season) ||
            season < 1 ||
            !Number.isInteger(episode) ||
            episode < 1 ||
            !Number.isInteger(sourceIndex) ||
            sourceIndex < 0
        ) {
            return res.status(400).json({
                error: "Parámetros inválidos"
            });
        }

        // =========================================
        // CARGAR CATÁLOGO
        // =========================================

        const streams = await loadStreams();
        const series = streams[String(id)];

        if (!series) {
            return res.status(404).json({
                error: "Serie no encontrada"
            });
        }

        const selectedSeason = series.seasons?.[String(season)];

        if (!selectedSeason) {
            return res.status(404).json({
                error: "Temporada no encontrada"
            });
        }

        const selectedEpisode =
            selectedSeason.episodes?.[String(episode)];

        if (!selectedEpisode) {
            return res.status(404).json({
                error: "Episodio no encontrado"
            });
        }

        // =========================================
        // FUENTES
        // =========================================

        const sources = Array.isArray(selectedEpisode.sources)
            ? selectedEpisode.sources.filter(item => item?.url)
            : [];

        // Compatibilidad con episodios antiguos.
        if (sources.length === 0 && selectedEpisode.streamUrl) {
            sources.push({
                source: "legacy",
                url: selectedEpisode.streamUrl
            });
        }

        if (sources.length === 0) {
            return res.status(404).json({
                error: "No hay fuentes disponibles"
            });
        }

        if (sourceIndex >= sources.length) {
            return res.status(404).json({
                error: "No quedan más fuentes",
                sourceIndex,
                totalSources: sources.length
            });
        }

        const selectedSource = sources[sourceIndex];

        // =========================================
        // RESOLVER URL Y CREDENCIALES
        // =========================================

        let streamUrl;

        try {
            streamUrl = resolveIptvCredentials(
                selectedSource.url,
                selectedSource.source
            );
        } catch (error) {
            console.warn(
                `⚠️ No se pudo preparar la fuente ${
                    selectedSource.source || sourceIndex + 1
                }: ${error.message}`
            );

            return res.status(502).json({
                error: "No se pudieron resolver las credenciales de la fuente",
                sourceIndex
            });
        }

        // No imprimir la URL completa: puede contener credenciales.
        let hostname = "host desconocido";

        try {
            hostname = new URL(streamUrl).hostname;
        } catch {
            // La URL ya se valida en resolveIptvCredentials
            // cuando necesita resolver marcadores.
        }

        console.log(
            `📺 Proxy S${season} E${episode} | ` +
            `Fuente ${sourceIndex + 1}/${sources.length} ` +
            `(${selectedSource.source || "sin nombre"}) | ${hostname}`
        );

        // =========================================
        // SOLICITUD AL STREAM ORIGINAL
        // =========================================

        const headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*"
        };
        
        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        abortController = new AbortController();

        req.on("aborted", abortUpstream);
        res.on("close", abortUpstream);

        upstreamResponse = await fetch(streamUrl, {
            headers,
            signal: abortController.signal,
            redirect: "follow"
        });
        console.log("🔎 Diagnóstico de respuesta upstream:", {
            status: upstreamResponse.status,
            redirected: upstreamResponse.redirected,
            finalHost: upstreamResponse.url
                ? new URL(upstreamResponse.url).hostname
                : "(desconocido)",
            contentType: upstreamResponse.headers.get("content-type")
        });

        console.log(
            `⬅️ Fuente ${sourceIndex + 1}: HTTP ${upstreamResponse.status}`
        );

        // 206 (Partial Content) también es una respuesta correcta.
        if (!upstreamResponse.ok) {
            await upstreamResponse.body?.cancel().catch(() => {});

            if (!res.headersSent && !res.destroyed) {
                return res.status(502).json({
                    error: `La fuente respondió HTTP ${upstreamResponse.status}`,
                    sourceIndex,
                    upstreamStatus: upstreamResponse.status
                });
            }

            return;
        }

        // =========================================
        // HEADERS DEL VIDEO
        // =========================================

        const headersToCopy = [
            ["Content-Type", "content-type"],
            ["Content-Length", "content-length"],
            ["Content-Range", "content-range"],
            ["Accept-Ranges", "accept-ranges"]
        ];

        for (const [outHeader, inHeader] of headersToCopy) {
            const value = upstreamResponse.headers.get(inHeader);

            if (value) {
                res.setHeader(outHeader, value);
            }
        }

        res.status(upstreamResponse.status);

        if (!upstreamResponse.body) {
            return res.end();
        }

        // =========================================
        // TRANSMITIR VIDEO AL CLIENTE
        // =========================================

        const videoStream = Readable.fromWeb(upstreamResponse.body);

        videoStream.on("error", error => {
            console.error(
                "❌ Error leyendo el stream:",
                error.message
            );
        });

        // Esperamos a que termine la transmisión antes de limpiar
        // los listeners. Así no se quitan mientras el video sigue activo.
        await pipeline(videoStream, res);

    } catch (error) {
        if (
            error.name === "AbortError" ||
            req.aborted ||
            res.destroyed
        ) {
            return;
        }

        console.error(
            "❌ Error en proxy de serie:",
            error.message
        );

        if (!res.headersSent && !res.destroyed) {
            return res.status(502).json({
                error: "No se pudo conectar con la fuente"
            });
        }

        if (!res.destroyed) {
            res.destroy(error);
        }

    } finally {
        req.off("aborted", abortUpstream);
        res.off("close", abortUpstream);
    }
}