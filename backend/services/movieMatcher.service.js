import {
    searchMovie,
    getAlternativeTitles,
    getMovieCredits
} from "./tmdb.service.js";


// ============================================================
// CACHE
// ============================================================

const searchCache = new Map();
const alternativeCache = new Map();
const creditsCache = new Map();


// ============================================================
// CONFIG
// ============================================================

const CURRENT_YEAR = new Date().getFullYear();


// ============================================================
// NORMALIZACIÓN
// ============================================================

export function normalizeTitle(title = "") {
    return String(title)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " y ")
        .replace(/['’]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}


// ============================================================
// LIMPIEZA DE TÍTULOS DEL PROVEEDOR
// ============================================================

export function cleanProviderTags(title = "") {
    let value = String(title);

    // --------------------------------------------------------
    // Correcciones de errores frecuentes del proveedor
    // --------------------------------------------------------

    value = value.replace(/\bOsuras\b/gi, "Oscuras");
    value = value.replace(/\bLaino\b/gi, "Latino");

    // --------------------------------------------------------
    // Tags técnicos / de calidad / idioma
    // --------------------------------------------------------

    const technicalTags = [
        "SUBTITULOS PEGADOS",
        "SUBTÍTULOS PEGADOS",

        "FULL HD",
        "FULLHD",
        "HD",

        "ULTRA HD",
        "ULTRAHD",

        "HDTS",
        "HDCAM",
        "CAMRIP",
        "CAM",
        "TS",
        "TELESYNC",
        "TELECINE",

        "WEB-DL",
        "WEBDL",
        "WEB DL",

        "WEBRIP",
        "WEB RIP",

        "BLURAY",
        "BLU-RAY",
        "BDRIP",
        "BRRIP",

        "DVDRIP",
        "DVD",

        "HDRIP",
        "HDTV",

        "1080P",
        "1080",
        "720P",
        "720",
        "2160P",
        "2160",
        "4K",

        "HEVC",
        "H265",
        "H.265",
        "X265",
        "H264",
        "H.264",
        "X264",

        "AAC",
        "AC3",
        "EAC3",
        "DTS",
        "DDP",
        "DD+",

        "5.1",
        "7.1",

        "LATINO",
        "LATINA",
        "CASTELLANO",
        "ESPAÑOL",
        "ESPAÑOL LATINO",
        "ES",
        "SPA",
        "SPANISH",

        "INGLES",
        "INGLÉS",
        "ENGLISH",
        "ENG",

        "SUB",
        "SUBS",
        "SUBTITULOS",
        "SUBTÍTULOS",
        "SUBTITLE",
        "SUBTITLED",

        "AUDIO",

        "DUAL AUDIO",
        "DUALAUDIO",

        "MULTIAUDIO",
        "MULTI AUDIO",

        "MULTISUB",
        "MULTI SUB",

        "PEGADOS",

        "PROPER",
        "REPACK",

        "EXTENDED",
        "EXTENDIDA",

        "REMASTERED",
        "REMASTERIZADA",

        "DIRECTORS CUT",
        "DIRECTOR'S CUT",

        "UNCUT",

        "V2",
        "V3",
        "V4",
        "V5",

        "VERSION FINAL",
        "FINAL VERSION",

        "FINAL CUT",

        "TRAILER",
        "TRAILERS"
    ];

    // Ordenamos por longitud para eliminar primero
    // expresiones compuestas como "FULL HD".
    technicalTags.sort(
        (a, b) => b.length - a.length
    );

    for (const tag of technicalTags) {
        const escaped = tag.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const regex = new RegExp(
            `(?:^|\\s)${escaped}(?=\\s|$)`,
            "gi"
        );

        value = value.replace(regex, " ");
    }

    // --------------------------------------------------------
    // Separadores repetidos
    // --------------------------------------------------------

    value = value
        .replace(/\s+/g, " ")
        .replace(/\s*[-|]+\s*$/g, "")
        .trim();

    return value;
}

// ============================================================
// FILTRO DE CALIDAD
// ============================================================
//
// Estas etiquetas indican películas grabadas en cine o
// versiones que no queremos incorporar al catálogo.
//

const REJECTED_QUALITY_TAGS = [
    "CAM",
    "CAMRIP",
    "HDCAM",
    "HDTS",
    "TS",
    "TELESYNC",
    "TELECINE"
];

export function hasRejectedQualityTag(title = "") {
    const value = String(title);

    return REJECTED_QUALITY_TAGS.some(tag => {
        const escaped = tag.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const regex = new RegExp(
            `(?:^|\\s)${escaped}(?=\\s|$)`,
            "i"
        );

        return regex.test(value);
    });
}

// ============================================================
// CORRECCIONES DE TÍTULO
// ============================================================

function correctCommonTitleTypos(title = "") {
    let value = title;

    value = value.replace(
        /\bOsuras\b/gi,
        "Oscuras"
    );

    value = value.replace(
        /\bLaino\b/gi,
        "Latino"
    );

    return value;
}


// ============================================================
// SEARCH VARIANTS
//
// IMPORTANTE:
//
// Las variantes completas se usan para hacer matching.
//
// Las partes antes/después de ":" solamente sirven para
// descubrir candidatos en TMDB.
// ============================================================

function addVariant(list, value) {
    const cleaned = String(value || "").trim();

    if (!cleaned) {
        return;
    }

    const key = normalizeTitle(cleaned);

    if (!key) {
        return;
    }

    const alreadyExists = list.some(
        item => normalizeTitle(item) === key
    );

    if (!alreadyExists) {
        list.push(cleaned);
    }
}


function createPrimarySearchVariants(name) {
    const cleaned = correctCommonTitleTypos(
        cleanProviderTags(name)
    );

    const variants = [];

    // 1. Título completo original
    addVariant(
        variants,
        cleaned
    );

    // 2. Título sin puntuación importante.
    //
    // Ejemplo:
    // Spider-Man: Sin camino a casa
    // ->
    // Spider Man Sin camino a casa
    //
    // Esto ayuda a TMDB a encontrar títulos que están
    // indexados con otra puntuación.
    addVariant(
        variants,
        cleaned.replace(
            /[:\-–—_/]+/g,
            " "
        )
    );

    // 3. Variantes de VS
    if (/\bvs\.?\b/i.test(cleaned)) {
        addVariant(
            variants,
            cleaned.replace(
                /\bvs\.?\b/gi,
                "&"
            )
        );

        addVariant(
            variants,
            cleaned.replace(
                /\bvs\.?\b/gi,
                "and"
            )
        );

        addVariant(
            variants,
            cleaned.replace(
                /\bvs\.?\b/gi,
                "y"
            )
        );
    }

    // 4. Correcciones conocidas
    addVariant(
        variants,
        cleaned.replace(
            /\bOsuras\b/gi,
            "Oscuras"
        )
    );

    addVariant(
        variants,
        cleaned.replace(
            /\bLaino\b/gi,
            "Latino"
        )
    );

    return variants;
}


export function createSearchVariants(name) {
    const primaryVariants =
        createPrimarySearchVariants(name);

    const variants = [
        ...primaryVariants
    ];

    const cleaned = correctCommonTitleTypos(
        cleanProviderTags(name)
    );

    // --------------------------------------------------------
    // Partes del título con ":"
    //
    // SOLO para búsqueda / descubrimiento.
    // Nunca se utilizan para confirmar un match exacto.
    // --------------------------------------------------------

    if (cleaned.includes(":")) {
        const parts = cleaned
            .split(":")
            .map(part => part.trim())
            .filter(Boolean);

        if (parts.length >= 2) {
            addVariant(
                variants,
                parts[0]
            );

            addVariant(
                variants,
                parts.slice(1).join(":")
            );
        }
    }

    return variants;
}


// ============================================================
// CACHE HELPERS
// ============================================================

async function cachedSearchMovie(title, year = null) {
    const key = `${normalizeTitle(title)}::${year || ""}`;

    if (searchCache.has(key)) {
        return searchCache.get(key);
    }

    const promise = searchMovie(
        title,
        year
    ).catch(error => {
        searchCache.delete(key);
        throw error;
    });

    searchCache.set(
        key,
        promise
    );

    return promise;
}


async function cachedAlternativeTitles(movieId) {
    const key = String(movieId);

    if (alternativeCache.has(key)) {
        return alternativeCache.get(key);
    }

    const promise = getAlternativeTitles(
        movieId
    ).catch(error => {
        alternativeCache.delete(key);
        throw error;
    });

    alternativeCache.set(
        key,
        promise
    );

    return promise;
}


async function cachedCredits(movieId) {
    const key = String(movieId);

    if (creditsCache.has(key)) {
        return creditsCache.get(key);
    }

    const promise = getMovieCredits(
        movieId
    ).catch(error => {
        creditsCache.delete(key);
        throw error;
    });

    creditsCache.set(
        key,
        promise
    );

    return promise;
}


// ============================================================
// HELPERS
// ============================================================

function getCandidateYear(candidate) {
    const date =
        candidate?.release_date ||
        candidate?.first_air_date ||
        null;

    if (!date) {
        return null;
    }

    const year = Number(
        String(date).slice(0, 4)
    );

    return Number.isFinite(year)
        ? year
        : null;
}


function getCandidateTitle(candidate) {
    return (
        candidate?.title ||
        candidate?.name ||
        ""
    );
}


function getCandidateOriginalTitle(candidate) {
    return (
        candidate?.original_title ||
        candidate?.original_name ||
        ""
    );
}


function getCandidatePopularity(candidate) {
    const popularity = Number(
        candidate?.popularity
    );

    return Number.isFinite(popularity)
        ? popularity
        : 0;
}


function sameTitle(a, b) {
    return normalizeTitle(a) === normalizeTitle(b);
}


function tokenSet(title) {
    return new Set(
        normalizeTitle(title)
            .split(" ")
            .filter(Boolean)
    );
}


function titleSimilarity(a, b) {
    const na = normalizeTitle(a);
    const nb = normalizeTitle(b);

    if (!na || !nb) {
        return 0;
    }

    if (na === nb) {
        return 1;
    }

    if (
        na.includes(nb) ||
        nb.includes(na)
    ) {
        return 0.85;
    }

    const aTokens = tokenSet(a);
    const bTokens = tokenSet(b);

    if (
        aTokens.size === 0 ||
        bTokens.size === 0
    ) {
        return 0;
    }

    let common = 0;

    for (const token of aTokens) {
        if (bTokens.has(token)) {
            common++;
        }
    }

    const maxTokens = Math.max(
        aTokens.size,
        bTokens.size
    );

    return common / maxTokens;
}


function bestTitleSimilarity(
    searchVariants,
    candidate
) {
    const titles = [
        getCandidateTitle(candidate),
        getCandidateOriginalTitle(candidate)
    ].filter(Boolean);

    let best = 0;

    for (const searchTitle of searchVariants) {
        for (const candidateTitle of titles) {
            best = Math.max(
                best,
                titleSimilarity(
                    searchTitle,
                    candidateTitle
                )
            );
        }
    }

    return Math.round(
        best * 100
    );
}


// ============================================================
// COMPOUND TITLE SCORE
//
// Ejemplo:
//
// Provider:
// Fall 2: Punto muerto
//
// TMDB:
// title:         Vertigo 2: Punto muerto
// originalTitle: Fall 2: Deadpoint
//
// Una parte coincide con el título original y la otra con
// el título localizado.
//
// Esto es una señal muy fuerte.
// ============================================================

function compoundTitleScore(
    primaryVariants,
    candidate
) {
    const primary = primaryVariants[0];

    if (!primary || !primary.includes(":")) {
        return 0;
    }

    const parts = primary
        .split(":")
        .map(part => part.trim())
        .filter(Boolean);

    if (parts.length < 2) {
        return 0;
    }

    const before = parts[0];
    const after = parts
        .slice(1)
        .join(" ");

    const candidateTitles = [
        getCandidateTitle(candidate),
        getCandidateOriginalTitle(candidate)
    ].filter(Boolean);

    if (candidateTitles.length === 0) {
        return 0;
    }

    let beforeBest = 0;
    let afterBest = 0;

    for (const candidateTitle of candidateTitles) {
        beforeBest = Math.max(
            beforeBest,
            titleSimilarity(
                before,
                candidateTitle
            )
        );

        afterBest = Math.max(
            afterBest,
            titleSimilarity(
                after,
                candidateTitle
            )
        );
    }

    const beforeNormalized =
        normalizeTitle(before);

    const afterNormalized =
        normalizeTitle(after);

    const beforeContained =
        candidateTitles.some(title =>
            normalizeTitle(title)
                .includes(beforeNormalized)
        );

    const afterContained =
        candidateTitles.some(title =>
            normalizeTitle(title)
                .includes(afterNormalized)
        );

    if (
        beforeContained &&
        afterContained
    ) {
        return 100;
    }

    if (
        beforeBest >= 0.80 &&
        afterBest >= 0.60
    ) {
        return 90;
    }

    if (
        beforeBest >= 0.65 &&
        afterBest >= 0.55
    ) {
        return 75;
    }

    return 0;
}


// ============================================================
// YEAR SCORE
// ============================================================

function calculateYearScore(
    movieYear,
    candidateYear
) {
    if (!movieYear || !candidateYear) {
        return 0;
    }

    if (
        Number(movieYear) ===
        Number(candidateYear)
    ) {
        return 100;
    }

    const difference = Math.abs(
        Number(movieYear) -
        Number(candidateYear)
    );

    if (difference === 1) {
        return 60;
    }

    if (difference === 2) {
        return 30;
    }

    return 0;
}


// ============================================================
// ALTERNATIVE TITLE MATCHING
// ============================================================

function getAlternativeText(alt) {
    return (
        alt?.title ||
        alt?.name ||
        ""
    );
}


export async function alternativeTitleMatches(
    primaryVariants,
    candidate
) {
    const alternatives =
        await cachedAlternativeTitles(
            candidate.id
        );

    const result = {
        score: 0,
        type: null,
        title: null
    };

    for (const alt of alternatives) {
        const altTitle =
            getAlternativeText(alt);

        if (!altTitle) {
            continue;
        }

        // ----------------------------------------------------
        // EXACTO
        //
        // Solo contra variantes completas.
        // Nunca contra "Spider-Man" extraído de:
        // Spider-Man: Sin camino a casa
        // ----------------------------------------------------

        for (const variant of primaryVariants) {
            if (
                sameTitle(
                    variant,
                    altTitle
                )
            ) {
                return {
                    score: 100,
                    type: "exact",
                    title: altTitle
                };
            }
        }
    }

    // --------------------------------------------------------
    // MATCH PARCIAL
    // --------------------------------------------------------

    for (const alt of alternatives) {
        const altTitle =
            getAlternativeText(alt);

        if (!altTitle) {
            continue;
        }

        for (const variant of primaryVariants) {
            const similarity =
                titleSimilarity(
                    variant,
                    altTitle
                );

            if (similarity >= 0.85) {
                if (
                    result.score < 95
                ) {
                    result.score = 95;
                    result.type = "strong";
                    result.title = altTitle;
                }
            } else if (similarity >= 0.70) {
                if (
                    result.score < 70
                ) {
                    result.score = 70;
                    result.type = "partial";
                    result.title = altTitle;
                }
            }
        }
    }

    return result;
}


// ============================================================
// DIRECT TITLE MATCHES
//
// MUY IMPORTANTE:
//
// Solo se usan las variantes completas.
// Las partes de ":" NO pueden producir un match directo.
// ============================================================

function directTitleMatches(
    primaryVariants,
    candidate
) {
    const candidateTitle =
        getCandidateTitle(candidate);

    const candidateOriginal =
        getCandidateOriginalTitle(candidate);

    for (const variant of primaryVariants) {
        if (
            sameTitle(
                variant,
                candidateTitle
            )
        ) {
            return true;
        }

        if (
            sameTitle(
                variant,
                candidateOriginal
            )
        ) {
            return true;
        }
    }

    return false;
}


// ============================================================
// ELEGIR ENTRE MATCHES DIRECTOS
// ============================================================

function chooseBestDirectCandidate(
    candidates,
    movieYear
) {
    if (candidates.length === 0) {
        return {
            candidate: null,
            ambiguous: false
        };
    }

    if (candidates.length === 1) {
        return {
            candidate: candidates[0],
            ambiguous: false
        };
    }

    // --------------------------------------------------------
    // 1. Si el proveedor trae año, usarlo primero.
    // --------------------------------------------------------

    if (movieYear) {
        const exactYear =
            candidates.filter(
                candidate =>
                    getCandidateYear(candidate) ===
                    Number(movieYear)
            );

        if (exactYear.length === 1) {
            return {
                candidate: exactYear[0],
                ambiguous: false
            };
        }

        if (exactYear.length > 1) {
            candidates = exactYear;
        }
    }

    // --------------------------------------------------------
    // 2. Si existen varios títulos recientes del mismo año,
    //    NO elegir automáticamente.
    //
    // Esto evita:
    //
    // La Odisea 2026
    // La odisea 2026
    //
    // donde ambas podrían ser válidas.
    // --------------------------------------------------------

    const datedCandidates =
        candidates.filter(
            candidate =>
                getCandidateYear(candidate) !== null
        );

    if (datedCandidates.length > 0) {
        const maxYear = Math.max(
            ...datedCandidates.map(
                getCandidateYear
            )
        );

        const latestCandidates =
            datedCandidates.filter(
                candidate =>
                    getCandidateYear(candidate) ===
                    maxYear
            );

        if (
            latestCandidates.length > 1 &&
            maxYear >= CURRENT_YEAR - 1
        ) {
            return {
                candidate: null,
                ambiguous: true
            };
        }

        // ----------------------------------------------------
        // Si hay una única película muy reciente con ese
        // título, preferirla.
        //
        // Ejemplo:
        // Resident Evil 2026 vs Resident Evil 2002
        // Supergirl 2026 vs Supergirl 1984
        // ----------------------------------------------------

        if (
            latestCandidates.length === 1 &&
            maxYear >= CURRENT_YEAR - 1
        ) {
            const latest =
                latestCandidates[0];

            const latestPopularity =
                getCandidatePopularity(
                    latest
                );

            const otherCandidates =
                candidates.filter(
                    candidate =>
                        candidate.id !== latest.id
                );

            const maxOtherPopularity =
                Math.max(
                    0,
                    ...otherCandidates.map(
                        getCandidatePopularity
                    )
                );

            if (
                maxOtherPopularity === 0 ||
                latestPopularity >=
                    maxOtherPopularity * 1.25
            ) {
                return {
                    candidate: latest,
                    ambiguous: false
                };
            }
        }
    }

    // --------------------------------------------------------
    // 3. Dominancia por popularidad.
    // --------------------------------------------------------

    const ranked = [...candidates].sort(
        (a, b) =>
            getCandidatePopularity(b) -
            getCandidatePopularity(a)
    );

    const best = ranked[0];
    const second = ranked[1];

    const bestPopularity =
        getCandidatePopularity(best);

    const secondPopularity =
        getCandidatePopularity(second);

    if (
        bestPopularity > 0 &&
        (
            secondPopularity === 0 ||
            bestPopularity >=
                secondPopularity * 5
        )
    ) {
        return {
            candidate: best,
            ambiguous: false
        };
    }

    return {
        candidate: null,
        ambiguous: true
    };
}


// ============================================================
// SCORE DE CANDIDATO
// ============================================================

async function scoreCandidate(
    primaryVariants,
    candidate,
    movieYear
) {
    const titleScore =
        bestTitleSimilarity(
            primaryVariants,
            candidate
        );

    const compoundScore =
        compoundTitleScore(
            primaryVariants,
            candidate
        );

    const candidateYear =
        getCandidateYear(candidate);

    const yearScore =
        calculateYearScore(
            movieYear,
            candidateYear
        );

    let alternativeScore = 0;
    let alternativeType = null;
    let alternativeTitle = null;

    // --------------------------------------------------------
    // Buscamos alternativas incluso con titleScore bajo.
    //
    // Esto es importante para:
    //
    // Las Horas mas Osuras
    //
    // donde TMDB devuelve:
    //
    // El instante más oscuro
    //
    // pero la alternativa regional es:
    //
    // Las Horas mas Oscuras
    // --------------------------------------------------------

    if (
        titleScore >= 20 ||
        compoundScore >= 60
    ) {
        try {
            const alternative =
                await alternativeTitleMatches(
                    primaryVariants,
                    candidate
                );

            alternativeScore =
                alternative.score;

            alternativeType =
                alternative.type;

            alternativeTitle =
                alternative.title;
        } catch (error) {
            console.warn(
                `⚠️ Error obteniendo alternativas de ${candidate.id}:`,
                error.message
            );
        }
    }

    // --------------------------------------------------------
    // Score final
    // --------------------------------------------------------

    const score =
        titleScore * 0.30 +
        compoundScore * 0.25 +
        yearScore * 0.20 +
        alternativeScore * 0.25;

    return {
        candidate,
        score: Math.round(score),
        titleScore,
        compoundScore,
        yearScore,
        alternativeScore,
        alternativeType,
        alternativeTitle
    };
}


// ============================================================
// CREAR MATCH
// ============================================================

function createMatch(
    candidate,
    confidence,
    matchType = "title",
    alternativeTitle = null
) {
    return {
        tmdbId: candidate.id,
        title: getCandidateTitle(candidate),
        originalTitle:
            getCandidateOriginalTitle(candidate),
        year: getCandidateYear(candidate),
        posterPath:
            candidate.poster_path || null,
        confidence,
        matchType,
        ...(alternativeTitle
            ? { alternativeTitle }
            : {})
    };
}


// ============================================================
// MATCH PRINCIPAL
// ============================================================

export async function matchMovie(
    providerTitle,
    movieYear = null
) {
       // ========================================================
    // FILTRO DE CALIDAD
    // ========================================================
    //
    // IMPORTANTE:
    // Se hace ANTES de cleanProviderTags()
    // porque cleanProviderTags() elimina las etiquetas CAM,
    // HDCAM, CAMRIP, etc.
    //

    if (hasRejectedQualityTag(providerTitle)) {
        return {
            match: null,
            reason: "rejected-quality",
            providerTitle,
            cleanedName: null,
            searchVariants: []
        };
    }

    const cleanedName =
        cleanProviderTags(
            providerTitle
        );

    const searchVariants =
        createSearchVariants(
            providerTitle
        );
    // --------------------------------------------------------
    // Variantes completas.
    //
    // Estas son las únicas que pueden confirmar un título.
    // --------------------------------------------------------

    const primaryVariants =
        createPrimarySearchVariants(
            providerTitle
        );

    if (
        !cleanedName ||
        primaryVariants.length === 0
    ) {
        return {
            match: null,
            reason: "empty-title",
            providerTitle,
            cleanedName,
            searchVariants
        };
    }

    // ========================================================
    // BUSCAR CANDIDATOS
    // ========================================================

    const candidateMap =
        new Map();

    for (const variant of searchVariants) {
        try {
            // -----------------------------------------------
            // Búsqueda con año
            // -----------------------------------------------

            if (movieYear) {
                const results =
                    await cachedSearchMovie(
                        variant,
                        movieYear
                    );

                for (const result of results) {
                    candidateMap.set(
                        result.id,
                        result
                    );
                }
            }

            // -----------------------------------------------
            // Búsqueda sin año
            //
            // Muy importante para películas futuras donde
            // TMDB puede no responder bien al filtro year.
            // -----------------------------------------------

            const results =
                await cachedSearchMovie(
                    variant
                );

            for (const result of results) {
                candidateMap.set(
                    result.id,
                    result
                );
            }
        } catch (error) {
            console.warn(
                `⚠️ Error buscando "${variant}":`,
                error.message
            );
        }
    }

    const candidates =
        [...candidateMap.values()];

    if (candidates.length === 0) {
        return {
            match: null,
            reason: "no-search-results",
            providerTitle,
            cleanedName,
            searchVariants
        };
    }

    // ========================================================
    // 1. MATCH DIRECTO
    //
    // Solo título completo.
    // ========================================================

    const directCandidates =
    candidates.filter(
        candidate =>
            directTitleMatches(
                primaryVariants,
                candidate
            )
    );

    if (directCandidates.length > 0) {
        const directResult =
            chooseBestDirectCandidate(
                directCandidates,
                movieYear
            );

        if (directResult.candidate) {
            return {
                match: createMatch(
                    directResult.candidate,
                    100,
                    "title"
                ),
                reason: "exact-title",
                providerTitle,
                cleanedName,
                searchVariants
            };
        }
    }

    // ========================================================
    // 2. SCORE DE CANDIDATOS
    // ========================================================

    // Limitamos a los candidatos más relevantes para no
    // disparar una cantidad innecesaria de consultas de
    // alternative_titles.
    const preliminaryCandidates =
        [...candidates]
            .sort(
                (a, b) =>
                    getCandidatePopularity(b) -
                    getCandidatePopularity(a)
            )
            .slice(0, 10);

    const scoredCandidates = [];

    for (const candidate of preliminaryCandidates) {
        try {
            const scored =
                await scoreCandidate(
                    primaryVariants,
                    candidate,
                    movieYear
                );

            scoredCandidates.push(
                scored
            );
        } catch (error) {
            console.warn(
                `⚠️ Error puntuando ${candidate.id}:`,
                error.message
            );
        }
    }

    // ========================================================
    // 3. ALTERNATIVE TITLE EXACTO
    //
    // Solo si el alternative title coincide con el título
    // completo del proveedor.
    // ========================================================

    const exactAlternativeMatches =
        scoredCandidates.filter(
            item =>
                item.alternativeScore === 100 &&
                item.alternativeType === "exact"
        );

    if (
        exactAlternativeMatches.length === 1
    ) {
        const best =
            exactAlternativeMatches[0];

        return {
            match: createMatch(
                best.candidate,
                100,
                "alternative-title",
                best.alternativeTitle
            ),
            reason: "exact-alternative-title",
            providerTitle,
            cleanedName,
            searchVariants
        };
    }

    if (
        exactAlternativeMatches.length > 1
    ) {
        // Se o ano resolve entre alternativas.
        if (movieYear) {
            const exactYearMatches =
                exactAlternativeMatches.filter(
                    item =>
                        getCandidateYear(
                            item.candidate
                        ) === Number(movieYear)
                );

            if (
                exactYearMatches.length === 1
            ) {
                const best =
                    exactYearMatches[0];

                return {
                    match: createMatch(
                        best.candidate,
                        100,
                        "alternative-title",
                        best.alternativeTitle
                    ),
                    reason:
                        "exact-alternative-title-year",
                    providerTitle,
                    cleanedName,
                    searchVariants
                };
            }
        }

        // No elegir arbitrariamente entre dos.
        return {
            match: null,
            reason: "ambiguous-alternative-title",
            providerTitle,
            cleanedName,
            searchVariants,
            candidates:
                exactAlternativeMatches.map(
                    item => ({
                        tmdbId:
                            item.candidate.id,
                        title:
                            getCandidateTitle(
                                item.candidate
                            ),
                        originalTitle:
                            getCandidateOriginalTitle(
                                item.candidate
                            ),
                        year:
                            getCandidateYear(
                                item.candidate
                            ),
                        popularity:
                            getCandidatePopularity(
                                item.candidate
                            ),
                        alternativeTitle:
                            item.alternativeTitle
                    })
                )
        };
    }

    // ========================================================
    // 4. MATCH COMPUESTO FUERTE
    //
    // Ejemplo:
    //
    // Fall 2: Punto muerto
    //
    // =>
    //
    // Vertigo 2: Punto muerto
    // Fall 2: Deadpoint
    // ========================================================

    const compoundMatches =
        scoredCandidates.filter(
            item =>
                item.compoundScore >= 90 &&
                (
                    item.titleScore >= 50 ||
                    item.alternativeScore >= 70
                )
        );

    if (
        compoundMatches.length === 1
    ) {
        const best =
            compoundMatches[0];

        return {
            match: createMatch(
                best.candidate,
                95,
                "compound-title",
                best.alternativeTitle
            ),
            reason: "strong-compound-title",
            providerTitle,
            cleanedName,
            searchVariants
        };
    }

    // ========================================================
    // 5. ALTERNATIVE TITLE FUERTE
    // ========================================================

    const strongAlternativeMatches =
        scoredCandidates.filter(
            item =>
                item.alternativeScore >= 95
        );

    if (
        strongAlternativeMatches.length === 1
    ) {
        const best =
            strongAlternativeMatches[0];

        return {
            match: createMatch(
                best.candidate,
                90,
                "alternative-title",
                best.alternativeTitle
            ),
            reason: "strong-alternative-title",
            providerTitle,
            cleanedName,
            searchVariants
        };
    }

    // ========================================================
    // 6. SI HABÍA VARIOS MATCHES DIRECTOS Y NO PUDIMOS
    //    RESOLVERLOS, NO DEJAR QUE EL SCORE ELIJA UNO
    //    ARBITRARIAMENTE.
    //
    // Esto es especialmente importante para:
    //
    // La Odisea
    //
    // 1368337
    // 1698863
    // ========================================================

    if (directCandidates.length > 1) {
        return {
            match: null,
            reason: "ambiguous-direct-title",
            providerTitle,
            cleanedName,
            searchVariants,
            candidates:
                directCandidates.map(
                    candidate => ({
                        tmdbId: candidate.id,
                        title:
                            getCandidateTitle(
                                candidate
                            ),
                        originalTitle:
                            getCandidateOriginalTitle(
                                candidate
                            ),
                        year:
                            getCandidateYear(
                                candidate
                            ),
                        popularity:
                            getCandidatePopularity(
                                candidate
                            )
                    })
                )
        };
    }

    // ========================================================
    // 7. MATCH ÚNICO POR SCORE
    // ========================================================

    const ranked =
        [...scoredCandidates].sort(
            (a, b) =>
                b.score - a.score
        );

    const best = ranked[0];
    const second = ranked[1];

    if (best) {
        const secondScore =
            second?.score ?? 0;

        const scoreMargin =
            best.score - secondScore;

        // Match fuerte.
        if (
            best.score >= 78 &&
            scoreMargin >= 10
        ) {
            return {
                match: createMatch(
                    best.candidate,
                    best.score,
                    best.alternativeScore >= 70
                        ? "alternative-title"
                        : "title",
                    best.alternativeTitle
                ),
                reason: "strong-score",
                providerTitle,
                cleanedName,
                searchVariants
            };
        }

        // Match muy fuerte aunque la diferencia sea menor.
        if (
            best.score >= 90 &&
            scoreMargin >= 5
        ) {
            return {
                match: createMatch(
                    best.candidate,
                    best.score,
                    best.alternativeScore >= 70
                        ? "alternative-title"
                        : "title",
                    best.alternativeTitle
                ),
                reason: "very-strong-score",
                providerTitle,
                cleanedName,
                searchVariants
            };
        }
    }

    // ========================================================
    // 8. NO CONFIDENT MATCH
    // ========================================================

    return {
        match: null,
        reason: "no-confident-match",
        providerTitle,
        cleanedName,
        searchVariants,
        candidates:
            scoredCandidates.map(
                item => ({
                    tmdbId:
                        item.candidate.id,

                    title:
                        getCandidateTitle(
                            item.candidate
                        ),

                    originalTitle:
                        getCandidateOriginalTitle(
                            item.candidate
                        ),

                    year:
                        getCandidateYear(
                            item.candidate
                        ),

                    popularity:
                        getCandidatePopularity(
                            item.candidate
                        ),

                    score:
                        item.score,

                    titleScore:
                        item.titleScore,

                    compoundScore:
                        item.compoundScore,

                    yearScore:
                        item.yearScore,

                    alternativeScore:
                        item.alternativeScore,

                    alternativeType:
                        item.alternativeType,

                    alternativeTitle:
                        item.alternativeTitle
                })
            )
    };
}


// ============================================================
// EXPORTS ADICIONALES
// ============================================================

export {
    titleSimilarity
};