import express from "express";
import axios from "axios";

import { getMovieStream } from "../services/stream.service.js";
const router = express.Router();



router.get(
    "/streams/:tmdbId",
    async (req, res) => {
        try {
            const { tmdbId } = req.params;

            const movie =
                await getMovieStream(tmdbId);

            if (!movie) {
                return res.status(404).json({
                    message:
                        "No se encontró un stream para esta película"
                });
            }

            const streamUrl = movie.streamUrl;

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
                response.headers["content-length"];

            if (contentLength) {
                res.setHeader(
                    "Content-Length",
                    contentLength
                );
            }

            const contentRange =
                response.headers["content-range"];

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