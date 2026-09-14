import axios from "axios";

const cache = new Map()

export const getMovies = async (req, res) => {
    const cacheKey = "now_playing"

    // Buscar en cache
    if (cache.has(cacheKey)) {
        return res.json(cache.get(cacheKey))
    }

    try {
        const url = `https://api.themoviedb.org/3/movie/now_playing?language=es-ES&page=1&region=AR&api_key=${process.env.TMDB_API_KEY}`

        const result = await axios.get(url)
        const data = result.data

        // Obtener logos de todas las películas
        const moviesWithLogos = await Promise.all(
            data.results.map(async (movie) => {

                try {
                    const imagesRes = await axios.get(
                        `https://api.themoviedb.org/3/movie/${movie.id}/images`,
                        {
                            params: {
                                api_key: process.env.TMDB_API_KEY,
                                language: "es-ES",
                                include_image_language: "es, en, null",
                            },
                        }
                    );
        
                    const logos = imagesRes.data?.logos;
        
                   // Prioridad: español → sin idioma
                   const logoEs = logos.find(
                    (logo) => logo.iso_639_1 === "es"
                );
                const logoEn = logos.find( (logo) => logo.iso_639_1 === "en" );
        
                const logoNull = logos.find(
                    (logo) => logo.iso_639_1 === null
                );
        
                const selectedLogo = logoEs || logoEn || logoNull;

                    return {
                        ...movie,
                        logo: selectedLogo
                            ? `https://image.tmdb.org/t/p/w500${selectedLogo.file_path}`
                            : null
                    }

                } catch (error) {

                    console.log(
                        `No se pudo obtener el logo de ${movie.id}`
                    )

                    return {
                        ...movie,
                        logo: null
                    }
                }
            })
        )

        const response = {
            ...data,
            results: moviesWithLogos
        }

        // Guardar en cache
        cache.set(cacheKey, response)

        res.json(response)

    } catch (error) {

        console.error(error)

        res.status(500).json({
            mensaje: "Error al obtener películas",
            error: error.message
        })
    }
}

export const getRecommendationsMovies = async (req, res) => {
    const { id } = req.params;
    try {
        const tmdbRes = await axios.get(`https://api.themoviedb.org/3/movie/${id}/recommendations?language=es-ES&api_key=${process.env.TMDB_API_KEY}`)
        const data = await tmdbRes.data
        res.json(data)
    } catch (error) {
        res.status(500).json({ mensaje: "Error al pedir las peliculas", error: error.message });
    }
}

export const getAllMovies = async (req, res) => {
    const { page = 1 } = req.query; // valor por defecto: 1

    try {
        const url = `https://api.themoviedb.org/3/movie/now_playing?language=es-ES&page=${page}&api_key=${process.env.TMDB_API_KEY}`;
        const result = await axios.get(url);
        const data = result.data
        res.json(data);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al pedir las peliculas", error: error.message });
    }
};

export const getMovieID = async (req, res) => {
    const { id } = req.params;

    try {
        // 1️⃣ Obtener película desde TMDB
        const tmdbRes = await axios.get(
            `https://api.themoviedb.org/3/movie/${id}`,
            {
                params: {
                    api_key: process.env.TMDB_API_KEY,
                    language: "es-ES",
                },
            }
        );

        const movie = tmdbRes.data;

        // 2️⃣ Obtener imágenes y logos desde TMDB
        let logo = null;

        try {
            const imagesRes = await axios.get(
                `https://api.themoviedb.org/3/movie/${id}/images`,
                {
                    params: {
                        api_key: process.env.TMDB_API_KEY,
                        language: "es-ES",
                        include_image_language: "es, en, null",
                    },
                }
            );

            const logos = imagesRes.data?.logos;

           // Prioridad: español → sin idioma
           const logoEs = logos.find(
            (logo) => logo.iso_639_1 === "es"
        );
        const logoEn = logos.find( (logo) => logo.iso_639_1 === "en" );

        const logoNull = logos.find(
            (logo) => logo.iso_639_1 === null
        );

        const selectedLogo = logoEs || logoEn || logoNull;

        if (selectedLogo) {
            logo = `https://image.tmdb.org/t/p/w500${selectedLogo.file_path}`;
        }
        } catch (error) {
            console.log("No logo found in TMDB");
        }

        // 3️⃣ Respuesta final
        res.json({
            ...movie,
            logo,
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Error al obtener la película",
        });
    }
};


export const getMoviesByGenre = async (req, res) => {
     try { 
        const { genreId } = req.params;
         const page = Number(req.query.page) || 1; if (!genreId) {
            return res.status(400).json({ message: "El ID del género es obligatorio" }); 
        } 
        const response = await axios.get( "https://api.themoviedb.org/3/discover/movie",
         { 
            params: { api_key: process.env.TMDB_API_KEY, language: "es-ES", page, with_genres: genreId, sort_by: "popularity.desc" }
         } ); 
         return res.status(200).json(response.data); 
        } catch (error) { 
            console.error("Error al obtener películas por género:", error); 
            return res.status(500).json({ message: "Error al obtener películas por género" });
         } 
    };