import express from "express";
import axios from "axios";
import { Readable } from "stream";

import { getMovieStream } from "../services/stream.service.js";

const router = express.Router();

const selectedStreamsCache = new Map();

// Tamaño de cada bloque que pedimos al proveedor.
// 10 MB es un buen punto de partida.
const CHUNK_SIZE = 10 * 1024 * 1024;

// Cantidad máxima de veces que intentamos recuperar un bloque.
const MAX_RETRIES = 5;

// ---------------------------------------------------------
// Obtiene el tamaño total del archivo a partir de Content-Range
// ---------------------------------------------------------
function parseContentRange(contentRange) {
    if (!contentRange) {
        return null;
    }

    const match = contentRange.match(
        /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i
    );

    if (!match) {
        return null;
    }

    return {
        start: Number(match[1]),
        end: Number(match[2]),
        total: match[3] === "*" ? null : Number(match[3]),
    };
}

// ---------------------------------------------------------
// Hace una petición Range al proveedor
// ---------------------------------------------------------
async function fetchChunk(url, start, end) {
    const response = await fetch(url, {
        method: "GET",

        headers: {
            Range: `bytes=${start}-${end}`,
        },

        redirect: "follow",
    });

    if (!response.ok && response.status !== 206) {
        throw new Error(
            `Proveedor respondió HTTP ${response.status}`
        );
    }

    if (!response.body) {
        throw new Error("El proveedor no devolvió body");
    }

    return response;
}

// ---------------------------------------------------------
// GET /api/streams/:tmdbId
// ---------------------------------------------------------
router.get("/streams/:tmdbId", async (req, res) => {

    const startedAt = Date.now();

    try {

        const { tmdbId } = req.params;

        // -------------------------------------------------
        // Obtener película
        // -------------------------------------------------

        const movie = await getMovieStream(tmdbId);

        if (!movie) {
            return res.status(404).json({
                error: "No se encontró stream para esta película",
            });
        }

        // -------------------------------------------------
        // Buscar stream seleccionado anteriormente
        // -------------------------------------------------

        let selectedStream = selectedStreamsCache.get(
            String(tmdbId)
        );

        // -------------------------------------------------
        // Si no tenemos uno cacheado, buscamos uno válido
        // -------------------------------------------------

        if (!selectedStream) {

            console.log(
                `🔎 Buscando stream para TMDB ${tmdbId}`
            );

            for (const candidate of movie.candidates) {

                try {

                    const testResponse = await axios.get(
                        candidate.streamUrl,
                        {
                            headers: {
                                Range: "bytes=0-1",
                            },

                            responseType: "stream",

                            timeout: 10000,

                            validateStatus: status =>
                                status >= 200 &&
                                status < 400,
                        }
                    );

                    testResponse.data.destroy();

                    selectedStream = candidate;

                    selectedStreamsCache.set(
                        String(tmdbId),
                        selectedStream
                    );

                    console.log(
                        `✅ Stream seleccionado: ${candidate.streamUrl}`
                    );

                    break;

                } catch (error) {

                    console.log(
                        `❌ Stream inválido: ${candidate.streamUrl}`
                    );

                    console.log(
                        "   Motivo:",
                        error.message
                    );
                }
            }
        }

        // -------------------------------------------------
        // No encontramos ningún stream
        // -------------------------------------------------

        if (!selectedStream) {

            return res.status(502).json({
                error: "No hay streams disponibles",
            });
        }

        const upstreamUrl = selectedStream.streamUrl;

        console.log("");
        console.log("======================================");
        console.log("🎬 MOVIE STREAM");
        console.log("TMDB:", tmdbId);
        console.log("URL:", upstreamUrl);
        console.log("======================================");

        // -------------------------------------------------
        // Analizar Range enviado por el navegador
        // -------------------------------------------------

        const browserRange = req.headers.range;

        let requestedStart = 0;
        let requestedEnd = null;

        if (browserRange) {

            const match = browserRange.match(
                /bytes=(\d+)-(\d*)/
            );

            if (!match) {

                return res.status(416).json({
                    error: "Range inválido",
                });
            }

            requestedStart = Number(match[1]);

            if (match[2]) {
                requestedEnd = Number(match[2]);
            }
        }

        console.log(
            "📥 Browser Range:",
            browserRange || "sin Range"
        );

        // -------------------------------------------------
        // Primera petición para conocer el tamaño
        //
        // IMPORTANTE:
        // Esta respuesta también será utilizada como el
        // primer bloque real. Así evitamos descargar
        // nuevamente los mismos 10 MB.
        // -------------------------------------------------

        const firstEnd =
            requestedEnd !== null
                ? Math.min(
                    requestedEnd,
                    requestedStart + CHUNK_SIZE - 1
                )
                : requestedStart + CHUNK_SIZE - 1;

        let firstResponse;

        try {

            firstResponse = await fetchChunk(
                upstreamUrl,
                requestedStart,
                firstEnd
            );

        } catch (error) {

            console.error(
                "❌ Error obteniendo primer bloque:",
                error.message
            );

            return res.status(502).json({
                error: "El proveedor no pudo entregar el video",
            });
        }

        // -------------------------------------------------
        // Obtener Content-Range
        // -------------------------------------------------

        const contentRange =
            firstResponse.headers.get("content-range");

        const rangeInfo =
            parseContentRange(contentRange);

        if (!rangeInfo || !rangeInfo.total) {

            console.error(
                "❌ No pudimos determinar tamaño del video",
                contentRange
            );

            // Cerramos el body si no podemos continuar.
            if (firstResponse.body) {
                await firstResponse.body.cancel().catch(() => {});
            }

            return res.status(502).json({
                error: "El proveedor no informó correctamente el tamaño",
            });
        }

        const totalSize = rangeInfo.total;

        // -------------------------------------------------
        // Determinar hasta dónde debe recibir el navegador
        // -------------------------------------------------

        const finalEnd =
            requestedEnd !== null
                ? Math.min(
                    requestedEnd,
                    totalSize - 1
                )
                : totalSize - 1;

        const responseLength =
            finalEnd - requestedStart + 1;

        // -------------------------------------------------
        // Headers para el navegador
        // -------------------------------------------------

        res.status(206);

        res.setHeader(
            "Content-Type",
            firstResponse.headers.get("content-type") ||
            "video/mp4"
        );

        res.setHeader(
            "Content-Length",
            responseLength
        );

        res.setHeader(
            "Content-Range",
            `bytes ${requestedStart}-${finalEnd}/${totalSize}`
        );

        res.setHeader(
            "Accept-Ranges",
            "bytes"
        );

        console.log(
            "📦 Video:",
            `${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`
        );

        console.log(
            "📤 Enviando:",
            `${requestedStart} → ${finalEnd}`
        );

        // -------------------------------------------------
        // Estado de conexión
        // -------------------------------------------------

        let clientDisconnected = false;

        req.on("aborted", () => {

            clientDisconnected = true;

            console.log(
                "🛑 Cliente abortó la petición"
            );
        });

        res.on("close", () => {

            if (!res.writableFinished) {

                clientDisconnected = true;

                console.log(
                    "🛑 Cliente cerró la conexión"
                );
            }
        });

        // -------------------------------------------------
        // IMPORTANTE:
        //
        // Guardamos firstResponse para utilizarla como el
        // primer bloque.
        //
        // Antes hacíamos:
        //
        //   fetch firstResponse
        //   ↓
        //   averiguar tamaño
        //   ↓
        //   volver a pedir el mismo Range
        //
        // Ahora:
        //
        //   fetch firstResponse
        //   ↓
        //   averiguar tamaño
        //   ↓
        //   usar esa misma respuesta
        // -------------------------------------------------

        let pendingResponse = firstResponse;

        // -------------------------------------------------
        // Enviar bloques al navegador
        // -------------------------------------------------

        let currentPosition = requestedStart;

        while (
            currentPosition <= finalEnd &&
            !clientDisconnected
        ) {

            const chunkEnd = Math.min(
                currentPosition + CHUNK_SIZE - 1,
                finalEnd
            );

            let success = false;

            // ---------------------------------------------
            // Reintentar el bloque si el proveedor lo corta
            // ---------------------------------------------

            for (
                let attempt = 1;
                attempt <= MAX_RETRIES;
                attempt++
            ) {

                if (clientDisconnected) {
                    break;
                }

                console.log(
                    `📦 Bloque ${currentPosition}-${chunkEnd} ` +
                    `(intento ${attempt}/${MAX_RETRIES})`
                );

                let upstreamResponse;

                try {

                    // -------------------------------------
                    // Primer bloque:
                    // reutilizamos firstResponse.
                    //
                    // Bloques siguientes:
                    // hacemos una nueva petición Range.
                    // -------------------------------------

                    if (pendingResponse) {

                        upstreamResponse =
                            pendingResponse;

                        pendingResponse = null;

                        console.log(
                            "♻️ Reutilizando primera respuesta"
                        );

                    } else {

                        upstreamResponse =
                            await fetchChunk(
                                upstreamUrl,
                                currentPosition,
                                chunkEnd
                            );
                    }

                } catch (error) {

                    console.error(
                        `❌ Error bloque ${currentPosition}-${chunkEnd}:`,
                        error.message
                    );

                    if (attempt === MAX_RETRIES) {
                        throw error;
                    }

                    continue;
                }

                const upstreamStream =
                    Readable.fromWeb(
                        upstreamResponse.body
                    );

                let received = 0;

                try {

                    for await (
                        const chunk of upstreamStream
                    ) {

                        if (clientDisconnected) {
                            break;
                        }

                        const buffer =
                            Buffer.isBuffer(chunk)
                                ? chunk
                                : Buffer.from(chunk);

                        received += buffer.length;

                        const canWrite =
                            res.write(buffer);

                        if (!canWrite) {

                            await new Promise(
                                resolve =>
                                    res.once(
                                        "drain",
                                        resolve
                                    )
                            );
                        }
                    }

                } catch (error) {

                    console.error(
                        `⚠️ Bloque interrumpido`,
                        {
                            start: currentPosition,
                            end: chunkEnd,
                            received,
                            expected:
                                chunkEnd -
                                currentPosition +
                                1,
                            error: error.message,
                        }
                    );
                }

                // -----------------------------------------
                // ¿Llegó completo?
                // -----------------------------------------

                if (
                    received ===
                    chunkEnd - currentPosition + 1
                ) {

                    success = true;

                    currentPosition =
                        chunkEnd + 1;

                    console.log(
                        `✅ Bloque completo ` +
                        `${currentPosition}/${finalEnd + 1}`
                    );

                    break;
                }

                // -----------------------------------------
                // El proveedor cortó la conexión
                // -----------------------------------------

                currentPosition += received;

                console.log(
                    `🔄 Proveedor cortó bloque. ` +
                    `Continuamos desde byte ${currentPosition}`
                );
            }

            // ---------------------------------------------
            // No pudimos completar el bloque
            // ---------------------------------------------

            if (!success) {

                if (clientDisconnected) {
                    break;
                }

                throw new Error(
                    `No se pudo completar el bloque`
                );
            }
        }

        // -------------------------------------------------
        // Terminamos
        // -------------------------------------------------

        if (!clientDisconnected) {

            res.end();

            console.log(
                "✅ Video enviado completamente",
                `${Date.now() - startedAt} ms`
            );
        }

    } catch (error) {

        console.error("");
        console.error(
            "🔥 ERROR MOVIE STREAM"
        );

        console.error(
            "Mensaje:",
            error.message
        );

        console.error(
            "Duración:",
            `${Date.now() - startedAt} ms`
        );

        if (!res.headersSent) {

            return res.status(502).json({
                error: "Error obteniendo el video",
                details: error.message,
            });
        }

        if (!res.writableEnded) {
            res.end();
        }
    }
});

export default router;