import styles from "./hero.module.css"
import type { ApiResponse, Media } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"

interface Props {
    url: string
    className : string
}
//HUNTC-583

export const Hero = ({url, className}: Props) => {
    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL
    const { data, loading, error } = useFetch<ApiResponse<Media>>(url)

    if (loading) return <p>Cargando...</p>
    if (error) return <p>Error: {error.message}</p>
    
    return (
        <div className={className}>
            {data?.results.map(movie => (
                <div key={movie.id}>
                    <div className={styles.portada} style={{
                        backgroundImage: `
                            url(${IMG_BASE}${movie.backdrop_path})`
                        }}>
                    </div>
                </div>
                
            ))}
        </div>

    )
}