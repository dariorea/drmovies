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
//export const getSerieID = async (req, res) => {
//    const { id } = req.params
//    const API_KEY = process.env.TMDB_API_KEY
//  
//    try {
//      // 🔹 1. Pedimos datos base de TMDB
//      const { data } = await axios.get(
//        `https://api.themoviedb.org/3/tv/${id}`,
//        {
//          params: {
//            api_key: API_KEY,
//            language: "es-ES",
//            region: "AR"
//          }
//        }
//      )
//  
//      // 🔹 2. Obtener TVDB ID
//      const tvdbId = await getTVDBId(id)
//  
//      // 🔹 3. Obtener logo (solo si existe TVDB ID)
//      const logoFanart = tvdbId ? await getFanartLogo(tvdbId) : null
//  
//      // 🔹 4. Respuesta final
//      res.json({
//        ...data,
//        logoFanart
//      })
//  
//    } catch (error) {
//      res.status(500).json({
//        message: "Error al pedir la serie"
//      })
//    }
//  }



  const getTVDBId = async (tmdbId) => {
    try {
      const { data } = await axios.get(
        `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY
          }
        }
      )
  
      return data.tvdb_id || null
  
    } catch {
      return null
    }
  }




const getFanartLogo = async (tvdbId) => {
  try {
    const { data } = await axios.get(
      `https://webservice.fanart.tv/v3.2/tv/${tvdbId}`,
      {
        params: {
          api_key: process.env.FANART_KEY
        }
      }
    )

    return data.hdtvlogo?.[0]?.url || null

  } catch {
    return null
  }
}

export const getSerieID = async (req, res) => {
  const { id } = req.params
  const API_KEY = process.env.TMDB_API_KEY

  try {
    // 🔹 1. traer serie base
    const { data } = await axios.get(
      `https://api.themoviedb.org/3/tv/${id}`,
      {
        params: {
          api_key: API_KEY,
          language: "es-ES",
        },
      }
    )
    
      // 🔹 2. Obtener TVDB ID
      const tvdbId = await getTVDBId(id)
  
      // 🔹 3. Obtener logo (solo si existe TVDB ID)
      const logoFanart = tvdbId ? await getFanartLogo(tvdbId) : null

    // 🔹 2. traer TODAS las temporadas con episodios
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
          )

          return seasonData // ya incluye episodes
        } catch {
          return null
        }
      })
    )

    // 🔹 3. limpiar nulls
    const cleanSeasons = seasonsWithEpisodes.filter(Boolean)

    // 🔹 4. respuesta final
    res.json({
      ...data,
      logoFanart,
      seasons: cleanSeasons
    })

  } catch (error) {
    res.status(500).json({
      message: "Error al obtener serie completa"
    })
  }
}