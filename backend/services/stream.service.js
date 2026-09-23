import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREAMS_FILE = path.join(
    __dirname,
    "../data/movie-streams.json"
);

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

    const user = process.env.IPTV_USER;
    const password = process.env.IPTV_PASSWORD;

    if (!user || !password) {
        throw new Error(
            "Faltan IPTV_USER o IPTV_PASSWORD en .env"
        );
    }

    const streamUrl = movie.streamUrl
        .replace(/\{user\}|%7Buser%7D/gi, user)
        .replace(/\{password\}|%7Bpassword%7D/gi, password);
    

    return {
        ...movie,
        streamUrl
    };

}