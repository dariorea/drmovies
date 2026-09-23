import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREAMS_FILE = path.join(
    __dirname,
    "../data/movie-streams.json"
);

const BACKUP_FILE = path.join(
    __dirname,
    "../data/movie-streams.json.backup"
);

function sanitizeStreamUrl(streamUrl) {
    try {
        const url = new URL(streamUrl);

        const parts = url.pathname.split("/");

        const typeIndex = parts.findIndex(
            part =>
                part === "movie" ||
                part === "series"
        );

        if (typeIndex === -1) {
            return streamUrl;
        }

        const userIndex = typeIndex + 1;
        const passwordIndex = typeIndex + 2;

        if (
            !parts[userIndex] ||
            !parts[passwordIndex]
        ) {
            return streamUrl;
        }

        const user =
            decodeURIComponent(parts[userIndex]);

        const password =
            decodeURIComponent(parts[passwordIndex]);

        // Ya está sanitizada
        if (
            user === "{user}" &&
            password === "{password}"
        ) {
            return streamUrl;
        }

        parts[userIndex] = "{user}";
        parts[passwordIndex] = "{password}";

        url.pathname = parts.join("/");

        return url.toString();

    } catch {
        return streamUrl;
    }
}

async function main() {
    console.log("🔐 Iniciando sanitización...\n");

    // -----------------------------------------
    // 1. Leer archivo original
    // -----------------------------------------

    const content = await fs.readFile(
        STREAMS_FILE,
        "utf8"
    );

    console.log(
        "📄 movie-streams.json leído."
    );

    // -----------------------------------------
    // 2. Crear backup
    // -----------------------------------------

    await fs.copyFile(
        STREAMS_FILE,
        BACKUP_FILE
    );

    console.log(
        "💾 Backup creado:"
    );

    console.log(
        "→ data/movie-streams.json.backup\n"
    );

    // -----------------------------------------
    // 3. Parsear JSON
    // -----------------------------------------

    const streams = JSON.parse(content);

    let total = 0;
    let modified = 0;

    // -----------------------------------------
    // 4. Sanitizar URLs
    // -----------------------------------------

    for (const movie of Object.values(streams)) {

        if (!movie.streamUrl) {
            continue;
        }

        total++;

        const originalUrl =
            movie.streamUrl;

        const sanitizedUrl =
            sanitizeStreamUrl(
                originalUrl
            );

        if (
            sanitizedUrl !== originalUrl
        ) {
            movie.streamUrl =
                sanitizedUrl;

            modified++;
        }
    }

    // -----------------------------------------
    // 5. Guardar JSON limpio
    // -----------------------------------------

    await fs.writeFile(
        STREAMS_FILE,
        JSON.stringify(
            streams,
            null,
            4
        ),
        "utf8"
    );

    // -----------------------------------------
    // 6. Resultado
    // -----------------------------------------

    console.log(
        "================================="
    );

    console.log(
        "🎉 SANITIZACIÓN TERMINADA"
    );

    console.log(
        "================================="
    );

    console.log(
        "URLs procesadas:",
        total
    );

    console.log(
        "URLs modificadas:",
        modified
    );

    console.log(
        "URLs sin cambios:",
        total - modified
    );

    console.log(
        "\n✅ movie-streams.json actualizado."
    );

    console.log(
        "💾 Backup disponible en:"
    );

    console.log(
        "→ data/movie-streams.json.backup"
    );
}

main().catch(error => {
    console.error(
        "\n❌ Error:",
        error
    );

    process.exit(1);
});