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