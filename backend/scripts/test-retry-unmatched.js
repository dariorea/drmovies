import "dotenv/config";
import fs from "fs/promises";
import { matchMovie } from "../services/movieMatcher.service.js";

const FILE = "data/unmatched-movies-lista-3.json";

const movies = JSON.parse(
    await fs.readFile(FILE, "utf8")
);

const testMovies = movies.slice(0, 10);

console.log(`Probando ${testMovies.length} películas...\n`);

for (let i = 0; i < testMovies.length; i++) {
    const movie = testMovies[i];

    console.log(
        `\n[${i + 1}/${testMovies.length}] ${movie.name}`
    );

    try {
        const result = await matchMovie(movie.name);

        if (result?.match) {
            console.log(
                `  ✅ ${result.match.title} (${result.match.tmdbId})`
            );
            console.log(
                `  Método: ${result.match.matchMethod}`
            );
            console.log(
                `  Confianza: ${result.match.confidence}`
            );
        } else {
            console.log(
                `  ❌ Sin match`
            );
            console.log(
                `  Razón: ${result?.reason ?? "desconocida"}`
            );
        }

    } catch (error) {
        console.log(
            `  💥 Error: ${error.message}`
        );
    }
}