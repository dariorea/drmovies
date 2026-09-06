import type { Media } from "../../types/Movie"
import styles from "./iteminfo.module.css"


interface Props {
    data: Media
}


export const ItemInfo = ({data}: Props) => {
    //const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL 
    const date = data.release_date || data.first_air_date
    const year = date ? new Date(date).getFullYear() : "N/A"
    return (
        <div className={styles.container}>
            <div className={styles.itemData}>
                <div className={styles.movieVote}>
                    <h3>{year}</h3>
                </div>
                <span>⚫</span>
                <h3>{data.genres[0]?.name}</h3>
                <span>⚫</span>                    
                <div className={styles.movieVote}>
                    <i className="bi bi-star-fill"></i>
                    <h3>{data.vote_average.toFixed(1)}</h3>
                </div>
            </div>
        </div>
    )
}