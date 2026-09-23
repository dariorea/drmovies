import express from "express"
import axios from "axios"

import {
    getChannels,
    getChannelById
} from "../services/channels.service.js"

const router = express.Router()

const REQUEST_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",

    Accept:
        "application/vnd.apple.mpegurl, application/x-mpegURL, " +
        "application/octet-stream, */*",

    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",

    Connection: "keep-alive"
}


/*
 * URL HLS temporal de cada canal.
 *
 * channelId -> {
 *   url,
 *   expiresAt
 * }
 */
const streamSessions = new Map()


/*
 * Renovaciones que están ocurriendo actualmente.
 *
 * Evita que varias peticiones renueven
 * simultáneamente la misma sesión.
 *
 * channelId -> Promise<string>
 */
const streamRefreshes = new Map()


const SESSION_TTL = 60 * 1000
const MAX_REFRESH_RETRIES = 3
const RETRY_DELAY = 1000


// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

const sleep = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms))


const getFreshStreamUrl = async (
    channel,
    forceRefresh = false
) => {

    const cached =
        streamSessions.get(channel.id)


    /*
     * Utilizamos la sesión almacenada si todavía
     * es válida y no se solicitó una renovación forzada.
     */
    if (
        !forceRefresh &&
        cached &&
        cached.expiresAt > Date.now()
    ) {

        return cached.url
    }


    /*
     * Si ya existe una renovación para este canal,
     * reutilizamos esa Promise.
     */
    const currentRefresh =
        streamRefreshes.get(channel.id)


    if (currentRefresh) {

        console.log(
            "⏳ Esperando renovación HLS existente:",
            channel.name
        )

        return currentRefresh
    }


    /*
     * Creamos una única renovación.
     */
    const refreshPromise = (async () => {

        let lastError = null


        for (
            let attempt = 1;
            attempt <= MAX_REFRESH_RETRIES;
            attempt++
        ) {

            try {

                console.log(
                    `🔄 Renovando sesión HLS ` +
                    `(${attempt}/${MAX_REFRESH_RETRIES}):`,
                    channel.name
                )


                const response =
                    await axios.get(
                        channel.streamUrl,
                        {
                            responseType: "text",

                            timeout: 15000,

                            maxRedirects: 10,

                            headers: REQUEST_HEADERS,

                            validateStatus:
                                status =>
                                    status >= 200 &&
                                    status < 400
                        }
                    )


                /*
                 * Axios sigue los redirects.
                 *
                 * Obtenemos la URL final que devuelve
                 * el proveedor.
                 */
                const finalUrl =
                    response.request
                        ?.res
                        ?.responseUrl ||
                    channel.streamUrl


                const playlist =
                    typeof response.data === "string"
                        ? response.data
                        : ""


                /*
                 * Comprobamos que realmente sea
                 * un playlist HLS.
                 */
                if (
                    !playlist.includes("#EXTM3U")
                ) {

                    throw new Error(
                        "El proveedor no devolvió un playlist HLS válido"
                    )
                }


                /*
                 * Guardamos la URL temporal.
                 */
                streamSessions.set(
                    channel.id,
                    {
                        url: finalUrl,
                        expiresAt:
                            Date.now() +
                            SESSION_TTL
                    }
                )


                console.log(
                    "📡 URL HLS final obtenida"
                )


                return finalUrl

            } catch (error) {

                lastError = error

                const status =
                    error.response?.status


                console.error(
                    "❌ Error renovando HLS:",
                    status ||
                    error.message
                )


                /*
                 * Solo reintentamos automáticamente
                 * cuando el proveedor devuelve 403.
                 */
                if (status !== 403) {
                    throw error
                }


                /*
                 * Eliminamos la sesión anterior.
                 */
                streamSessions.delete(
                    channel.id
                )


                if (
                    attempt <
                    MAX_REFRESH_RETRIES
                ) {

                    console.log(
                        `⏳ Reintentando renovación ` +
                        `en ${RETRY_DELAY}ms...`
                    )

                    await sleep(
                        RETRY_DELAY
                    )
                }
            }
        }


        throw lastError

    })()


    streamRefreshes.set(
        channel.id,
        refreshPromise
    )


    try {

        return await refreshPromise

    } finally {

        /*
         * La renovación terminó.
         */
        streamRefreshes.delete(
            channel.id
        )
    }
}


const createProxyUrl = (
    channelId,
    resourceUrl
) => {

    const url =
        new URL(resourceUrl)


    const resourcePath =
        url.pathname +
        url.search


    return (
        `/api/channels/${channelId}/hls?path=` +
        encodeURIComponent(resourcePath)
    )
}


const rewriteHlsPlaylist = (
    playlist,
    channelId,
    playlistUrl
) => {

    const baseUrl =
        new URL(playlistUrl)


    return playlist
        .split("\n")
        .map(line => {

            const trimmed =
                line.trim()


            /*
             * URI dentro de tags HLS.
             *
             * Ejemplos:
             *
             * #EXT-X-KEY:URI="..."
             * #EXT-X-MAP:URI="..."
             */
            if (
                trimmed.startsWith("#")
            ) {

                return line.replace(
                    /URI="([^"]+)"/g,
                    (_match, uri) => {

                        try {

                            const absoluteUrl =
                                new URL(
                                    uri,
                                    baseUrl
                                )


                            return (
                                `URI="${createProxyUrl(
                                    channelId,
                                    absoluteUrl.href
                                )}"`
                            )

                        } catch {

                            return `URI="${uri}"`
                        }
                    }
                )
            }


            /*
             * Segmentos .ts o playlists secundarios.
             */
            if (trimmed) {

                try {

                    const absoluteUrl =
                        new URL(
                            trimmed,
                            baseUrl
                        )


                    return createProxyUrl(
                        channelId,
                        absoluteUrl.href
                    )

                } catch {

                    return line
                }
            }


            return line
        })
        .join("\n")
}


// -----------------------------------------------------
// GET /api/channels
// -----------------------------------------------------

router.get(
    "/channels",
    async (_req, res) => {

        try {

            const channels =
                await getChannels()


            /*
             * Nunca enviamos streamUrl
             * al frontend.
             */
            const publicChannels =
                channels.map(channel => ({
                    id: channel.id,
                    tvgId: channel.tvgId,
                    name: channel.name,
                    logo: channel.logo,
                    group: channel.group
                }))


            return res.json(
                publicChannels
            )

        } catch (error) {

            console.error(
                "❌ Error obteniendo canales:",
                error.message
            )

            return res
                .status(500)
                .json({
                    message:
                        "Error obteniendo canales"
                })
        }
    }
)


// -----------------------------------------------------
// GET /api/channels/:id
// -----------------------------------------------------

router.get(
    "/channels/:id",
    async (req, res) => {

        try {

            const channel =
                await getChannelById(
                    req.params.id
                )


            if (!channel) {

                return res
                    .status(404)
                    .json({
                        message:
                            "Canal no encontrado"
                    })
            }


            return res.json({
                id: channel.id,
                tvgId: channel.tvgId,
                name: channel.name,
                logo: channel.logo,
                group: channel.group
            })

        } catch (error) {

            console.error(
                "❌ Error obteniendo canal:",
                error.message
            )

            return res
                .status(500)
                .json({
                    message:
                        "Error obteniendo canal"
                })
        }
    }
)


// -----------------------------------------------------
// GET /api/channels/:id/stream
// -----------------------------------------------------

router.get(
    "/channels/:id/stream",
    async (req, res) => {

        let channel

        try {

            channel =
                await getChannelById(
                    req.params.id
                )


            if (!channel) {

                return res
                    .status(404)
                    .json({
                        message:
                            "Canal no encontrado"
                    })
            }


            console.log(
                "📺 Obteniendo HLS:",
                channel.name
            )


            let streamUrl


            /*
             * Primer intento utilizando la sesión
             * almacenada.
             */
            try {

                streamUrl =
                    await getFreshStreamUrl(
                        channel
                    )

            } catch (error) {

                /*
                 * Si la sesión expiró y el proveedor
                 * responde 403, forzamos renovación.
                 */
                if (
                    error.response?.status === 403
                ) {

                    console.log(
                        "🔄 Sesión HLS inválida. Renovando..."
                    )


                    streamSessions.delete(
                        channel.id
                    )


                    streamUrl =
                        await getFreshStreamUrl(
                            channel,
                            true
                        )

                } else {

                    throw error
                }
            }


            /*
             * Pedimos el playlist HLS real.
             */
            let response


            try {

                response =
                    await axios.get(
                        streamUrl,
                        {
                            responseType: "text",

                            timeout: 15000,

                            maxRedirects: 10,

                            headers:
                                REQUEST_HEADERS,

                            validateStatus:
                                status =>
                                    status >= 200 &&
                                    status < 400
                        }
                    )

            } catch (error) {

                /*
                 * La URL temporal pudo expirar
                 * entre ambas peticiones.
                 */
                if (
                    error.response?.status === 403
                ) {

                    console.log(
                        "🔄 Proveedor devolvió 403. " +
                        "Renovando sesión HLS..."
                    )


                    streamSessions.delete(
                        channel.id
                    )


                    streamUrl =
                        await getFreshStreamUrl(
                            channel,
                            true
                        )


                    response =
                        await axios.get(
                            streamUrl,
                            {
                                responseType: "text",

                                timeout: 15000,

                                maxRedirects: 10,

                                headers:
                                    REQUEST_HEADERS,

                                validateStatus:
                                    status =>
                                        status >= 200 &&
                                        status < 400
                            }
                        )

                } else {

                    throw error
                }
            }


            console.log(
                "📡 HLS respondió:",
                response.status
            )


            const finalUrl =
                response.request
                    ?.res
                    ?.responseUrl ||
                streamUrl


            const playlist =
                typeof response.data === "string"
                    ? response.data
                    : ""


            if (
                !playlist.includes("#EXTM3U")
            ) {

                throw new Error(
                    "La respuesta no contiene un playlist HLS válido"
                )
            }


            const rewrittenPlaylist =
                rewriteHlsPlaylist(
                    playlist,
                    channel.id,
                    finalUrl
                )


            res.setHeader(
                "Content-Type",
                "application/vnd.apple.mpegurl"
            )


            res.setHeader(
                "Cache-Control",
                "no-cache, no-store, must-revalidate"
            )


            res.setHeader(
                "Access-Control-Allow-Origin",
                "*"
            )


            return res.send(
                rewrittenPlaylist
            )

        } catch (error) {

            console.error(
                "❌ Error obteniendo stream HLS:",
                error.response?.status ||
                error.message
            )


            return res
                .status(500)
                .json({
                    message:
                        "Error obteniendo stream HLS"
                })
        }
    }
)


// -----------------------------------------------------
// GET /api/channels/:id/hls
// -----------------------------------------------------

router.get(
    "/channels/:id/hls",
    async (req, res) => {

        let channel

        try {

            channel =
                await getChannelById(
                    req.params.id
                )


            if (!channel) {

                return res
                    .status(404)
                    .json({
                        message:
                            "Canal no encontrado"
                    })
            }


            const resourcePath =
                req.query.path


            if (
                typeof resourcePath !== "string" ||
                !resourcePath
            ) {

                return res
                    .status(400)
                    .json({
                        message:
                            "Falta el parámetro path"
                    })
            }


            /*
             * El frontend solamente puede solicitar
             * recursos mediante rutas relativas.
             */
            if (
                resourcePath.startsWith("http://") ||
                resourcePath.startsWith("https://")
            ) {

                return res
                    .status(400)
                    .json({
                        message:
                            "URL no permitida"
                    })
            }


            let baseUrl =
                await getFreshStreamUrl(
                    channel
                )


            let targetUrl =
                new URL(
                    resourcePath,
                    baseUrl
                ).href


            console.log(
                "🎬 HLS resource:",
                resourcePath.substring(
                    0,
                    100
                ) + "..."
            )


            let response


            try {

                response =
                    await axios.get(
                        targetUrl,
                        {
                            responseType:
                                "arraybuffer",

                            timeout: 20000,

                            maxRedirects: 10,

                            headers:
                                REQUEST_HEADERS,

                            validateStatus:
                                status =>
                                    status >= 200 &&
                                    status < 400
                        }
                    )

            } catch (error) {

                /*
                 * Si el segmento/recurso expiró,
                 * renovamos la sesión.
                 */
                if (
                    error.response?.status === 403
                ) {

                    console.log(
                        "🔄 Recurso HLS expirado. " +
                        "Renovando sesión..."
                    )


                    streamSessions.delete(
                        channel.id
                    )


                    baseUrl =
                        await getFreshStreamUrl(
                            channel,
                            true
                        )


                    targetUrl =
                        new URL(
                            resourcePath,
                            baseUrl
                        ).href


                    response =
                        await axios.get(
                            targetUrl,
                            {
                                responseType:
                                    "arraybuffer",

                                timeout: 20000,

                                maxRedirects: 10,

                                headers:
                                    REQUEST_HEADERS,

                                validateStatus:
                                    status =>
                                        status >= 200 &&
                                        status < 400
                            }
                        )

                } else {

                    throw error
                }
            }


            const contentType =
                response.headers[
                    "content-type"
                ] || ""


            /*
             * Si el recurso es otro playlist HLS,
             * también reescribimos sus URLs.
             */
            if (
                contentType.includes(
                    "mpegurl"
                ) ||
                resourcePath
                    .toLowerCase()
                    .includes(".m3u8")
            ) {

                const playlist =
                    Buffer
                        .from(response.data)
                        .toString("utf8")


                const rewritten =
                    rewriteHlsPlaylist(
                        playlist,
                        channel.id,
                        targetUrl
                    )


                res.setHeader(
                    "Content-Type",
                    "application/vnd.apple.mpegurl"
                )


                res.setHeader(
                    "Cache-Control",
                    "no-cache, no-store, must-revalidate"
                )


                res.setHeader(
                    "Access-Control-Allow-Origin",
                    "*"
                )


                return res.send(
                    rewritten
                )
            }


            /*
             * Segmentos .ts, claves AES, etc.
             */
            res.setHeader(
                "Content-Type",
                contentType ||
                    "application/octet-stream"
            )


            if (
                response.headers[
                    "content-length"
                ]
            ) {

                res.setHeader(
                    "Content-Length",
                    response.headers[
                        "content-length"
                    ]
                )
            }


            if (
                response.headers[
                    "content-range"
                ]
            ) {

                res.setHeader(
                    "Content-Range",
                    response.headers[
                        "content-range"
                    ]
                )
            }


            if (
                response.headers[
                    "accept-ranges"
                ]
            ) {

                res.setHeader(
                    "Accept-Ranges",
                    response.headers[
                        "accept-ranges"
                    ]
                )
            }


            res.setHeader(
                "Access-Control-Allow-Origin",
                "*"
            )


            return res.send(
                Buffer.from(
                    response.data
                )
            )

        } catch (error) {

            console.error(
                "❌ Error recurso HLS:",
                {
                    status:
                        error.response?.status,

                    statusText:
                        error.response?.statusText,

                    message:
                        error.message
                }
            )


            if (
                !res.headersSent
            ) {

                return res
                    .status(500)
                    .json({
                        message:
                            "Error obteniendo recurso HLS"
                    })
            }
        }
    }
)


export default router