import { useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./moviepage.module.css"
import { useFetch } from "../../hooks/useFetch"
import { MovieData } from "../../components/MovieData/MovieData"
import type { Movie } from "../../types/Movie"
import { Button } from "../../components/Button/Button"
//import { Background } from "../../components/Background/Background"

export const MovieID = () => {
    const [isActive, setIsActive] = useState(false)
    const playerRef = useRef<HTMLDivElement | null>(null)

    const { id } = useParams()
    const { data, loading, error } = useFetch<Movie>(`/movies/${id}`)

	const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL
    const VIMEUS_VIEW_KEY = import.meta.env.VITE_VIMEUS_KEY_VIEW

    if (loading) return <p>Cargando...</p>
    if (error) return <p>Error: {error.message}</p>
    if (!data) return <p><i className="bi bi-arrow-clockwise"></i></p>
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
            <div className={styles.containerBackground} style={{
                        backgroundImage: `
                            linear-gradient(
                                to right,
                                rgba(0,0,0,0.9) 10%,
                                rgba(0,0,0,0.6) 40%,
                                rgba(0,0,0,0.2) 70%,
                                rgba(0,0,0,0) 100%
                            ),
                            url(${IMG_BASE}${data.backdrop_path})`
                        }}>
                <div className={styles.container}>
                    <Navbar />
                    <div className={styles.mainContainer}>
                        <div className={styles.section}>
                            <MovieData data={data} />
                            <Button action={change}>
                                <i className="bi bi-play-fill"></i>Reproducir
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            <div ref={playerRef} className={styles.movieContainer}>
                <div className={isActive ? styles.isActive : styles.desactive} >
                    <div className={styles.moviePlayer}>
                        <div className={styles.titleMovie}>
                            <h2>Estas viendo "{data.title}"</h2>
                        </div>
                        <iframe className={styles.iframe} src={`https://vimeus.com/e/movie?tmdb=${id}&view_key=${VIMEUS_VIEW_KEY}&autoplay=1`} width="100%" height="600" frameBorder="0" allowFullScreen referrerPolicy="origin"></iframe>
                    </div>
                </div>
            </div>
        </>
    )
}

