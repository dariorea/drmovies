import { useState, useRef } from "react"
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
    const playerRef = useRef<HTMLDivElement | null>(null)
    const episodeRef = useRef<HTMLDivElement | null>(null)
    
    const episodeSelector = (episode: number) => {
        setEpisode(episode)
        setTimeout(() => {
            playerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            })
        }, 100)
        
    }
    const seasonSelector = (s: number) => {
        setSeason(s)  
        setEpisode(null) // reset
        setTimeout(() => {
            episodeRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            })
        }, 100)

    }

 

    if(!data.seasons) {
        return <h1>error</h1>
    }
    const selectedSeason = data.seasons.find(
        s => s.season_number === season
    )
   
    return (
        <div className={styles.mainContainer}>
            <div className={styles.titleContainer}>
                <h2>Temporadas</h2>             
            </div>
            <div className={styles.seasonContainer}>
                {data.seasons.map(e => (
                    <div key={e.id} className={styles.seasonCard}>
                        <img 
                            onClick={() => seasonSelector(e.season_number)} 
                            src={`${IMG_BASE}${e.poster_path}`} 
                            alt={e.name} 
                        />                        
                    </div>
                ))}
            </div>
            <div ref={playerRef}>
                {season !== null && episode !== null 
                ? 
                <div className={styles.reproductor}>
                    <h2>S{season} EP: {episode}</h2>
                    <iframe className={styles.iframe} src={`https://vimeus.com/e/serie?tmdb=${id}&view_key=${VIMEUS_VIEW_KEY}&se=${season}&ep=${episode}&autoplay=1`} width="100%" height="300" frameBorder="0" allowFullScreen referrerPolicy="origin"></iframe> 
                </div>
               
                : ""
                }
            </div>
            <div ref={episodeRef}>
            {selectedSeason?.episodes? 
                    <div className={styles.titleContainer}>
                        <h2>T{season} Episodios</h2>             
                    </div> 
                    : ""
                }
            </div>
            <div className={styles.episodesContainer}>
                {selectedSeason?.episodes?.map(ep => (
                    <div key={ep.id} className={styles.episodesCard}>
                        <img
                            src={ep.still_path ? `${IMG_BASE}${ep.still_path}` : ""}
                            alt={ep.name}
                        />
                        <div onClick={() => episodeSelector(ep.episode_number)} className={styles.episodeData}>
                            <p>EP {ep.episode_number}</p>
                            <p>{ep.name}</p>
                        </div>
            
                    </div>
                ))}
            </div>
            
        </div>



    )
}