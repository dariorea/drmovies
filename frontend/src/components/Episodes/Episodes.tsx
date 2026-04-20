import { useState } from "react"
import type { Media } from "../../types/Movie"
import styles from "./episodes.module.css"
import { useParams } from "react-router-dom"


interface Props {
    data: Media
}

export const Episodes = ({data}: Props) => {
    const {id} = useParams()
    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL
    const VIMEUS_VIEW_KEY = import.meta.env.VITE_VIMEUS_KEY_VIEW    
    const [season, setSeason] = useState<number | null>(null)
    const [episode, setEpisode] = useState<number | null>(null)
    
    const episodeSelector = (episode: number) => {
        setEpisode(episode)
    }
    const seasonSelector = (s: number) => {
        setSeason(s)  
    }

   
    if(!data.seasons) {
        return <h1>error</h1>
    }
    return (
        <div className={styles.mainContainer}>
            <div className={styles.titleContainer}>
                <h1>Temporadas</h1>             
            </div>
            <div className={styles.seasonContainer}>
                {data.seasons.map(e => (
                    <div key={e.id} className={styles.seasonCard}>
                        <img onClick={() => seasonSelector(e.season_number)} src={`${IMG_BASE}${e.poster_path}`} alt={e.name} />                        
                        <p>{e.name}</p>
                    </div>
                    

                ))}
            </div>
            <div>
                {data.seasons.map(e => 
                    <div key={e.id} className={ season === e.season_number ? styles.episodesContainer : styles.desactive} >
                        {e.episodes.map(ep => 
                            <div key={ep.id} className={styles.episodesCard}>
                                <img onClick={() => episodeSelector(ep.episode_number)} src={`${IMG_BASE}${ep.still_path}`} alt={ep.name} />
                                <p>capitulo {ep.episode_number}</p>
                            </div>
                        )}
                    </div>  
                )}
            </div>

            <div>
                {season !== null && episode !== null ? <iframe className={styles.iframe} src={`https://vimeus.com/e/serie?tmdb=${id}&view_key=${VIMEUS_VIEW_KEY}&se=${season}&ep=${episode}`} width="100%" height="600" frameBorder="0" allowFullScreen referrerPolicy="origin"></iframe> : ""}
            </div>
            
        </div>



    )
}