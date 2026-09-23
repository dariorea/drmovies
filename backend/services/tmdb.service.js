import axios from "axios";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function getConfig() {
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
        throw new Error(
            "Falta configurar TMDB_API_KEY en .env"
        );
    }

    return {
        params: {
            api_key: apiKey
        }
    };
}

export async function searchMovie(title, year = null) {
    const config = getConfig();

    const params = {
        ...config.params,
        query: title,
        language: "es-ES",
        include_adult: false
    };

    if (year) {
        params.year = year;
    }

    const response = await axios.get(
        `${TMDB_BASE_URL}/search/movie`,
        { params }
    );

    return response.data.results;
}

export async function getAlternativeTitles(movieId) {
    const config = getConfig();

    const response = await axios.get(
        `${TMDB_BASE_URL}/movie/${movieId}/alternative_titles`,
        config
    );

    return response.data.titles ?? [];
}