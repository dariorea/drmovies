import express from "express";
import axios from "axios";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREAMS_FILE = path.join(
    __dirname,
    "../data/movie-streams.json"
);

async function getStreamUrl(tmdbId) {
    const content = await fs.readFile(
        STREAMS_FILE,
        "utf8"
    );

    const streams = JSON.parse(content);

    const movie = streams[String(tmdbId)];

    if (!movie) {
        return null;
    }

    const user = process.env.IPTV_USER;
    const password = process.env.IPTV_PASSWORD;

    if (!user || !password) {
        throw new Error(
            "Faltan IPTV_USER o IPTV_PASSWORD en .env"
        );
    }

    return movie.streamUrl
        .replace("{user}", user)
        .replace("{password}", password);
}

router.get("/test", (req, res) => {
    res.json({
        message: "Stream routes funcionando"
    });
});

router.get(
    "/streams/:tmdbId",
    async (req, res) => {
        try {
            const { tmdbId } = req.params;

            const streamUrl =
                await getStreamUrl(tmdbId);

            if (!streamUrl) {
                return res.status(404).json({
                    message:
                        "No se encontró un stream para esta película"
                });
            }

            console.log(
                `🎬 Stream encontrado para TMDB ${tmdbId}`
            );

            const range = req.headers.range;

            const headers = {};

            if (range) {
                headers.Range = range;
            }

            const response = await axios.get(
                streamUrl,
                {
                    headers,
                    responseType: "stream",
                    validateStatus: status =>
                        status >= 200 &&
                        status < 400
                }
            );

            console.log(
                `📡 Proveedor respondió: ${response.status}`
            );

            res.status(
                response.status === 206
                    ? 206
                    : 200
            );

            const contentType =
                response.headers["content-type"];

            if (contentType) {
                res.setHeader(
                    "Content-Type",
                    contentType
                );
            }

            const contentLength =
                response.headers[
                    "content-length"
                ];

            if (contentLength) {
                res.setHeader(
                    "Content-Length",
                    contentLength
                );
            }

            const contentRange =
                response.headers[
                    "content-range"
                ];

            if (contentRange) {
                res.setHeader(
                    "Content-Range",
                    contentRange
                );
            }

            res.setHeader(
                "Accept-Ranges",
                "bytes"
            );

            response.data.pipe(res);

            req.on("close", () => {
                response.data.destroy();
            });

        } catch (error) {
            console.error(
                "❌ Error en proxy:",
                error.response?.status ??
                    error.message
            );

            if (!res.headersSent) {
                res.status(500).json({
                    message:
                        "Error obteniendo el video"
                });
            }
        }
    }
);

export default router;