import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const TMDB_API_KEY = process.env.TMDB_API_KEY;

const data = JSON.parse(
    fs.readFileSync("data/series-parsed.json", "utf8")
);

const TEST_SERIES = [
    "Hijack",
    "S.W.A.T.",
    "The Boys",
    "Breaking Bad",
    "Sandokan",
    "El Caballero de los Siete Reinos"
];

function normalizeTitle(title) {
    return title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

async function searchTMDB(query, language) {

    const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        query,
        language,
        include_adult: "false"
    });

    const response = await fetch(
        `https://api.themoviedb.org/3/search/tv?${params}`
    );

    if (!response.ok) {
        throw new Error(
            `TMDB ${response.status}: ${response.statusText}`
        );
    }

    return response.json();
}

async function findSeries(name) {

    console.log("");
    console.log("================================");
    console.log(`🔎 ${name}`);
    console.log("================================");

    const normalizedM3U = normalizeTitle(name);

    const searches = [
        {
            language: "es-AR",
            label: "🇦🇷 Argentina"
        },
        {
            language: "es-MX",
            label: "🇲🇽 México"
        },
        {
            language: "es-ES",
            label: "🇪🇸 España"
        },
        {
            language: "en-US",
            label: "🇺🇸 Original/English"
        }
    ];

    const candidates = new Map();

    for (const search of searches) {

        const data = await searchTMDB(
            name,
            search.language
        );

        for (const result of data.results || []) {

            if (!candidates.has(result.id)) {

                candidates.set(result.id, {
                    ...result,
                    foundLanguages: []
                });
            }

            candidates
                .get(result.id)
                .foundLanguages
                .push(search.label);
        }
    }

    const results = [...candidates.values()];

    if (!results.length) {

        console.log("❌ No encontrado");

        return;
    }

    // -------------------------
    // Buscar coincidencias
    // -------------------------

    const exactMatches = results.filter(result => {

        const names = [
            result.name,
            result.original_name
        ].filter(Boolean);

        return names.some(
            value =>
                normalizeTitle(value) === normalizedM3U
        );
    });

    console.log("");
    console.log(`📋 Candidatos encontrados: ${results.length}`);

    for (const result of results.slice(0, 10)) {

        const names = [
            result.name,
            result.original_name
        ]
            .filter(Boolean)
            .join(" | ");

        console.log("");
        console.log(`TMDB ID: ${result.id}`);
        console.log(`Título: ${names}`);
        console.log(
            `Año: ${result.first_air_date?.slice(0, 4) || "?"}`
        );
        console.log(
            `País: ${result.origin_country?.join(", ") || "?"}`
        );
        console.log(
            `Encontrado en: ${result.foundLanguages.join(", ")}`
        );
    }

    // -------------------------
    // Resultado
    // -------------------------

    console.log("");

    if (exactMatches.length === 1) {

        const match = exactMatches[0];

        console.log("✅ MATCH");

        console.log(`TMDB ID: ${match.id}`);
        console.log(`TMDB name: ${match.name}`);
        console.log(
            `Original: ${match.original_name}`
        );

    } else if (exactMatches.length > 1) {

        console.log(
            `⚠️ ${exactMatches.length} matches exactos`
        );

    } else {

        console.log(
            "🟡 No hubo coincidencia exacta normalizada"
        );
    }
}

async function main() {

    if (!TMDB_API_KEY) {
        throw new Error(
            "Falta TMDB_API_KEY en .env"
        );
    }

    for (const name of TEST_SERIES) {

        await findSeries(name);

        // Pequeña pausa entre búsquedas
        await new Promise(resolve =>
            setTimeout(resolve, 250)
        );
    }
}

main().catch(error => {

    console.error("");
    console.error("❌", error.message);

    process.exit(1);
});