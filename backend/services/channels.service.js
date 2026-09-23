import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHANNELS_FILE = path.join(
    __dirname,
    "../data/channels.m3u"
);

function extractAttribute(line, attribute) {
    const regex = new RegExp(
        `${attribute}="([^"]*)"`,
        "i"
    );

    return line.match(regex)?.[1] ?? null;
}

function createChannelId(name, index) {
    return (
        name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, "-")
            .replace(/^-|-$/g, "")
        || `channel-${index}`
    );
}

function parseChannels(content) {
    const lines = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const channels = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line.startsWith("#EXTINF")) {
            continue;
        }

        const streamUrl = lines[i + 1];

        if (
            !streamUrl ||
            streamUrl.startsWith("#")
        ) {
            continue;
        }

        const tvgId = extractAttribute(
            line,
            "tvg-id"
        );

        const tvgName = extractAttribute(
            line,
            "tvg-name"
        );

        const tvgLogo = extractAttribute(
            line,
            "tvg-logo"
        );

        const groupTitle = extractAttribute(
            line,
            "group-title"
        );

        const displayName =
            tvgName ??
            line.substring(
                line.lastIndexOf(",") + 1
            ).trim();

        channels.push({
            id: createChannelId(
                displayName,
                channels.length
            ),
            tvgId,
            name: displayName,
            logo: tvgLogo,
            group: groupTitle,
            streamUrl
        });

        i++;
    }

    return channels;
}

export async function getChannels() {
    const content = await fs.readFile(
        CHANNELS_FILE,
        "utf8"
    );

    return parseChannels(content);
}

export async function getChannelById(id) {
    const channels = await getChannels();

    return (
        channels.find(
            channel => channel.id === id
        ) ?? null
    );
}