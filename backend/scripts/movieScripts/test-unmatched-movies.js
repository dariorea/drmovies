import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { matchMovie } from "../services/movieMatcher.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(
    __dirname,
    "../data/unmatched-movies-lista-3.json"
);

const outputPath = path.join(
    __dirname,
    "../data/unmatched-test-results-lista-3.json"
);

const movies = JSON.parse(
    fs.readFileSync(inputPath, "utf8")
).slice(0, 30);

console.log(`\n🎬 Películas a probar: ${movies.length}\n`);

const results = [];

let matched = 0;
let review = 0;
let noMatch = 0;
let errors = 0;

for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];

    console.log(
        `[${i + 1}/${movies.length}] ${movie.name}`
    );

    try {
        const result = await matchMovie(movie);

        const entry = {
            input: movie,
            result
        };

        results.push(entry);

        /*
        |--------------------------------------------------------------------------
        | MATCH
        |--------------------------------------------------------------------------
        */

        if (result.match) {
            matched++;

            console.log(
                `   ✅ MATCH: ${result.match.title} (${result.match.tmdbId})`
            );

            console.log(
                `   Método: ${result.match.matchType} | Confianza: ${result.match.confidence}`
            );

            console.log(
                `   Razón: ${result.reason}`
            );

        /*
        |--------------------------------------------------------------------------
        | REVIEW
        |--------------------------------------------------------------------------
        */

        } else if (
            result.reason === "ambiguous" ||
            result.reason === "needs-review"
        ) {
            review++;

            console.log(
                `   🟡 REVISAR`
            );

        /*
        |--------------------------------------------------------------------------
        | NO MATCH
        |--------------------------------------------------------------------------
        */

        } else {
            noMatch++;

            console.log(
                `   ❌ SIN MATCH: ${result.reason ?? "Sin motivo especificado"}`
            );
        }

    } catch (error) {
        errors++;

        console.log(
            `   💥 ERROR: ${error.message}`
        );

        results.push({
            input: movie,
            result: {
                status: "error",
                error: error.message
            }
        });
    }

    console.log("");
}

fs.writeFileSync(
    outputPath,
    JSON.stringify(results, null, 2),
    "utf8"
);

console.log("\n=================================");
console.log("           RESULTADO");
console.log("=================================");
console.log(`Total:       ${movies.length}`);
console.log(`✅ Match:     ${matched}`);
console.log(`🟡 Revisar:   ${review}`);
console.log(`❌ Sin match: ${noMatch}`);
console.log(`💥 Errores:   ${errors}`);
console.log("=================================");

console.log(
    `\n📄 Resultados guardados en:\n${outputPath}\n`
);