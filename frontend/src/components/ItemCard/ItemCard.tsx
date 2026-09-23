import { Link } from "react-router-dom"
import styles from "./itemcard.module.css"

type Media = {
    id: number
    poster_path: string | null
    title?: string
    name?: string
}

interface Props {
    item: Media
    type: "movies" | "series"
}

export const ItemCard = ({ item, type }: Props) => {
    console.log("ITEM CARD:", item.id)
    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL

    const title = item.title || item.name || ""

    return (
        <Link
            to={`/${type}/${item.id}`}
            className={styles.movieCard}
            data-tv-focusable
        >
            <img
                className={styles.imgMovieCard}
                loading="lazy"
                src={`${IMG_BASE}${item.poster_path}`}
                alt={title}
            />
        </Link>
    )
}