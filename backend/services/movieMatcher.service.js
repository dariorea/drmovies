import {
    searchMovie,
    getAlternativeTitles
} from "./tmdb.service.js";

function normalizeTitle(title) {
    return title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanProviderTags(title) {
    return title
        .replace(
            /\b(CAM|SUB|DUAL|LAT|CAST|ING|4K|FHD|HD|TS|TELESYNC|WEB-DL|WEBRIP)\b/gi,
            ""
        )
        .replace(/\s+/g, " ")
        .trim();
}

function getYear(releaseDate) {
    if (!releaseDate) {
        return null;
    }

    return Number(
        releaseDate.slice(0, 4)
    );
}

function sameTitle(titleA, titleB) {
    if (!titleA || !titleB) {
        return false;
    }

    return (
        normalizeTitle(titleA) ===
        normalizeTitle(titleB)
    );
}

function posterMatches(movie, result) {
    return Boolean(
        movie.posterPath &&
        result.poster_path &&
        movie.posterPath === result.poster_path
    );
}

function createMatch(
    result,
    method,
    confidence
) {
    return {
        matched: true,
        tmdbId: result.id,
        title: result.title,
        originalTitle: result.original_title,
        year: getYear(result.release_date),
        posterPath: result.poster_path,
        matchMethod: method,
        confidence
    };
}

function alternativeTitleMatches(
    movieTitle,
    alternative
) {
    const movieNormalized =
        normalizeTitle(movieTitle);

    const alternativeNormalized =
        normalizeTitle(alternative.title);

    // Coincidencia exacta
    if (
        movieNormalized ===
        alternativeNormalized
    ) {
        return {
            matched: true,
            confidence: 100
        };
    }

    // El título M3U está contenido dentro
    // del título alternativo
    if (
        alternativeNormalized.includes(
            movieNormalized
        )
    ) {
        return {
            matched: true,
            confidence: 92
        };
    }

    // El título alternativo está contenido
    // dentro del título M3U
    if (
        movieNormalized.includes(
            alternativeNormalized
        )
    ) {
        return {
            matched: true,
            confidence: 92
        };
    }

    return {
        matched: false
    };
}

function sortAlternativeTitles(
    alternatives
) {
    const countryPriority = {
        AR: 1,
        MX: 2,
        ES: 3,
        US: 4
    };

    return [...alternatives].sort(
        (a, b) => {
            const priorityA =
                countryPriority[
                    a.iso_3166_1
                ] ?? 99;

            const priorityB =
                countryPriority[
                    b.iso_3166_1
                ] ?? 99;

            return priorityA - priorityB;
        }
    );
}

export async function matchMovie(movie) {
    const cleanedName =
        cleanProviderTags(movie.name);

    const results = await searchMovie(
        cleanedName,
        movie.year
    );

    if (!results.length) {
        return {
            matched: false,
            reason: "no-results"
        };
    }

    // --------------------------------------------------
    // 1. POSTER EXACTO
    // --------------------------------------------------

    const posterMatch = results.find(
        result =>
            posterMatches(
                movie,
                result
            )
    );

    if (posterMatch) {
        return createMatch(
            posterMatch,
            "poster",
            100
        );
    }

    // --------------------------------------------------
    // 2. TITULO + AÑO
    // --------------------------------------------------

    if (movie.year) {
        const titleYearMatches =
            results.filter(result => {
                const resultYear =
                    getYear(
                        result.release_date
                    );

                return (
                    resultYear === movie.year &&
                    sameTitle(
                        cleanedName,
                        result.title
                    )
                );
            });

        if (
            titleYearMatches.length === 1
        ) {
            return createMatch(
                titleYearMatches[0],
                "title-year",
                95
            );
        }
    }

    // --------------------------------------------------
    // 3. TITULO ORIGINAL + AÑO
    // --------------------------------------------------

    if (movie.year) {
        const originalTitleMatches =
            results.filter(result => {
                const resultYear =
                    getYear(
                        result.release_date
                    );

                return (
                    resultYear === movie.year &&
                    sameTitle(
                        cleanedName,
                        result.original_title
                    )
                );
            });

        if (
            originalTitleMatches.length === 1
        ) {
            return createMatch(
                originalTitleMatches[0],
                "original-title-year",
                95
            );
        }
    }

    // --------------------------------------------------
    // 4. TITULOS ALTERNATIVOS + AÑO
    // --------------------------------------------------

    for (const result of results) {
        const resultYear =
            getYear(
                result.release_date
            );

        if (
            movie.year &&
            resultYear !== movie.year
        ) {
            continue;
        }

        try {
            const alternatives =
                await getAlternativeTitles(
                    result.id
                );

            const sortedAlternatives =
                sortAlternativeTitles(
                    alternatives
                );

            for (
                const alternative
                of sortedAlternatives
            ) {
                const alternativeMatch =
                    alternativeTitleMatches(
                        cleanedName,
                        alternative
                    );

                if (
                    alternativeMatch.matched
                ) {
                    return createMatch(
                        result,
                        "alternative-title",
                        alternativeMatch.confidence
                    );
                }
            }
        } catch (error) {
            console.error(
                `  ⚠️ Error obteniendo títulos alternativos de TMDB ${result.id}:`,
                error.response?.data ??
                error.message
            );
        }
    }

    // --------------------------------------------------
    // 5. TITULO EXACTO SIN AÑO
    // --------------------------------------------------

    const titleMatches =
        results.filter(result =>
            sameTitle(
                cleanedName,
                result.title
            )
        );

    if (
        titleMatches.length === 1
    ) {
        return createMatch(
            titleMatches[0],
            "title",
            85
        );
    }

    // --------------------------------------------------
    // 6. TITULO ORIGINAL SIN AÑO
    // --------------------------------------------------

    const originalTitleMatches =
        results.filter(result =>
            sameTitle(
                cleanedName,
                result.original_title
            )
        );

    if (
        originalTitleMatches.length === 1
    ) {
        return createMatch(
            originalTitleMatches[0],
            "original-title",
            85
        );
    }

    // --------------------------------------------------
    // SIN MATCH
    // --------------------------------------------------

    return {
        matched: false,
        reason: "no-confident-match",

        candidates:
            results
                .slice(0, 10)
                .map(result => ({
                    tmdbId: result.id,
                    title: result.title,
                    originalTitle:
                        result.original_title,
                    year:
                        getYear(
                            result.release_date
                        ),
                    posterPath:
                        result.poster_path
                }))
    };
}