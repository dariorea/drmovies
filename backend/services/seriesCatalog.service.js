import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

import {
    S3Client,
    GetObjectCommand,
} from "@aws-sdk/client-s3";

// ======================================================
// RUTAS
// ======================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");

const LOCAL_FILE = path.join(
    DATA_DIR,
    "series-streams-combined.json"
);

const TEMP_FILE = `${LOCAL_FILE}.download`;

// ======================================================
// ESTADO DEL CATÁLOGO
// ======================================================

let catalogCache = null;
let initializationPromise = null;

// ======================================================
// CONFIGURACIÓN R2
// ======================================================

function getR2Config() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucketName = process.env.R2_BUCKET_NAME;

    const accessKeyId = process.env.R2_READ_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_READ_SECRET_ACCESS_KEY;

    const objectKey =
        process.env.R2_SERIES_OBJECT_KEY ||
        "series-streams-combined.json";

    const values = [
        accountId,
        bucketName,
        accessKeyId,
        secretAccessKey,
    ];

    const configured = values.filter(Boolean).length;

    // Si no se configuró ninguna variable, usamos el archivo local.
    if (configured === 0) {
        return null;
    }

    // Si la configuración está incompleta, no arrancamos.
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
        objectKey,
    };
}

// ======================================================
// VALIDACIÓN DEL CATÁLOGO
// ======================================================

function validateCatalog(data) {
    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new Error(
            "El catálogo descargado no tiene una estructura JSON válida."
        );
    }

    return data;
}

// ======================================================
// CARGA DESDE ARCHIVO LOCAL
// ======================================================

async function loadLocalCatalog() {
    console.log("📂 Cargando catálogo local de series...");

    const content = await fs.readFile(LOCAL_FILE, "utf8");

    const catalog = validateCatalog(JSON.parse(content));

    console.log(
        `📺 Catálogo local cargado: ${
            Object.keys(catalog).length
        } TMDB IDs`
    );

    return catalog;
}

// ======================================================
// DESCARGA DESDE CLOUDFLARE R2
// ======================================================

async function downloadCatalogFromR2(config) {
    const client = new S3Client({
        region: "auto",

        endpoint:
            `https://${config.accountId}.r2.cloudflarestorage.com`,

        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });

    try {
        await fs.mkdir(DATA_DIR, {
            recursive: true,
        });

        console.log("☁️ Descargando catálogo desde Cloudflare R2...");

        console.log(`📦 Bucket: ${config.bucketName}`);
        console.log(`📄 Archivo: ${config.objectKey}`);

        const response = await client.send(
            new GetObjectCommand({
                Bucket: config.bucketName,
                Key: config.objectKey,
            })
        );

        if (!response.Body) {
            throw new Error(
                "Cloudflare R2 devolvió una respuesta sin contenido."
            );
        }

        // Descargar directamente al disco.
        await pipeline(
            response.Body,
            createWriteStream(TEMP_FILE)
        );

        const stats = await fs.stat(TEMP_FILE);

        if (
            response.ContentLength != null &&
            stats.size !== response.ContentLength
        ) {
            throw new Error(
                `Descarga incompleta. Esperados: ${
                    response.ContentLength
                } bytes. Recibidos: ${stats.size} bytes.`
            );
        }

        console.log(
            `📥 Descarga finalizada: ${(
                stats.size / (1024 * 1024)
            ).toFixed(2)} MB`
        );

        // Validar el JSON antes de reemplazar el archivo local.
        const content = await fs.readFile(TEMP_FILE, "utf8");

        const catalog = validateCatalog(
            JSON.parse(content)
        );

        // Reemplazo atómico: solo ocurre después de validar.
        await fs.rename(TEMP_FILE, LOCAL_FILE);

        console.log(
            `✅ Catálogo descargado y validado: ${
                Object.keys(catalog).length
            } TMDB IDs`
        );

        return catalog;

    } finally {
        client.destroy();

        // Limpiar un temporal si la descarga o validación falló.
        await fs.rm(TEMP_FILE, {
            force: true,
        }).catch(() => {});
    }
}

// ======================================================
// INICIALIZACIÓN
// ======================================================

async function initializeCatalog() {
    const config = getR2Config();

    if (config) {
        catalogCache = await downloadCatalogFromR2(config);
    } else {
        catalogCache = await loadLocalCatalog();
    }

    return catalogCache;
}

// ======================================================
// API DEL SERVICIO
// ======================================================

export function initializeSeriesCatalog() {
    if (catalogCache) {
        return Promise.resolve(catalogCache);
    }

    if (!initializationPromise) {
        initializationPromise = initializeCatalog().catch(
            (error) => {
                initializationPromise = null;
                throw error;
            }
        );
    }

    return initializationPromise;
}

export async function getSeriesCatalog() {
    return initializeSeriesCatalog();
}