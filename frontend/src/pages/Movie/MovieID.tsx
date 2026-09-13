import { useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./moviepage.module.css"
import { useFetch } from "../../hooks/useFetch"
import type { Movie } from "../../types/Movie"
import { ItemInfo } from "../../components/itemInfo/itemInfo"
import { Background } from "../../components/Background/Background"
import { Button } from "../../components/Button/Button"
import { Preload } from "../../components/Preload/Preload"
import { Footer } from "../../components/Footer/Footer"
import { ContentSection } from "../../components/ContentSection/ContentSection"
import { LogoMovie } from "../../components/LogoMovie/LogoMovie"

export const MovieID = () => {
    const [isActive, setIsActive] = useState(false)
    const playerRef = useRef<HTMLDivElement | null>(null)

    const { id } = useParams()
    const { data, loading, error } = useFetch<Movie>(`/movies/${id}`)


	//const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL
    const VIMEUS_VIEW_KEY = import.meta.env.VITE_VIMEUS_KEY_VIEW

    if (loading) return <Preload />
    if (error) return <p>Error: {error.message}</p>
    if (!data) return  <Preload />
        console.log(data)


    const change = () => {
        setIsActive(true)


    // scroll hacia el reproductor
    setTimeout(() => {
        playerRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        })
    }, 100)
    }

    return (
        <>

            <div className={styles.nav}>
                <Navbar />
            </div>
            <Background className={styles.containerBackground} data={data}/>
            <div className={styles.container}>
                <LogoMovie data={data}/>
                <ItemInfo data={data} />
                <div className={styles.containerBtn}>
                    <Button color="--red" action={change}>
                        <i className="bi bi-play-fill"></i>
                        <h2>Reproducir</h2>
                    </Button>
                    <Button color="--gray" action={change}>
                        <i className="bi bi-bookmark-plus"></i>
                    </Button>
                </div>
            </div>
            
            <div ref={playerRef} className={styles.movieContainer}>
                <div className={isActive ? styles.isActive : styles.desactive} >
                    <div className={styles.moviePlayer}>
                        <div className={styles.titleMovie}>
                            <h2>Estas viendo "{data.title}"</h2>
                        </div>
                        <iframe src={`https://vimeus.com/e/movie?tmdb=${id}&view_key=${VIMEUS_VIEW_KEY}&autoplay=1`} width="100%" height="600" frameBorder="0" allowFullScreen referrerPolicy="origin"></iframe>
                    </div>
                </div>
            </div>
            <div className={styles.container}>
                <ContentSection title={"Peliculas similares"} url={`/movies/recommendations/${id}`} types={"movies"}/>
            </div>
            <Footer />
        </>
    )
}

