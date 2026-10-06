import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.TMDB_API_KEY;
const TMDB_ID = 198102;

const M3U_POSTER =
    "/gIzSsyW2DAxIssSv3Qk6qd8FCkW.jpg";

async function tmdb(endpoint, params = {}) {
    const url = new URL(
        `https://api.themoviedb.org/3${endpoint}`
    );

    url.searchParams.set("api_key", API_KEY);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `TMDB ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}

async function main() {
    console.log("🔎 Buscando imágenes de Hijack...\n");

    const images = await tmdb(
        `/tv/${TMDB_ID}/images`
    );

    console.log(
        `Posters: ${images.posters?.length || 0}`
    );

    console.log(
        `Backdrops: ${images.backdrops?.length || 0}`
    );

    console.log(
        `Logos: ${images.logos?.length || 0}`
    );

    console.log("\n🖼️ POSTERS:\n");

    let found = false;

    for (const poster of images.posters || []) {
        console.log(
            `${poster.file_path} | ${poster.width}x${poster.height} | ${poster.iso_639_1 || "null"}`
        );

        if (poster.file_path === M3U_POSTER) {
            found = true;

            console.log(
                "\n🎯 ¡POSTER DE LA M3U ENCONTRADO!\n"
            );

            console.log(poster);
        }
    }

    console.log("\n================================");

    if (found) {
        console.log(
            "✅ TMDB SÍ tiene exactamente el poster de la M3U"
        );
    } else {
        console.log(
            "❌ TMDB NO devuelve ese poster actualmente"
        );
    }

    console.log("================================");
}

main().catch(error => {
    console.error("\n❌ Error:");
    console.error(error);
});