import type { Media } from "../../types/Movie"
import { Button } from "../Button/Button"
import { ItemInfo } from "../itemInfo/itemInfo"
import { LogoMovie } from "../LogoMovie/LogoMovie"
import { TvRegion } from "../TvRegion/TvRegion"
import styles from "./background.module.css"


interface Props {
    data: Media
    className?: string
    optionOne: () => void
    optionTwo?: () => void
}

export const Background = ({data, optionOne, optionTwo}: Props) => {
    const IMG_BASE = import.meta.env.VITE_TMDB_BACKGROUND_IMAGE_URL

    return (
        <div  className={styles.background} style={{
            backgroundImage: `
                linear-gradient(
                    360deg,
                    rgba(0, 0, 0, 1) 0%,
                    transparent 50%,
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
                        autoScroll={false}
                        >
                            <Button action={optionOne}>
                                <i className="bi bi-play-fill"></i>
                                <h3>Opción 1</h3>
                            </Button>
                            <Button action={optionTwo}>
                                <i className="bi bi-play-fill"></i>
                                <h3>Opción 2</h3>                            
                            </Button>
                    </TvRegion>
                </div>
                
        </div>
    )
}