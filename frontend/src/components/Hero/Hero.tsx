import styles from "./hero.module.css"
import type { ApiResponse, Media } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"
import { ItemLogo } from "../ItemLogo/ItemLogo"
 
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
                    <div className={styles.portada} style={{backgroundImage: `url(${IMG_BASE}${movie.backdrop_path})`}}>
                    <ItemLogo data={movie}/>

                    </div>

                </div>
            ))}

 
            <div className={styles.linear} style={{
                backgroundImage: `
                    linear-gradient(
                    to top,
                    black 5%,
                    transparent 100%
                )`
                }}>
            </div>
        </div>

    )
}