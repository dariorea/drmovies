import "dotenv/config";

import { matchMovie } from "./services/movieMatcher.service.js";

const movie = {
    name: "Zona Cero",
    year: 2026,
    posterPath: "/pQIpfeenClb2ws9G0kMg3HREjoA.jpg"
};

const result = await matchMovie(movie);

console.log("\nResultado:\n");
console.log(result);