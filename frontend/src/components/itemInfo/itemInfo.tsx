import type { Media } from "../../types/Movie"
import styles from "./iteminfo.module.css"


interface Props {
    data: Media
}


export const ItemInfo = ({data}: Props) => {
    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL 
    const date = data.release_date || data.first_air_date
    const year = date ? new Date(date).getFullYear() : "N/A"
    return (
        <div className={styles.container}>
            <div className={styles.img}>
                <img src={`${IMG_BASE}${data.poster_path}`} alt={data.name} />
            </div>
            <div className={styles.itemData}>
                <h1>{data.name}</h1>
                
                <div className={styles.section}>
                    <div className={styles.sectionVy}>
                        <div className={styles.movieVote}>
                            <i className="bi bi-star-fill"></i>
                            <p>{data.vote_average.toFixed(1)}</p>
                        </div>
                        <div className={styles.movieVote}>
                            <p>{year}</p>
                        </div>
                    </div>
        
                    <div className={styles.movieGenres}>
                        {data.genres.map(g => 
                            <p className={styles.genre}>{g.name}</p>
                        )}
                    </div>
                </div>
                <div className={styles.overview}>
                    <em>"{data.overview}"</em>
                </div>
                
                
            </div>
        </div>
    )
}