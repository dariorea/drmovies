import {
    matchMovie,
    cleanProviderTags,
    createSearchVariants
} from "../services/movieMatcher.service.js";

const tests = [
    "Entrega al límite  Full HD",
    "En el corazón de la bestia  HDTS Latino",
    "La isla olvidada  HDTS Latino",
    "Resident Evil  HDTS Latino 5.1",
    "Las Horas mas Osuras",
    "El final de Oak Street  FULL HD",
    "The Mongoose  V2 Subtitulos Pegados",
    "Fall 2: Punto muerto  Telesync Latino",
    "Posesión infernal: El despertar  1080 HD",
    "Spider-Man: Un Nuevo dia  1080 Version Final HD 5.1",
    "Spider-Man: Lejos de casa  1080 HD",
    "Spider-Man: Sin camino a casa  1080 HD",
    "Supergirl  Full HD",
    "La odisea  Telesync 1080 Laino V2",
    "Deadpool vs Wolverine",
    "Minions y monstruos  HDTS Audio 5.1"
];

for (const providerTitle of tests) {
    console.log("\n========================================");
    console.log(providerTitle);
    console.log("========================================");

    const cleaned = cleanProviderTags(providerTitle);
    const variants = createSearchVariants(providerTitle);

    console.log(`🧹 Limpio: ${cleaned}`);
    console.log(`🔎 Variantes: ${variants.join(" | ")}`);

    try {
        const result = await matchMovie(providerTitle);

        if (result.match) {
            console.log("\n🎯 MATCH:");
            console.log(
                `✅ TMDB ${result.match.tmdbId}`
            );
            console.log(
                `   ${result.match.title}`
            );
            console.log(
                `   ${result.match.year ?? "sin año"}`
            );
            console.log(
                `   confidence: ${result.match.confidence}`
            );
            console.log(
                `   tipo: ${result.match.matchType}`
            );

            if (result.match.alternativeTitle) {
                console.log(
                    `   alternativa: ${result.match.alternativeTitle}`
                );
            }
        } else if (
            result.reason?.includes("ambiguous")
        ) {
            console.log("\n🎯 MATCH:");
            console.log("⚠️ AMBIGUO");

            if (result.candidates) {
                for (const candidate of result.candidates) {
                    console.log(
                        `   ${candidate.tmdbId} - ${candidate.title} (${candidate.year ?? "?"})`
                    );
                }
            }
        } else {
            console.log("\n🎯 MATCH:");
            console.log("❌ Sin coincidencia");
        }
    } catch (error) {
        console.log("\n🎯 ERROR:");
        console.log(`❌ ${error.message}`);
    }
}