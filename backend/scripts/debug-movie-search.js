
import fs from "fs";
import { searchMovie } from "../services/tmdb.service.js";

const file = "data/unmatched-test-results-lista-3.json";

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const results = Array.isArray(data) ? data : data.results ?? [];

const failed = results.filter(item => item.result?.matched === false);

console.log(`Películas sin match: ${failed.length}`);

for (const item of failed) {
    const name = item.input.name;

    console.log("\n================================");
    console.log("Original:", name);

    try {
        const normal = await searchMovie(name);

        console.log("Búsqueda original:", normal.length);

        const simplified = name
            .replace(/\b(2160p?|1080p?|720p?|480p?|HD|FHD|UHD|FULL\s*HD|HDTS|HDCAM|TELESYNC|LATINO|SUBTITULOS|PEGADOS|5\.1|V\d+)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();

        console.log("Simplificado:", simplified);

        const retry = await searchMovie(simplified);

        console.log("Búsqueda simplificada:", retry.length);

        if (retry.length > 0) {
            console.log(
                "Candidatos:",
                retry.slice(0, 5).map(movie => ({
                    id: movie.id,
                    title: movie.title,
                    original_title: movie.original_title,
                    release_date: movie.release_date
                }))
            );
        }
    } catch (error) {
        console.error("Error:", error.message);
    }

    await new Promise(resolve => setTimeout(resolve, 250));
}