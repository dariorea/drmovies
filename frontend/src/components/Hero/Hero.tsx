import styles from "./hero.module.css"
import type { ApiResponse, Media } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"
import { Link } from "react-router-dom"

interface Props {
    url: string}
//HUNTC-583

export const Hero = ({url}: Props) => {
    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL
    const { data, loading, error } = useFetch<ApiResponse<Media>>(url)

    if (loading) return <div></div>
    if (error) return <p>Error: {error.message}</p>
    
    return (
        <div className={styles.containerHero}>
            {data?.results.map(movie => (
                <div className={styles.slide}  key={movie.id}>
                    <div
                        className={styles.portada}
                        style={{
                            backgroundImage: `
                                linear-gradient(
                                    to top,
                                    black 1%,
                                    transparent 60%,
                                    transparent 100%
                                ),
                                url(${IMG_BASE}${movie.backdrop_path})
                            `
                        }}>
                        <div className={styles.nameHero}>
                            <h1>{movie.title}</h1>
                            <Link to={`/movies/${movie.id}`} className={styles.btnWatch}>
                                <i className="bi bi-play-fill"></i>
                                <span>Ver ahora</span>
                            </Link>
                        </div>

                    </div>
                </div>
            ))}
        </div>

    )
}