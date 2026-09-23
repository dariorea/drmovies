import "dotenv/config";

import {
    downloadM3U,
    parseM3U
} from "./services/m3u.service.js";

import {
    searchMovie
} from "./services/tmdb.service.js";


const content = await downloadM3U();

const movies = parseM3U(content);

const testMovies = movies.slice(0, 5);

for (const movie of testMovies) {
    console.log("\n==============================");
    console.log("M3U:", movie.name);
    console.log("Año:", movie.year);
    console.log("Poster:", movie.posterPath);

    try {
        const results = await searchMovie(
            movie.name,
            movie.year
        );

        console.log("Resultados TMDB:", results.length);

        console.log(
            results.slice(0, 3).map(result => ({
                id: result.id,
                title: result.title,
                originalTitle: result.original_title,
                releaseDate: result.release_date,
                posterPath: result.poster_path
            }))
        );

    } catch (error) {
        console.error(
            "Error buscando en TMDB:",
            error.response?.data ?? error.message
        );
    }
}