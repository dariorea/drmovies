import axios from "axios";

export const searchItem = async (req, res) => {
    const { query } = req.query
    try {
        const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&language=es-ES&api_key=${process.env.TMDB_API_KEY}`
        const result = await axios.get(url)
        const data = result.data
        res.json(data)
    } catch (error) {
        res.json({mensaje: "No hay resultados", error: error})
    }
}
