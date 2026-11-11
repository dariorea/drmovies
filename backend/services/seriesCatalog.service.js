
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    S3Client,
    GetObjectCommand,
} from "@aws-sdk/client-s3";

// ======================================================
// RUTAS
// ======================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_FILE = path.resolve(
    __dirname,
    "../data/series-streams-combined.json"
);

// ======================================================
// CONFIGURACIÓN DE CACHÉ
// ======================================================

const MAX_CACHED_SHARDS = 3;

let localCatalogCache = null;
let manifestCache = null;
let initializationPromise = null;
let r2Client = null;
let r2Config = null;

const shardCache = new Map();
const shardPromises = new Map();

// ======================================================
// CONFIGURACIÓN R2
// ======================================================

function getR2Config() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucketName = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_READ_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_READ_SECRET_ACCESS_KEY;

    const values = [
        accountId,
        bucketName,
        accessKeyId,
        secretAccessKey,
    ];

    const configured = values.filter(Boolean).length;

    if (configured === 0) {
        return null;
    }

    if (configured !== values.length) {
        throw new Error(
            "Configuración incompleta de Cloudflare R2. " +
            "Revisá las variables R2_*."
        );
    }

    return {
        accountId,
        bucketName,
        accessKeyId,
        secretAccessKey,
        manifestKey:
            process.env.R2_SERIES_MANIFEST_KEY || "manifest.json",
    };
}

// ======================================================
// CLIENTE R2
// ======================================================

function getR2Client(config) {
    if (!r2Client) {
        r2Client = new S3Client({
            region: "auto",
            endpoint:
                `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
    }

    return r2Client;
}

// ======================================================
// LEER RESPUESTA STREAM DE R2
// ======================================================

async function bodyToString(body) {
    if (!body) {
        throw new Error("Cloudflare R2 devolvió una respuesta vacía.");
    }

    if (typeof body.transformToString === "function") {
        return body.transformToString();
    }

    const chunks = [];

    for await (const chunk of body) {
        chunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        );
    }

    return Buffer.concat(chunks).toString("utf8");
}

// ======================================================
// DESCARGAR JSON DE R2
// ======================================================

async function downloadJson(key) {
    const response = await getR2Client(r2Config).send(
        new GetObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
        })
    );

    const content = await bodyToString(response.Body);

    try {
        return JSON.parse(content);
    } catch {
        throw new Error(
            `El archivo ${key} no contiene un JSON válido.`
        );
    }
}

// ======================================================
// VALIDAR MANIFIESTO
// ======================================================

function validateManifest(data) {
    if (
        !data ||
        typeof data !== "object" ||
        !data.series ||
        typeof data.series !== "object" ||
        Array.isArray(data.series)
    ) {
        throw new Error(
            "El manifest.json no tiene el formato esperado."
        );
    }

    return data;
}

// ======================================================
// CARGA LOCAL
// ======================================================

async function loadLocalCatalog() {
    console.log("📂 Cargando catálogo local de series...");

    const content = await fs.readFile(LOCAL_FILE, "utf8");

    let catalog;

    try {
        catalog = JSON.parse(content);
    } catch {
        throw new Error("El catálogo local no contiene un JSON válido.");
    }

    if (
        !catalog ||
        typeof catalog !== "object" ||
        Array.isArray(catalog)
    ) {
        throw new Error("La estructura del catálogo local no es válida.");
    }

    console.log(
        `📺 Catálogo local cargado: ${
            Object.keys(catalog).length
        } TMDB IDs`
    );

    return catalog;
}

// ======================================================
// INICIALIZACIÓN
// ======================================================

async function initializeCatalog() {
    r2Config = getR2Config();

    if (!r2Config) {
        localCatalogCache = await loadLocalCatalog();
        return;
    }

    console.log("☁️ Conectando con Cloudflare R2...");
    console.log(`📦 Bucket: ${r2Config.bucketName}`);
    console.log(`📄 Manifiesto: ${r2Config.manifestKey}`);

    const manifest = await downloadJson(r2Config.manifestKey);

    manifestCache = validateManifest(manifest);

    console.log(
        `✅ Manifiesto cargado: ${
            Object.keys(manifestCache.series).length
        } TMDB IDs`
    );

    console.log(
        `📦 Fragmentos disponibles: ${
            manifestCache.totalShards ?? "no especificado"
        }`
    );
}

// ======================================================
// API DE INICIALIZACIÓN
// ======================================================

export function initializeSeriesCatalog() {
    if (localCatalogCache || manifestCache) {
        return Promise.resolve();
    }

    if (!initializationPromise) {
        initializationPromise = initializeCatalog().catch(error => {
            initializationPromise = null;

            if (r2Client) {
                r2Client.destroy();
                r2Client = null;
            }

            throw error;
        });
    }

    return initializationPromise;
}

// ======================================================
// DESCARGA DE FRAGMENTOS
// ======================================================

async function downloadShard(key) {
    console.log(`📥 Descargando fragmento: ${key}`);

    const shard = await downloadJson(key);

    if (
        !shard ||
        typeof shard !== "object" ||
        Array.isArray(shard)
    ) {
        throw new Error(
            `El fragmento ${key} tiene una estructura inválida.`
        );
    }

    return shard;
}

// ======================================================
// CACHÉ LRU DE FRAGMENTOS
// ======================================================

async function getShard(key) {
    // Si ya está en caché, actualizar su posición LRU.
    if (shardCache.has(key)) {
        const cached = shardCache.get(key);

        shardCache.delete(key);
        shardCache.set(key, cached);

        return cached;
    }

    // Evitar descargas simultáneas del mismo fragmento.
    if (shardPromises.has(key)) {
        return shardPromises.get(key);
    }

    const promise = downloadShard(key)
        .then(shard => {
            shardCache.set(key, shard);

            // Eliminar los fragmentos menos utilizados.
            while (shardCache.size > MAX_CACHED_SHARDS) {
                const oldestKey = shardCache.keys().next().value;

                shardCache.delete(oldestKey);

                console.log(
                    `🧹 Fragmento retirado de caché: ${oldestKey}`
                );
            }

            return shard;
        })
        .finally(() => {
            shardPromises.delete(key);
        });

    shardPromises.set(key, promise);

    return promise;
}

// ======================================================
// OBTENER UNA SERIE POR TMDB ID
// ======================================================

export async function getSeriesById(id) {
    await initializeSeriesCatalog();

    const tmdbId = String(id);

    // Desarrollo local: conservar el catálogo tradicional.
    if (localCatalogCache) {
        return localCatalogCache[tmdbId] ?? null;
    }

    // Buscar el fragmento correspondiente en el manifiesto.
    const shardKey = manifestCache.series[tmdbId];

    if (!shardKey || typeof shardKey !== "string") {
        return null;
    }

    // Descargar o recuperar el fragmento de la caché.
    const shard = await getShard(shardKey);

    return shard[tmdbId] ?? null;
}
