import axios from "axios";


//Trae 20 peliculas
export const getMovies = async (req, res)=> {
    try {
        const url = `https://api.themoviedb.org/3/movie/now_playing?language=es-ES&page=1&region=AR&api_key=${process.env.TMDB_API_KEY}`;
        const result = await axios.get(url)
        const data = result.data
        res.json(data)
    } catch (error) {
        res.json({mensaje: "error", error: error})
    }
}
//Trae la pelicula por ID
export const getMovieID = async (req, res) => {
    const { id } = req.params;

    const TMDB_KEY = process.env.TMDB_API_KEY;
    const FANART_KEY = process.env.FANART_KEY;
    
    try {
      // 1️⃣ Obtener película desde TMDB por ID
        const tmdbRes = await axios.get(
            `https://api.themoviedb.org/3/movie/${id}`,
            {
                params: {
                api_key: TMDB_KEY,
                language: "es-ES",
            },
        });

        const movie = tmdbRes.data;
        //2️⃣ Obtener logos desde Fanart
        let logo = null;

        try {
            const fanartRes = await axios.get(
                `https://webservice.fanart.tv/v3.2/movies/${id}`,
            {
                params: {
                api_key: FANART_KEY,
            },
        });

        // Prioridad de logos
        if (fanartRes.data?.hdmovielogo?.length) {
            logo = fanartRes.data.hdmovielogo[0].url;
        }

        } catch (error) {
            console.log("No logo found in Fanart");
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
//Trae 20 peliculas y podemos pedir 20 mas las veces que queramos
export const getAllMovies = async (req, res) => {
    const { page = 1 } = req.query; // valor por defecto: 1

    try {
        const url = `https://api.themoviedb.org/3/movie/now_playing?language=es-ES&page=${page}&api_key=${process.env.TMDB_API_KEY}`;
        const result = await axios.get(url);
        const data = result.data
        res.json(data);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al pedir las series", error: error.message });
    }
};