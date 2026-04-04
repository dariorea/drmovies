import { useState } from "react"
import type { Movie } from "../../types/Movie"
import styles from "./moviedata.module.css"

interface Props {
    data: Movie
}

export const MovieData = ({data}: Props) => {

    const [expanded, setExpanded] = useState(false)
    const truncateText = (text: string, maxWords: number) => {
        const words = text.split(" ")
        if (words.length <= maxWords) return text
      
        return words.slice(0, maxWords).join(" ") + "..."
      }
    const year = new Date(data.release_date).getFullYear()
    return (
        <div className={styles.container}>
            <img className={styles.movieLogo} src={`${data.logo}`} alt={data.title} />

            <div className={styles.section}>
                <div className={styles.movieVote}>
                    <h3>{data.vote_average.toFixed(1)}</h3>
                    <i className="bi bi-star-fill"></i>
                </div>
                <div className={styles.movieGenres}>
                    <p>({year})</p>
                </div>
                <div className={styles.movieGenres}>
                    <p>{data.genres.map(g => g.name).join(", ")}</p>
                </div>
            </div>
            <div className={styles.movieOverview}>
            <div className={styles.movieOverview}>
  <em>
    "
    {expanded 
      ? data.overview 
      : truncateText(data.overview, 20)
    }
    "
  </em>

  {data.overview.split(" ").length > 20 && (
    <span 
      className={styles.readMore}
      onClick={() => setExpanded(prev => !prev)}
    >
      {expanded ? " ver menos" : " ver más"}
    </span>
  )}
</div>
            </div>
        </div>
    )
}