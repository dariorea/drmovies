import axios from "axios";

function extractAttribute(line, attribute) {
    const regex = new RegExp(`${attribute}="([^"]*)"`, "i");
    return line.match(regex)?.[1] ?? null;
}

function extractYear(title) {
    const match = title.match(/\((\d{4})\)/);
    return match ? Number(match[1]) : null;
}

function cleanTitle(title) {
    return title
        .replace(/\(\d{4}\)/g, "")
        .trim();
}

function extractPosterPath(logo) {
    if (!logo) return null;

    try {
        const url = new URL(logo);

        const match = url.pathname.match(
            /\/([^/]+\.(?:jpg|jpeg|png|webp))$/i
        );

        return match ? `/${match[1]}` : null;
    } catch {
        return null;
    }
}

function isMovie(streamUrl, groupTitle) {
    // VOD de películas
    if (streamUrl.includes("/movie/")) {
        return true;
    }

    // Series
    if (streamUrl.includes("/series/")) {
        return false;
    }

    // TV en vivo
    if (streamUrl.includes("/live/")) {
        return false;
    }

    // Algunos proveedores identifican VOD solamente
    // mediante el nombre del grupo.
    if (groupTitle?.toLowerCase().includes("vod")) {
        return true;
    }

    return false;
}

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

        // Ignoramos series y canales
        if (!isMovie(streamUrl, groupTitle)) {
            i++;
            continue;
        }

        const tvgName = extractAttribute(
            line,
            "tvg-name"
        );

        const displayName =
            tvgName ??
            line.substring(
                line.lastIndexOf(",") + 1
            ).trim();

        const poster = extractAttribute(
            line,
            "tvg-logo"
        );

        const year = extractYear(displayName);

        movies.push({
            name: cleanTitle(displayName),
            year,
            posterPath: extractPosterPath(poster),
            groupTitle,
            streamUrl
        });

        // Saltamos la URL que acabamos de procesar
        i++;
    }

    return movies;
}

export async function downloadM3U() {

    const url = process.env.IPTV_M3U_URL;

    if (!url) {
        throw new Error(
            "Falta configurar IPTV_M3U_URL en .env"
        );
    }

    console.log("📥 Descargando lista M3U...");

    const response = await axios.get(url, {
        responseType: "text"
    });

    return response.data;
}