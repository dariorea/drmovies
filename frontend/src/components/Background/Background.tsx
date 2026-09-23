import type { Media } from "../../types/Movie"
import { Button } from "../Button/Button"
import { ItemInfo } from "../itemInfo/itemInfo"
import { LogoMovie } from "../LogoMovie/LogoMovie"
import { TvRegion } from "../TvRegion/TvRegion"
import styles from "./background.module.css"


interface Props {
    data: Media
    className?: string
    action?: () => void
}

export const Background = ({data, action}: Props) => {
    const IMG_BASE = import.meta.env.VITE_TMDB_BACKGROUND_IMAGE_URL

    return (
        <div  className={styles.background} style={{
            backgroundImage: `
                linear-gradient(
                    180deg,
                    transparent 0%,
                    rgba(0, 0, 0, 1) 95%,
                    rgba(0, 0, 0, 1) 100%
                ),
                url(${IMG_BASE}${data.backdrop_path})`
            }}>
                <div className={styles.items}>
                    <LogoMovie data={data}/>
                    <ItemInfo data={data}/>
                    <TvRegion
                        id="play" 
                        type="row" 
                        className={styles.containerBtn} 
                        focusClassName="tv-focused-hero"
                    >
                            <Button color="--red" action={action}>
                                <i className="bi bi-play-fill"></i>
                                <h2>Reproducir</h2>
                            </Button>
                            <Button color="--gray" action={action}>
                                <i className="bi bi-bookmark-plus"></i>
                            </Button>
                    </TvRegion>
                </div>
                
        </div>
    )
}