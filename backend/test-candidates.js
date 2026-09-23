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

const namesToTest = [
    "Aniversario",
    "Hasta el fin del mundo",
    "Supergirl",
    "Moana"
];

const moviesToTest = movies.filter(movie =>
    namesToTest.includes(movie.name)
);

for (const movie of moviesToTest) {

    console.log("\n========================================");
    console.log("M3U:", movie.name);
    console.log("Año:", movie.year);
    console.log("Poster:", movie.posterPath);
    console.log("========================================");

    try {

        const results = await searchMovie(
            movie.name,
            movie.year
        );

        console.log(
            `\nTMDB encontró ${results.length} resultados:\n`
        );

        results.forEach((result, index) => {

            const year = result.release_date
                ? result.release_date.slice(0, 4)
                : null;

            const posterMatches =
                movie.posterPath === result.poster_path;

            console.log(`--- Resultado ${index + 1} ---`);

            console.log("TMDB ID:", result.id);
            console.log("Título:", result.title);
            console.log("Título original:", result.original_title);
            console.log("Año:", year);
            console.log("Poster:", result.poster_path);
            console.log(
                "¿Poster coincide?:",
                posterMatches ? "✅ SÍ" : "❌ NO"
            );
        });

    } catch (error) {

        console.error(
            "Error:",
            error.response?.data ?? error.message
        );

    }
}