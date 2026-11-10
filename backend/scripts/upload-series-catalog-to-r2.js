import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_FILE = path.resolve(
    __dirname,
    "../data/series-streams-combined.json"
);

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

const ACCESS_KEY_ID = process.env.R2_WRITE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_WRITE_SECRET_ACCESS_KEY;

const OBJECT_KEY =
    process.env.R2_SERIES_OBJECT_KEY ||
    "series-streams-combined.json";

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
        "❌ Faltan variables de entorno:",
        missingVariables.join(", ")
    );

    process.exit(1);
}

// ======================================================
// SUBIR CATÁLOGO
// ======================================================

async function uploadCatalog() {
    if (!fs.existsSync(CATALOG_FILE)) {
        throw new Error(
            `No se encontró el catálogo: ${CATALOG_FILE}`
        );
    }

    const stats = fs.statSync(CATALOG_FILE);

    if (!stats.isFile() || stats.size === 0) {
        throw new Error(
            "El catálogo no existe o está vacío."
        );
    }

    const sizeMB = (
        stats.size / (1024 * 1024)
    ).toFixed(2);

    console.log("======================================");
    console.log("       SUBIDA DEL CATÁLOGO A R2");
    console.log("======================================");

    console.log(`Archivo: ${CATALOG_FILE}`);
    console.log(`Tamaño: ${sizeMB} MB`);
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`Destino: ${OBJECT_KEY}`);

    const client = new S3Client({
        region: "auto",

        endpoint:
            `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,

        credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
        },
    });

    try {
        const upload = new Upload({
            client,

            params: {
                Bucket: BUCKET_NAME,
                Key: OBJECT_KEY,
                Body: fs.createReadStream(CATALOG_FILE),
                ContentType: "application/json",
            },

            // Subida multipart.
            queueSize: 3,
            partSize: 16 * 1024 * 1024,
            leavePartsOnError: false,
        });

        upload.on("httpUploadProgress", (progress) => {
            const loaded = progress.loaded || 0;

            const percent = Math.min(
                100,
                (loaded / stats.size) * 100
            );

            process.stdout.write(
                `\r📤 Progreso: ${percent.toFixed(1)}%`
            );
        });

        await upload.done();

        console.log("\n\n✅ Catálogo subido correctamente.");
        console.log(`📦 Tamaño: ${sizeMB} MB`);
        console.log(`☁️ Destino: ${OBJECT_KEY}`);

    } finally {
        client.destroy();
    }
}

// ======================================================
// EJECUCIÓN
// ======================================================

uploadCatalog().catch((error) => {
    console.error("\n❌ Error al subir el catálogo:");
    console.error(error);

    process.exitCode = 1;
});