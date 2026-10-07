import fs from "fs";

const FILE = "./data/movie-streams-all.json";

const data = JSON.parse(
    fs.readFileSync(FILE, "utf8")
);

function getCodec(stream) {
    return stream?.probe?.codec_name?.toLowerCase() || "";
}

function getWidth(stream) {
    return Number(stream?.probe?.width) || 0;
}

function getHeight(stream) {
    return Number(stream?.probe?.height) || 0;
}

function getPixels(stream) {
    return getWidth(stream) * getHeight(stream);
}

function getBitrate(stream) {
    const probe = stream?.probe;

    if (!probe) return 0;

    const videoBitrate = Number(probe.video_bit_rate) || 0;

    if (videoBitrate > 0) {
        return videoBitrate;
    }

    const formatBitrate = Number(probe.format_bit_rate) || 0;

    if (formatBitrate > 0) {
        return formatBitrate;
    }

    const size = Number(probe.size) || 0;
    const duration = Number(probe.duration) || 0;

    if (size > 0 && duration > 0) {
        return (size * 8) / duration;
    }

    return 0;
}

function getBitrateMbps(stream) {
    return getBitrate(stream) / 1_000_000;
}

function getResolutionTier(stream) {
    const width = getWidth(stream);
    const height = getHeight(stream);
    const pixels = getPixels(stream);

    if (width >= 3000 || pixels >= 7_000_000) {
        return 4;
    }

    if (width >= 1800 && height >= 700) {
        return 3;
    }

    if (width >= 1100 && height >= 600) {
        return 2;
    }

    if (width >= 700 || height >= 400) {
        return 1;
    }

    return 0;
}

function getResolutionName(stream) {
    const tier = getResolutionTier(stream);

    if (tier === 4) return "4K";
    if (tier === 3) return "1080p/Cine";
    if (tier === 2) return "720p/HD";
    if (tier === 1) return "SD";

    return "Baja";
}

function isH264(stream) {
    return getCodec(stream) === "h264";
}

function isHEVC(stream) {
    return getCodec(stream) === "hevc";
}

function isOtherCodec(stream) {
    return !isH264(stream) && !isHEVC(stream);
}

/*
============================================================
CALIDAD DEL H264
============================================================
*/

function h264Quality(stream) {
    const width = getWidth(stream);
    const height = getHeight(stream);
    const pixels = getPixels(stream);
    const bitrate = getBitrateMbps(stream);

    let score = 0;

    /*
    Resolución.

    Priorizamos claramente:
    1080p > 720p > SD
    */

    const tier = getResolutionTier(stream);

    if (tier === 4) {
        score += 4000;
    } else if (tier === 3) {
        score += 3000;
    } else if (tier === 2) {
        score += 2000;
    } else if (tier === 1) {
        score += 1000;
    }

    /*
    Resolución real.

    Esto permite diferenciar:

    1920x1080
    1920x800
    1280x720
    etc.
    */

    score += Math.min(pixels / 1000, 3500);

    /*
    Bitrate.

    El bitrate sirve principalmente para desempatar
    streams de resolución similar.
    */

    if (bitrate > 0) {
        score += Math.min(bitrate * 300, 2500);
    }

    /*
    Penalización fuerte para H264 extremadamente comprimido.
    */

    if (tier >= 3 && bitrate > 0 && bitrate < 1.0) {
        score -= 1800;
    }

    if (tier === 2 && bitrate > 0 && bitrate < 0.6) {
        score -= 1200;
    }

    if (tier <= 1 && bitrate > 0 && bitrate < 0.3) {
        score -= 800;
    }

    /*
    Evitar resoluciones absurdas.
    */

    if (width < 640 || height < 360) {
        score -= 2000;
    }

    return score;
}

/*
============================================================
COMPARAR DOS H264
============================================================
*/

function chooseH264(a, b) {
    const pixelsA = getPixels(a);
    const pixelsB = getPixels(b);

    const bitrateA = getBitrateMbps(a);
    const bitrateB = getBitrateMbps(b);

    const tierA = getResolutionTier(a);
    const tierB = getResolutionTier(b);

    /*
    1. Si están en categorías claramente diferentes,
       preferimos la resolución superior.
    */

    if (tierA > tierB) {
        return a;
    }

    if (tierB > tierA) {
        return b;
    }

    /*
    2. Misma categoría.

    Si la resolución cambia poco, el bitrate puede decidir.
    */

    const resolutionRatio =
        Math.max(pixelsA, pixelsB) /
        Math.max(1, Math.min(pixelsA, pixelsB));

    if (resolutionRatio <= 1.20) {

        if (bitrateA > 0 && bitrateB > 0) {

            const bitrateRatio =
                Math.max(bitrateA, bitrateB) /
                Math.min(bitrateA, bitrateB);

            /*
            Si uno tiene al menos 20% más bitrate,
            preferimos ese.
            */

            if (bitrateRatio >= 1.20) {
                return bitrateA > bitrateB ? a : b;
            }
        }
    }

    /*
    3. Si la resolución es significativamente distinta,
       NO dejamos que el bitrate haga bajar de resolución
       salvo que la diferencia sea enorme.
    */

    if (pixelsA !== pixelsB) {

        const higher =
            pixelsA > pixelsB ? a : b;

        const lower =
            pixelsA > pixelsB ? b : a;

        const higherBitrate =
            getBitrateMbps(higher);

        const lowerBitrate =
            getBitrateMbps(lower);

        /*
        Solamente permitimos bajar resolución si
        el stream inferior tiene muchísimo más bitrate.
        */

        if (
            higherBitrate > 0 &&
            lowerBitrate > 0 &&
            lowerBitrate >= higherBitrate * 2.5
        ) {
            return lower;
        }

        return higher;
    }

    /*
    4. Misma resolución.

    Elegimos por bitrate/calidad.
    */

    return h264Quality(a) >= h264Quality(b)
        ? a
        : b;
}

/*
============================================================
COMPARAR H264 CONTRA HEVC
============================================================
*/

function chooseH264vsHEVC(h264, hevc) {

    const h264Tier = getResolutionTier(h264);
    const hevcTier = getResolutionTier(hevc);

    const h264Pixels = getPixels(h264);
    const hevcPixels = getPixels(hevc);

    const h264Bitrate = getBitrateMbps(h264);
    const hevcBitrate = getBitrateMbps(hevc);

    /*
    REGLA PRINCIPAL:

    H264 gana por compatibilidad.

    HEVC necesita demostrar una ventaja MUY clara.
    */

    /*
    Caso 1:
    H264 es 1080p y HEVC es 4K.

    NO cambiamos automáticamente.

    Solamente dejamos pasar HEVC si el H264
    está realmente destruido por compresión.
    */

    if (
        h264Tier >= 3 &&
        hevcTier === 4
    ) {

        /*
        Un H264 1080p de >= 1.5 Mbps
        se considera suficientemente bueno.
        */

        if (
            h264Bitrate === 0 ||
            h264Bitrate >= 1.5
        ) {
            return h264;
        }

        /*
        Si el H264 1080p está por debajo de 1 Mbps,
        HEVC 4K puede ser considerado.
        */

        if (
            h264Bitrate < 1.0 &&
            hevcBitrate >= 6.0
        ) {
            return hevc;
        }

        return h264;
    }

    /*
    Caso 2:
    H264 720p vs HEVC 4K.

    Aquí sí podemos considerar HEVC,
    pero solamente si el H264 es mediocre.
    */

    if (
        h264Tier === 2 &&
        hevcTier === 4
    ) {

        if (
            h264Bitrate >= 2.0
        ) {
            return h264;
        }

        if (
            h264Bitrate > 0 &&
            h264Bitrate < 1.2 &&
            hevcBitrate >= 6.0
        ) {
            return hevc;
        }

        return h264;
    }

    /*
    Caso 3:
    H264 SD vs HEVC 4K.

    Aquí sí puede valer la pena HEVC.
    */

    if (
        h264Tier <= 1 &&
        hevcTier === 4
    ) {

        if (
            hevcBitrate >= 6.0
        ) {
            return hevc;
        }

        return h264;
    }

    /*
    Caso 4:
    HEVC y H264 tienen aproximadamente
    la misma resolución.

    H264 gana siempre por compatibilidad.
    */

    if (
        Math.abs(h264Tier - hevcTier) <= 1
    ) {
        return h264;
    }

    /*
    Caso 5:
    HEVC tiene solamente una categoría superior.

    No es suficiente para reemplazar H264.
    */

    if (hevcTier > h264Tier) {
        return h264;
    }

    return h264;
}

/*
============================================================
ELEGIR MEJOR STREAM
============================================================
*/

function selectBestStream(streams) {

    const valid = streams.filter(
        stream =>
            stream?.probe?.ok === true &&
            getCodec(stream)
    );

    if (valid.length === 0) {
        return null;
    }

    /*
    ========================================================
    1. H264
    ========================================================
    */

    const h264Streams = valid.filter(isH264);

    if (h264Streams.length > 0) {

        let bestH264 = h264Streams[0];

        for (const stream of h264Streams.slice(1)) {
            bestH264 = chooseH264(
                bestH264,
                stream
            );
        }

        /*
        ====================================================
        2. HEVC
        ====================================================
        */

        const hevcStreams =
            valid.filter(isHEVC);

        if (hevcStreams.length > 0) {

            /*
            Elegimos el mejor HEVC internamente.

            Aquí SÍ podemos usar resolución + bitrate
            porque solamente estamos comparando HEVC
            contra HEVC.
            */

            let bestHEVC =
                hevcStreams[0];

            for (const stream of hevcStreams.slice(1)) {

                const currentPixels =
                    getPixels(bestHEVC);

                const newPixels =
                    getPixels(stream);

                const currentBitrate =
                    getBitrateMbps(bestHEVC);

                const newBitrate =
                    getBitrateMbps(stream);

                if (newPixels > currentPixels) {

                    /*
                    No cambiamos por una diferencia
                    pequeña si el bitrate es muchísimo peor.
                    */

                    if (
                        currentBitrate > 0 &&
                        newBitrate > 0 &&
                        newBitrate < currentBitrate * 0.5
                    ) {
                        continue;
                    }

                    bestHEVC = stream;
                    continue;
                }

                if (
                    newPixels === currentPixels &&
                    newBitrate > currentBitrate
                ) {
                    bestHEVC = stream;
                }
            }

            /*
            Finalmente H264 vs mejor HEVC.
            */

            return chooseH264vsHEVC(
                bestH264,
                bestHEVC
            );
        }

        /*
        No hay HEVC.
        */

        return bestH264;
    }

    /*
    ========================================================
    3. Si NO hay H264
    ========================================================
    */

    const hevcStreams =
        valid.filter(isHEVC);

    if (hevcStreams.length > 0) {

        let bestHEVC =
            hevcStreams[0];

        for (const stream of hevcStreams.slice(1)) {

            const currentPixels =
                getPixels(bestHEVC);

            const newPixels =
                getPixels(stream);

            const currentBitrate =
                getBitrateMbps(bestHEVC);

            const newBitrate =
                getBitrateMbps(stream);

            if (newPixels > currentPixels) {
                bestHEVC = stream;
            } else if (
                newPixels === currentPixels &&
                newBitrate > currentBitrate
            ) {
                bestHEVC = stream;
            }
        }

        return bestHEVC;
    }

    /*
    ========================================================
    4. Otros codecs
    ========================================================

    Si no hay H264 ni HEVC, elegimos el de mayor
    resolución, pero SIN permitir que un codec raro
    desplace H264 (porque aquí ya sabemos que no existe).
    */

    return valid.sort(
        (a, b) => {

            const pixelsA = getPixels(a);
            const pixelsB = getPixels(b);

            if (pixelsA !== pixelsB) {
                return pixelsB - pixelsA;
            }

            return (
                getBitrate(b) -
                getBitrate(a)
            );
        }
    )[0];
}

/*
============================================================
SELECTOR ACTUAL

Reproduce exactamente el comportamiento del selector
anterior de producción.

Esto es importante para que la comparación sea real.
============================================================
*/

function oldScoreStream(stream) {

    const probe = stream.probe;

    if (probe?.ok !== true) {
        return -1000;
    }

    const codec =
        probe.codec_name?.toLowerCase();

    const width =
        probe.width || 0;

    const height =
        probe.height || 0;

    if (codec === "h264") {

        let score = 10000;

        const pixels =
            width * height;

        if (
            height >= 900 ||
            width >= 1600
        ) {
            score += 3000;

        } else if (
            height >= 600 ||
            width >= 1100
        ) {
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

        const pixels =
            width * height;

        score += Math.min(
            pixels / 1000,
            2500
        );

        return score;
    }

    if (codec === "mpeg4") {

        let score = 3000;

        const pixels =
            width * height;

        score += Math.min(
            pixels / 1000,
            2000
        );

        return score;
    }

    return 1000;
}

function selectCurrentStream(streams) {

    return streams
        .filter(
            stream =>
                stream?.probe?.ok === true
        )
        .sort(
            (a, b) =>
                oldScoreStream(b) -
                oldScoreStream(a)
        )[0] || null;
}

/*
============================================================
DESCRIPCIÓN
============================================================
*/

function describeStream(stream) {

    if (!stream) {
        return null;
    }

    const width =
        getWidth(stream);

    const height =
        getHeight(stream);

    const codec =
        getCodec(stream);

    const bitrate =
        getBitrateMbps(stream);

    return {
        source: stream.source,
        codec,
        resolution:
            `${width}x${height}`,
        tier:
            getResolutionName(stream),
        bitrate:
            bitrate > 0
                ? `${bitrate.toFixed(2)} Mbps`
                : "N/A"
    };
}

/*
============================================================
MOTIVO DEL CAMBIO
============================================================
*/

function getReason(current, nuevo) {

    const currentCodec =
        getCodec(current);

    const newCodec =
        getCodec(nuevo);

    const currentPixels =
        getPixels(current);

    const newPixels =
        getPixels(nuevo);

    const currentBitrate =
        getBitrateMbps(current);

    const newBitrate =
        getBitrateMbps(nuevo);

    if (
        currentCodec !== newCodec
    ) {

        if (
            newCodec === "hevc" &&
            currentCodec === "h264"
        ) {
            return "HEVC aceptado porque H264 tiene calidad insuficiente";
        }

        if (
            newCodec === "h264" &&
            currentCodec === "hevc"
        ) {
            return "H264 preferido por compatibilidad";
        }

        return `Cambio de codec: ${currentCodec} → ${newCodec}`;
    }

    if (
        newCodec === "h264" &&
        currentCodec === "h264"
    ) {

        if (
            newPixels > currentPixels &&
            newBitrate >= currentBitrate * 0.8
        ) {
            return "H264 con mayor resolución y bitrate suficiente";
        }

        if (
            newPixels === currentPixels &&
            newBitrate > currentBitrate
        ) {
            return "H264 misma resolución con mayor bitrate";
        }

        return "H264 de mejor calidad general";
    }

    if (
        newPixels > currentPixels
    ) {
        return "Mayor resolución";
    }

    if (
        newBitrate > currentBitrate
    ) {
        return "Mayor bitrate";
    }

    return "Mejor calidad general";
}

/*
============================================================
ANÁLISIS
============================================================
*/

let analyzed = 0;
let multipleStreams = 0;
let changed = 0;

const changes = [];

for (const [tmdbId, movie] of Object.entries(data)) {

    analyzed++;

    const streams =
        Array.isArray(movie.streams)
            ? movie.streams
            : [];

    if (streams.length <= 1) {
        continue;
    }

    multipleStreams++;

    /*
    IMPORTANTE:

    "current" ahora reproduce exactamente
    el selector viejo de producción.
    */

    const current =
        selectCurrentStream(streams);

    const nuevo =
        selectBestStream(streams);

    if (!current || !nuevo) {
        continue;
    }

    const currentUrl =
        current.streamUrl || "";

    const newUrl =
        nuevo.streamUrl || "";

    if (currentUrl !== newUrl) {

        changed++;

        changes.push({
            tmdbId,
            title: movie.title,
            current,
            nuevo
        });
    }
}

/*
============================================================
MOSTRAR CAMBIOS
============================================================
*/

for (const item of changes) {

    console.log(
        "\n" +
        "=".repeat(60)
    );

    console.log(
        `${item.tmdbId} - ${item.title}`
    );

    console.log("\n🔵 ACTUAL:");

    console.log(
        describeStream(item.current)
    );

    console.log("\n🟢 V8:");

    console.log(
        describeStream(item.nuevo)
    );

    console.log(
        `\n💡 MOTIVO: ${getReason(
            item.current,
            item.nuevo
        )}`
    );
}

/*
============================================================
RESUMEN
============================================================
*/

console.log("\n");

console.log(
    "=".repeat(60)
);

console.log(
    "RESUMEN V8"
);

console.log(
    "=".repeat(60)
);

console.log(
    `Películas analizadas: ${analyzed}`
);

console.log(
    `Películas con múltiples streams: ${multipleStreams}`
);

console.log(
    `Películas donde cambia la elección: ${changed}`
);

console.log(
    "=".repeat(60)
);