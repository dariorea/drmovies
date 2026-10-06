import { useEffect, useRef, useState } from "react"

import styles from "../Episodes/episodes.module.css"
import { TvRegion } from "../TvRegion/TvRegion"

interface Props {
    id: string | undefined
    typeUrl: string
}

const VIMEUS_VIEW_KEY = import.meta.env.VITE_VIMEUS_KEY_VIEW

export const VimeusPlayer = ({
    id,
    typeUrl
}: Props) => {

    const iframeRef = useRef<HTMLIFrameElement>(null)

    const [activated, setActivated] = useState(false)

    const videoUrl =
        `https://vimeus.com/e/${typeUrl}` +
        `?tmdb=${id}` +
        `&view_key=${VIMEUS_VIEW_KEY}` +
        `&autoplay=1`

    useEffect(() => {
        setActivated(false)
    }, [id])

    const activatePlayer = () => {
        console.log("🎬 ACTIVANDO VIMEUS")
    
        setActivated(true)
    
        setTimeout(() => {
            const iframe = iframeRef.current
    
            iframe?.focus()
    
            console.log("🎯 DIAGNÓSTICO:", {
                activeElement: document.activeElement?.tagName,
                iframeFocused: document.activeElement === iframe,
                iframeConnected: iframe?.isConnected,
                iframeSrc: iframe?.src
            })
        }, 100)
    }

    return (
        <TvRegion
            id="player"
            className={styles.reproductor}
            focusClassName="tv-focused-nav"
            autoScroll={false}
        >

            <div className={styles.titleContainer}>
                <h2>
                    Película {id}
                </h2>
            </div>

            <div className={styles.playerWrapper}>

                <iframe
                    ref={iframeRef}
                    key={id}
                    className={styles.iframe}
                    src={videoUrl}
                    width="100%"
                    height="300"
                    frameBorder="0"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="origin"
                    title={`Película ${id}`}
                    tabIndex={0}
                    data-tv-focusable
                />

                {!activated && (
                    <button
                        type="button"
                        className={styles.activateButton}
                        data-tv-focusable
                        onClick={activatePlayer}
                    >
                        ▶ Reproducir
                    </button>
                )}

            </div>

        </TvRegion>
    )
}