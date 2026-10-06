import type {
    Episode
} from "../../types/Movie"

import styles from "./seriesepisodes.module.css"

interface Props {

    episode: Episode

    onSelect:
        (episodeNumber: number) => void
}


const IMG_BASE =
    import.meta.env.VITE_TMDB_IMAGE_URL


export const EpisodeCard = ({
    episode,
    onSelect
}: Props) => {

    return (
        <>
            {!episode.still_path 
                ? ""
                : <div
                data-tv-focusable
                className={
                    styles.episodesCard
                }
                onClick={() =>
                    onSelect(
                        episode.episode_number
                    )
                }
            >
                {episode.still_path
                    ? <img
                    src={
                        `${IMG_BASE}${episode.still_path}`
                    }
    
                    alt={
                        episode.name
                    }
                />
                    : ""
    
                }
                
                {episode.name
                ?<div
                    className={
                        styles.episodeData
                    }
                >
                    {!episode.still_path ? "proximamente": ""}
                    <p>
                        EP{episode.episode_number}
                    </p>
    
                    <p>
                        {episode.name}
                    </p>
    
                </div>
                : ""
                }
                
    
            </div>
            }
        
        </>

        
    )
}