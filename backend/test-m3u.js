import "dotenv/config";

import {
    downloadM3U,
    parseM3U
} from "./services/m3u.service.js";

const content = await downloadM3U();

const movies = parseM3U(content);

console.log("🎬 Películas encontradas:", movies.length);

console.log(
    movies.slice(0, 10)
);