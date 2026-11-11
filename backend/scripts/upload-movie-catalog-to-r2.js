
import dotenv from "dotenv";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    S3Client,
    PutObjectCommand,
} from "@aws-sdk/client-s3";

dotenv.config();

// ======================================================
// RUTAS Y CONFIGURACIÓN
// ======================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_FILE = path.resolve(
    __dirname,
    "../data/movie-streams-all.json"
);

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

const ACCESS_KEY_ID =
    process.env.R2_WRITE_ACCESS_KEY_ID;

const SECRET_ACCESS_KEY =
    process.env.R2_WRITE_SECRET_ACCESS_KEY;

const MOVIES_PER_SHARD = 50;

const MANIFEST_KEY =
    process.env.R2_MOVIES_MANIFEST_KEY ||
    "movies/manifest.json";

const CATALOG_VERSION = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

const SHARDS_PREFIX =
    `movies/v${CATALOG_VERSION}`;

// ======================================================
// VALIDAR CONFIGURACIÓN
// ======================================================

const requiredVariables = {
    R2_ACCOUNT_ID: ACCOUNT_ID,
    R2_BUCKET_NAME: BUCKET_NAME,
    R2_WRITE_ACCESS_KEY_ID: ACCESS_KEY_ID,
    R2_WRITE_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
};

const missingVariables = Object.entries(requiredVariables)
    .filter(([, value]) => !value)
    .map(([name]) => name);

if (missingVariables.length > 0) {
    console.error(
        "❌ Faltan variables:",
        missingVariables.join(", ")
    );

    process.exit(1);
}

if (MANIFEST_KEY === "manifest.json") {
    throw new Error(
        "El manifiesto de películas debe ser independiente del de series."
    );
}

// ======================================================
// CLIENTE R2
// ======================================================

const client = new S3Client({
    region: "auto",

    endpoint:
        `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

// ======================================================
// SUBIR JSON A R2
// ======================================================

async function uploadJson(key, data) {
    const body = JSON.stringify(data);

    await client.send(
        new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: body,
            ContentType: "application/json",
        })
    );

    return Buffer.byteLength(body);
}

// ======================================================
// VALIDAR CATÁLOGO
// ======================================================

function validateMovie(movie) {
    return (
        movie &&
        typeof movie === "object" &&
        !Array.isArray(movie) &&
        Array.isArray(movie.streams)
    );
}

// ======================================================
// GENERAR Y SUBIR FRAGMENTOS
// ======================================================

async function generateShards(catalog) {
    const ids = Object.keys(catalog);

    if (ids.length === 0) {
        throw new Error(
            "El catálogo no contiene ninguna película."
        );
    }

    const invalidEntries = Object.entries(catalog)
        .filter(([id, movie]) => {
            return (
                !id ||
                !validateMovie(movie)
            );
        });

    if (invalidEntries.length > 0) {
        throw new Error(
            `El catálogo contiene ${invalidEntries.length} películas inválidas.`
        );
    }

    const totalShards = Math.ceil(
        ids.length / MOVIES_PER_SHARD
    );

    const manifest = {
        version: 1,
        catalogVersion: CATALOG_VERSION,
        totalMovies: ids.length,
        moviesPerShard: MOVIES_PER_SHARD,
        totalShards,
        shardsPrefix: SHARDS_PREFIX,
        movies: {},
    };

    let totalBytes = 0;

    console.log("======================================");
    console.log("       FRAGMENTACIÓN DE PELÍCULAS");
    console.log("======================================");

    console.log(`🎬 Películas: ${ids.length}`);
    console.log(`📦 Fragmentos: ${totalShards}`);
    console.log(`📁 Versión: ${CATALOG_VERSION}`);
    console.log(`☁️ Bucket: ${BUCKET_NAME}`);

    // Subir todos los fragmentos antes del manifiesto.
    for (let i = 0; i < totalShards; i++) {
        const shardNumber = String(i + 1).padStart(4, "0");

        const shardKey =
            `${SHARDS_PREFIX}/shard-${shardNumber}.json`;

        const start = i * MOVIES_PER_SHARD;

        const end = Math.min(
            start + MOVIES_PER_SHARD,
            ids.length
        );

        const shard = {};

        for (const id of ids.slice(start, end)) {
            shard[id] = catalog[id];

            manifest.movies[id] = shardKey;
        }

        const bytes = await uploadJson(
            shardKey,
            shard
        );

        totalBytes += bytes;

        console.log(
            `☁️ ${i + 1}/${totalShards} | ` +
            `${shardKey} | ` +
            `${end - start} películas | ` +
            `${(bytes / 1024 / 1024).toFixed(2)} MB`
        );
    }

    // ==================================================
    // PUBLICAR MANIFIESTO
    // ==================================================

    console.log("");
    console.log(
        "☁️ Todos los fragmentos se subieron correctamente."
    );

    console.log("📄 Publicando manifiesto...");

    const manifestBytes = await uploadJson(
        MANIFEST_KEY,
        manifest
    );

    // ==================================================
    // RESUMEN
    // ==================================================

    console.log("");
    console.log("======================================");
    console.log("       IMPORTACIÓN COMPLETADA");
    console.log("======================================");

    console.log(`🎬 Películas: ${ids.length}`);
    console.log(`📦 Fragmentos: ${totalShards}`);

    console.log(
        `💾 Datos: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`
    );

    console.log(
        `📄 Manifiesto: ${(manifestBytes / 1024).toFixed(2)} KB`
    );

    console.log(`📁 Carpeta: ${SHARDS_PREFIX}`);
    console.log(`☁️ Bucket: ${BUCKET_NAME}`);

    console.log(
        `✅ Manifiesto publicado: ${MANIFEST_KEY}`
    );
}

// ======================================================
// EJECUCIÓN
// ======================================================

async function main() {
    try {
        if (!fs.existsSync(CATALOG_FILE)) {
            throw new Error(
                `No se encontró el catálogo: ${CATALOG_FILE}`
            );
        }

        const stats = await fsPromises.stat(
            CATALOG_FILE
        );

        if (!stats.isFile() || stats.size === 0) {
            throw new Error(
                "El catálogo está vacío o no es válido."
            );
        }

        console.log("📂 Leyendo catálogo original...");

        console.log(
            `💾 Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
        );

        const content = await fsPromises.readFile(
            CATALOG_FILE,
            "utf8"
        );

        const catalog = JSON.parse(content);

        if (
            !catalog ||
            typeof catalog !== "object" ||
            Array.isArray(catalog)
        ) {
            throw new Error(
                "La estructura del catálogo no es válida."
            );
        }

        await generateShards(catalog);

    } finally {
        client.destroy();
    }
}

main().catch(error => {
    console.error(
        "\n❌ Error al generar el catálogo fragmentado:"
    );

    console.error(error);

    process.exitCode = 1;
});
