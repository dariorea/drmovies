
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
    S3Client,
    GetObjectCommand,
} from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ======================================================
// CONFIGURACIÓN
// ======================================================

const STREAMS_FILE = path.join(
    __dirname,
    "../data/movie-streams-all.json"
);

const MAX_CACHED_SHARDS = 3;

// ======================================================
// ESTADO
// ======================================================

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

    const accessKeyId =
        process.env.R2_READ_ACCESS_KEY_ID;

    const secretAccessKey =
        process.env.R2_READ_SECRET_ACCESS_KEY;

    const manifestKey =
        process.env.R2_MOVIES_MANIFEST_KEY ||
        "movies/manifest.json";

    const configuredValues = [
        accountId,
        bucketName,
        accessKeyId,
        secretAccessKey,
    ];

    const hasAnyConfig = configuredValues.some(Boolean);
    const hasCompleteConfig = configuredValues.every(Boolean);

    if (!hasAnyConfig) {
        return null;
    }

    if (!hasCompleteConfig) {
        throw new Error(
            "La configuración de Cloudflare R2 para películas está incompleta"
        );
    }

    return {
        accountId,
        bucketName,
        accessKeyId,
        secretAccessKey,
        manifestKey,
    };
}

function createR2Client(config) {
    return new S3Client({
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
}

// ======================================================
// LECTURA DE OBJETOS R2
// ======================================================

async function bodyToString(body) {
    if (typeof body.transformToString === "function") {
        return body.transformToString();
    }

    const chunks = [];

    for await (const chunk of body) {
        chunks.push(
            Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk)
        );
    }

    return Buffer.concat(chunks).toString("utf8");
}

async function downloadJson(key) {
    const response = await r2Client.send(
        new GetObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
        })
    );

    if (!response.Body) {
        throw new Error(
            `El objeto R2 está vacío: ${key}`
        );
    }

    const content = await bodyToString(response.Body);

    return JSON.parse(content);
}

// ======================================================
// VALIDACIÓN
// ======================================================

function validateCatalog(catalog) {
    if (
        !catalog ||
        typeof catalog !== "object" ||
        Array.isArray(catalog)
    ) {
        throw new Error(
            "El catálogo de películas tiene una estructura inválida"
        );
    }

    return catalog;
}

function validateManifest(manifest) {
    if (
        !manifest ||
        typeof manifest !== "object" ||
        !manifest.movies ||
        typeof manifest.movies !== "object" ||
        Array.isArray(manifest.movies)
    ) {
        throw new Error(
            "El manifiesto de películas tiene una estructura inválida"
        );
    }

    return manifest;
}

// ======================================================
// CATÁLOGO LOCAL
// ======================================================

async function loadLocalCatalog() {
    if (localCatalogCache) {
        return localCatalogCache;
    }

    console.log(
        "📂 Cargando catálogo local de películas..."
    );

    const content = await fs.readFile(
        STREAMS_FILE,
        "utf8"
    );

    const catalog = validateCatalog(
        JSON.parse(content)
    );

    localCatalogCache = catalog;

    console.log(
        `✅ Catálogo local cargado: ${Object.keys(catalog).length} películas`
    );

    return localCatalogCache;
}

// ======================================================
// INICIALIZACIÓN
// ======================================================

async function initializeCatalog() {
    r2Config = getR2Config();

    // Sin R2: utilizar catálogo local.
    if (!r2Config) {
        console.log(
            "📂 R2 no configurado. Se utilizará el catálogo local de películas."
        );

        await loadLocalCatalog();

        return;
    }

    console.log(
        "☁️ Conectando con Cloudflare R2 (películas)..."
    );

    console.log(
        `📦 Bucket: ${r2Config.bucketName}`
    );

    console.log(
        `📄 Manifiesto: ${r2Config.manifestKey}`
    );

    r2Client = createR2Client(r2Config);

    manifestCache = validateManifest(
        await downloadJson(r2Config.manifestKey)
    );

    console.log(
        `✅ Manifiesto de películas cargado: ${Object.keys(manifestCache.movies).length} TMDB IDs`
    );
}

export async function initializeMovieCatalog() {
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = initializeCatalog();

    try {
        await initializationPromise;
    } catch (error) {
        initializationPromise = null;
        manifestCache = null;
        r2Client?.destroy();
        r2Client = null;
        r2Config = null;

        throw error;
    }
}

// ======================================================
// FRAGMENTOS
// ======================================================

async function downloadShard(key) {
    console.log(
        `📥 Descargando fragmento de películas: ${key}`
    );

    const shard = validateCatalog(
        await downloadJson(key)
    );

    return shard;
}

async function getShard(key) {
    // Caché existente: actualizar posición LRU.
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

    const promise = downloadShard(key);

    shardPromises.set(key, promise);

    try {
        const shard = await promise;

        shardCache.set(key, shard);

        // Mantener un máximo de 3 fragmentos.
        while (
            shardCache.size > MAX_CACHED_SHARDS
        ) {
            const oldestKey =
                shardCache.keys().next().value;

            shardCache.delete(oldestKey);
        }

        return shard;
    } finally {
        shardPromises.delete(key);
    }
}

// ======================================================
// OBTENER PELÍCULA POR TMDB ID
// ======================================================

async function getMovieById(tmdbId) {
    await initializeMovieCatalog();

    const id = String(tmdbId);

    // Modo local.
    if (!r2Config) {
        return localCatalogCache[id] ?? null;
    }

    // Buscar el fragmento correspondiente.
    const shardKey = manifestCache.movies[id];

    if (!shardKey) {
        return null;
    }

    const shard = await getShard(shardKey);

    return shard[id] ?? null;
}

// ======================================================
// CREDENCIALES IPTV
// ======================================================

function replaceCredentials(streamUrl, source) {
    const match = source?.match(/^lista-(\d+)$/);

    if (!match) {
        throw new Error(
            `Fuente de stream desconocida: ${source}`
        );
    }

    const listNumber = match[1];

    let user;
    let password;

    if (listNumber === "1") {
        user =
            process.env.IPTV_USER_1 ||
            process.env.IPTV_USER;

        password =
            process.env.IPTV_PASSWORD_1 ||
            process.env.IPTV_PASSWORD;
    } else {
        user =
            process.env[`IPTV_USER_${listNumber}`];

        password =
            process.env[`IPTV_PASSWORD_${listNumber}`];
    }

    if (!user || !password) {
        throw new Error(
            `Faltan las credenciales para ${source}`
        );
    }

    return streamUrl
        .replace(
            /\{user\}|%7Buser%7D/gi,
            user
        )
        .replace(
            /\{password\}|%7Bpassword%7D/gi,
            password
        );
}

// ======================================================
// PUNTUACIÓN DE STREAMS
// ======================================================

function scoreStream(stream) {
    const probe = stream.probe;

    if (probe?.ok !== true) {
        return -1000;
    }

    const codec = probe.codec_name?.toLowerCase();
    const width = probe.width || 0;
    const height = probe.height || 0;

    if (codec === "h264") {
        let score = 10000;

        const pixels = width * height;

        if (height >= 900 || width >= 1600) {
            score += 3000;
        } else if (height >= 600 || width >= 1100) {
            score += 2000;
        } else {
            score += 1000;
        }

        score += Math.min(
            pixels / 1000,
            2500
        );

        return score;
    }

    if (codec === "hevc") {
        let score = 5000;

        const pixels = width * height;

        score += Math.min(
            pixels / 1000,
            2500
        );

        return score;
    }

    if (codec === "mpeg4") {
        let score = 3000;

        const pixels = width * height;

        score += Math.min(
            pixels / 1000,
            2000
        );

        return score;
    }

    return 1000;
}

function sortStreams(streams) {
    return (Array.isArray(streams) ? streams : [])
        .filter(
            stream =>
                stream.probe?.ok === true
        )
        .sort(
            (a, b) =>
                scoreStream(b) -
                scoreStream(a)
        );
}

// ======================================================
// API PRINCIPAL
// ======================================================

export async function getMovieStream(tmdbId) {
    const movie = await getMovieById(tmdbId);

    if (!movie) {
        return null;
    }

    const sortedStreams = sortStreams(
        movie.streams
    );

    if (sortedStreams.length === 0) {
        return null;
    }

    const candidates = sortedStreams.map(
        stream => ({
            ...stream,

            streamUrl: replaceCredentials(
                stream.streamUrl,
                stream.source
            ),
        })
    );

    return {
        tmdbId: movie.tmdbId,
        title: movie.title,
        originalTitle: movie.originalTitle,
        year: movie.year,
        posterPath: movie.posterPath,
        candidates,
    };
}
