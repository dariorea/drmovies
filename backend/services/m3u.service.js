
import axios from "axios";

// ======================================================
// ATRIBUTOS M3U
// ======================================================

function extractAttribute(line, attribute) {
    const regex = new RegExp(`${attribute}="([^"]*)"`, "i");
    return line.match(regex)?.[1] ?? null;
}

// ======================================================
// AÑO
// ======================================================

function extractYear(title) {
    const match = title.match(/\((19|20)\d{2}\)/);
    return match ? Number(match[0].replace(/[()]/g, "")) : null;
}

// ======================================================
// DETECCIÓN DE PELÍCULAS CAM
// ======================================================

function isCamQuality(title) {
    return /\b(?:CAM|HDCAM|HDTS|HDTC|TS|TELESYNC|TELECINE|SCR|DVDSCR|WORKPRINT)\b/i.test(title);
}
// ======================================================
// LIMPIEZA DE TÍTULOS
// ======================================================

function cleanTitle(title) {
    return title
        // Eliminar año entre paréntesis
        .replace(/\((19|20)\d{2}\)/g, " ")

        // Eliminar etiquetas de versiones
        .replace(/\bV\d+\b/gi, " ")
        .replace(/\bVERSION\s*\d+\b/gi, " ")

        // Eliminar resoluciones
        .replace(/\b(?:2160|1440|1080|720|576|480|4K|8K)\s*P?\b/gi, " ")

        // Eliminar calidad de grabación
        .replace(/\b(?:CAM|HDCAM|HDTS|HDTC|TS|TELESYNC|TELECINE|SCR|DVDSCR|WORKPRINT)\b/gi, " ")

        // Eliminar etiquetas de idioma y audio
        .replace(/\b(?:LATINO|LAT|CAST|CASTELLANO|ESPAÑOL|ESPAÑOL\s+LATINO|DUAL|MULTI|SUBTITULADO|SUB|SUBS|DUB|DUBBED)\b/gi, " ")

        // Eliminar etiquetas técnicas frecuentes
        .replace(/\b(?:HDR|HDR10|HDR10\+|DV|DOLBY\s+VISION|ATMOS|AAC|AC3|EAC3|DTS|DDP|DD|MP3|5\.1|7\.1|2\.0)\b/gi, " ")

        // Eliminar etiquetas de calidad adicionales
        .replace(/\b(?:WEB-DL|WEBDL|WEBRIP|WEB-RIP|BLURAY|BLU-RAY|BRRIP|BDRIP|DVDRIP|HDTV|HDRIP|X264|X265|H264|H265|HEVC|AV1|PROPER|REPACK)\b/gi, " ")

        // Eliminar separadores sobrantes
        .replace(/[_|]+/g, " ")
        .replace(/\s*[-–—]\s*$/g, " ")
        .replace(/\s+/g, " ")

        .trim();
}

// ======================================================
// POSTER
// ======================================================

function extractPosterPath(logo) {
    if (!logo) return null;

    try {
        const url = new URL(logo);

        const filename = url.pathname
            .split("/")
            .pop();

        if (!filename || !/\.(jpg|jpeg|png|webp)$/i.test(filename)) {
            return null;
        }

        return `/${filename}`;

    } catch {
        return null;
    }
}

// ======================================================
// DETECCIÓN DE PELÍCULAS
// ======================================================

function isMovie(streamUrl, groupTitle) {
    const url = streamUrl.toLowerCase();

    if (url.includes("/movie/")) {
        return true;
    }

    if (
        url.includes("/series/") ||
        url.includes("/live/")
    ) {
        return false;
    }

    if (groupTitle?.toLowerCase().includes("vod")) {
        return true;
    }

    return false;
}

// ======================================================
// SANITIZACIÓN DE URL
// ======================================================

export function sanitizeStreamUrl(streamUrl) {
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

        parts[userIndex] = "{user}";
        parts[passwordIndex] = "{password}";

        url.pathname = parts.join("/");

        return url.toString();

    } catch {
        return streamUrl;
    }
}

// ======================================================
// PARSER M3U
// ======================================================

export function parseM3U(content) {
    const lines = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const movies = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line.startsWith("#EXTINF")) {
            continue;
        }

        const streamUrl = lines[i + 1];

        if (!streamUrl || streamUrl.startsWith("#")) {
            continue;
        }

        const groupTitle = extractAttribute(
            line,
            "group-title"
        );

        // Ignorar series y canales
        if (!isMovie(streamUrl, groupTitle)) {
            i++;
            continue;
        }

        const tvgName = extractAttribute(
            line,
            "tvg-name"
        );

        // Nombre visible después de la última coma
        const displayName =
            tvgName?.trim() ||
            line.substring(line.lastIndexOf(",") + 1).trim();

        if (!displayName) {
            i++;
            continue;
        }

        const poster = extractAttribute(
            line,
            "tvg-logo"
        );

// Descartar películas con calidad de grabación CAM
if (isCamQuality(displayName)) {
    console.log(`🚫 Película descartada por calidad CAM: ${displayName}`);
    i++;
    continue;
}

const year = extractYear(displayName);
const cleanedName = cleanTitle(displayName);
        if (!cleanedName) {
            i++;
            continue;
        }

        movies.push({
            name: cleanedName,
            originalName: displayName,
            year,
            posterPath: extractPosterPath(poster),
            groupTitle,
            streamUrl
        });

        // Saltar la URL procesada
        i++;
    }

    return movies;
}

// ======================================================
// DESCARGA M3U
// ======================================================

export async function downloadM3U() {
    const url = process.env.IPTV_M3U_URL;

    if (!url) {
        throw new Error(
            "Falta configurar IPTV_M3U_URL en .env"
        );
    }

    console.log("📥 Descargando lista M3U...");

    const response = await axios.get(url, {
        responseType: "text",
        timeout: 60000
    });

    return response.data;
}
