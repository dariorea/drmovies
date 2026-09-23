import "dotenv/config";

import {
    downloadM3U,
    parseM3U
} from "./services/m3u.service.js";

import {
    matchMovie
} from "./services/movieMatcher.service.js";


const content = await downloadM3U();

const movies = parseM3U(content);

const testMovies = movies.slice(0, 10);

for (const movie of testMovies) {
    console.log("\n==============================");

    console.log("M3U:");
    console.log(movie.name);

    console.log("Año:", movie.year);

    console.log("Poster:", movie.posterPath);

    try {
        const match = await matchMovie(movie);

        console.log("\nMATCH:");

        console.log(match);

    } catch (error) {
        console.error(
            "Error:",
            error.response?.data ?? error.message
        );
    }
}