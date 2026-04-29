import { useParams } from "react-router-dom"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./tvitem.module.css"
import { useFetch } from "../../hooks/useFetch"
//import type { Serie } from "../../types/Serie"
import { MovieData } from "../../components/MovieData/MovieData"
import type { Media } from "../../types/Movie"
import { Episodes } from "../../components/Episodes/Episodes"
import { ItemInfo } from "../../components/itemInfo/itemInfo"

export const TvItem = () => {

    const { id } = useParams()
    const { data, loading, error } = useFetch<Media>(`/series/${id}`)

	const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL

    if (loading) return <p>Cargando...</p>
    if (error) return <p>Error: {error.message}</p>
    if (!data) return <p><i className="bi bi-arrow-clockwise"></i></p>
    console.log(data)

    return (
        <>
            <div className={styles.containerBackground} style={{
                backgroundImage: `
                    linear-gradient(
                        to top,
                        black 10%,
                        rgba(0,0,0,0) 100%
                    ),
                    url(${IMG_BASE}${data.backdrop_path})`
                }}>
                <div className={styles.container}>
                    <div className={styles.nav}>
                        <Navbar />

                    </div>
                    <div className={styles.movieLogo}>
                        <MovieData data={data}/>
                    </div>
                    <ItemInfo data={data} />
                </div>
            </div>
      
            <Episodes data={data}/>
            
        </>
    )
}