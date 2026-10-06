
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREAMS_FILE = path.join(
    __dirname,
    "../data/movie-streams-all.json"
);

function replaceCredentials(streamUrl, source) {
    const match = source?.match(/^lista-(\d+)$/);

    if (!match) {
        throw new Error(
            `Fuente de stream desconocida: ${source}`
        );
    }

    const listNumber = match[1];

    let user;
    let password;

    // Lista 1 mantiene compatibilidad con las variables antiguas
    if (listNumber === "1") {
        user =
            process.env.IPTV_USER_1 ||
            process.env.IPTV_USER;

        password =
            process.env.IPTV_PASSWORD_1 ||
            process.env.IPTV_PASSWORD;
    } else {
        user =
            process.env[`IPTV_USER_${listNumber}`];

        password =
            process.env[`IPTV_PASSWORD_${listNumber}`];
    }

    if (!user || !password) {
        throw new Error(
            `Faltan las credenciales para ${source}`
        );
    }

    // Reemplazamos los placeholders directamente
    // sobre el string original.
    //
    // Esto cubre tanto:
    // {user}
    // {password}
    //
    // como sus versiones URL-encoded:
    // %7Buser%7D
    // %7Bpassword%7D

    return streamUrl
        .replace(
            /\{user\}|%7Buser%7D/gi,
            user
        )
        .replace(
            /\{password\}|%7Bpassword%7D/gi,
            password
        );
}

function scoreStream(stream) {
    const probe = stream.probe;

    if (probe?.ok !== true) {
        return -1000;
    }

    const codec = probe.codec_name?.toLowerCase();
    const width = probe.width || 0;
    const height = probe.height || 0;

    if (codec === "h264") {
        let score = 10000;

        const pixels = width * height;

        if (height >= 900 || width >= 1600) {
            score += 3000;
        } else if (height >= 600 || width >= 1100) {
            score += 2000;
        } else {
            score += 1000;
        }

        score += Math.min(
            pixels / 1000,
            2500
        );

        return score;
    }

    if (codec === "hevc") {
        let score = 5000;

        const pixels = width * height;

        score += Math.min(
            pixels / 1000,
            2500
        );

        return score;
    }

    if (codec === "mpeg4") {
        let score = 3000;

        const pixels = width * height;

        score += Math.min(
            pixels / 1000,
            2000
        );

        return score;
    }

    return 1000;
}

function sortStreams(streams) {
    return streams
        .filter(
            stream =>
                stream.probe?.ok === true
        )
        .sort(
            (a, b) =>
                scoreStream(b) -
                scoreStream(a)
        );
}

export async function getMovieStream(tmdbId) {
    const content = await fs.readFile(
        STREAMS_FILE,
        "utf8"
    );

    const streams = JSON.parse(content);

    const movie = streams[String(tmdbId)];

    if (!movie) {
        return null;
    }

    const sortedStreams = sortStreams(
        movie.streams
    );

    if (sortedStreams.length === 0) {
        return null;
    }

    const candidates = sortedStreams.map(
        stream => ({
            ...stream,

            streamUrl: replaceCredentials(
                stream.streamUrl,
                stream.source
            )
        })
    );

    return {
        tmdbId: movie.tmdbId,
        title: movie.title,
        originalTitle: movie.originalTitle,
        year: movie.year,
        posterPath: movie.posterPath,
        candidates
    };
}