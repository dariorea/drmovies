import axios from "axios";

export const getSeries = async (req, res) => {

    try {
        const url = `https://api.themoviedb.org/3/trending/tv/day?language=es-ES&page=1&region=US&api_key=${process.env.TMDB_API_KEY}`
        const result = await axios.get(url)
        const data = result.data

        res.json(data)
    } catch (error) {
        res.json({mensaje: "error al pedir las series", error: error})
    }
}

export const getRecommendationsSeries = async (req, res) => {
    const { id } = req.params;

    try {
        const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${id}/recommendations?language=es-ES&api_key=${process.env.TMDB_API_KEY}`)
        const data = await tmdbRes.data
        res.json(data)
    } catch (error) {
        res.status(500).json({ mensaje: "Error al pedir las peliculas", error: error.message });
    }
}

export const getSerieID = async (req, res) => {
    const { id } = req.params;
    const API_KEY = process.env.TMDB_API_KEY;

    try {
        // 🔹 1. Traer serie base
        const { data } = await axios.get(
            `https://api.themoviedb.org/3/tv/${id}`,
            {
                params: {
                    api_key: API_KEY,
                    language: "es-ES",
                },
            }
        );

        // 🔹 2. Obtener logo desde TMDB
        let logo = null;

        try {
            const { data: imagesData } = await axios.get(
                `https://api.themoviedb.org/3/tv/${id}/images`,
                {
                    params: {
                        api_key: API_KEY,
                        language: "es-ES",
                        include_image_language: "es,null",
                    },
                }
            );

            const logos = imagesData?.logos || [];

            // Prioridad: español → sin idioma
            const logoEs = logos.find(
                (logo) => logo.iso_639_1 === "es"
            );

            const logoNull = logos.find(
                (logo) => logo.iso_639_1 === null
            );

            const selectedLogo = logoEs || logoNull;

            if (selectedLogo) {
                logo = `https://image.tmdb.org/t/p/w500${selectedLogo.file_path}`;
            }
        } catch (error) {
            console.log("No logo found in TMDB");
        }

        // 🔹 3. Traer TODAS las temporadas con episodios
        const seasonsWithEpisodes = await Promise.all(
            data.seasons.map(async (season) => {
                try {
                    const { data: seasonData } = await axios.get(
                        `https://api.themoviedb.org/3/tv/${id}/season/${season.season_number}`,
                        {
                            params: {
                                api_key: API_KEY,
                                language: "es-ES",
                            },
                        }
                    );

                    return seasonData;
                } catch {
                    return null;
                }
            })
        );

        // 🔹 4. Limpiar temporadas que fallaron
        const cleanSeasons = seasonsWithEpisodes.filter(Boolean);

        // 🔹 5. Respuesta final
        res.json({
            ...data,
            logo,
            seasons: cleanSeasons,
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Error al obtener serie completa",
        });
    }
};


export const getSeriesByGenre = async (req, res) => {
    try { 
       const { genreId } = req.params;
        const page = Number(req.query.page) || 1; if (!genreId) {
           return res.status(400).json({ message: "El ID del género es obligatorio" }); 
       } 
       const response = await axios.get( "https://api.themoviedb.org/3/discover/tv",
        { 
           params: { api_key: process.env.TMDB_API_KEY, language: "es-ES", page, with_genres: genreId, sort_by: "popularity.desc" }
        } ); 
        return res.status(200).json(response.data); 
       } catch (error) { 
           console.error("Error al obtener películas por género:", error); 
           return res.status(500).json({ message: "Error al obtener películas por género" });
        } 
   };