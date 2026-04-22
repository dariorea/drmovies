import { useState } from "react"
import type { Media } from "../../types/Movie"
import styles from "./moviedata.module.css"

interface Props {
    data: Media 
}

export const MovieData = ({data}: Props) => {

    const [expanded, setExpanded] = useState(false)
    const truncateText = (text: string, maxWords: number) => {
        const words = text.split(" ")
        if (words.length <= maxWords) return text
      
        return words.slice(0, maxWords).join(" ") + "..."
      }
    
      const date = data.release_date || data.first_air_date
      const year = date ? new Date(date).getFullYear() : "N/A"

      const logo = data.logo || data.logoFanart
    
    
    return (
        <div className={styles.container}>
            <img className={styles.movieLogo} src={`${logo}`} alt={data.title} />

            <div className={styles.section}>
                <div className={styles.movieVote}>
                    <p>{data.vote_average.toFixed(1)}</p>
                    <i className="bi bi-star-fill"></i>
                    <p> | </p>
                </div>
                <div className={styles.movieVote}>
                    <p>{year}</p>
                    <p> | </p>
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