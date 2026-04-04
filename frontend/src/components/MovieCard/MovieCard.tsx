import { Link } from "react-router-dom"
import styles from "./moviecard.module.css"

type Media = {
    id: number
    poster_path: string | null
    title?: string
    name?: string
}

interface Props {
    item: Media,
    type: "movies" | "series"
}

export const MovieCard = ({item, type}: Props) => {

	const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL
    const title = item.title || item.name

    return (
        <div className={styles.movieCard}>
            <Link to={`/${type}/${item.id}`}>
                <img className={styles.imgMovieCard} src={`${IMG_BASE}${item.poster_path}`} alt={item.title} />
            </Link>
            <p className={styles.titleMovieCard}>{title}</p>
        </div>
    )
}