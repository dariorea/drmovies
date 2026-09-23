import { useState, useRef, useEffect } from "react"
import { useParams } from "react-router-dom"
import styles from "./movieid.module.css"
import type { Movie } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"
import { Navbar } from "../../components/Navbar/Navbar"
import { Background } from "../../components/Background/Background"
import { Preload } from "../../components/Preload/Preload"
import { Footer } from "../../components/Footer/Footer"
import { ContentSection } from "../../components/ContentSection/ContentSection"
import { TvRegion } from "../../components/TvRegion/TvRegion"
import { MoviePlayer } from "../../components/MoviePlayer/MoviePlayer"
//import { Button } from "../../components/Button/Button"

export const MovieID = () => {
    const [isActive, setIsActive] = useState(false)
    const playerRef = useRef<HTMLDivElement | null>(null)

    const { id } = useParams()
    const { data, loading, error } = useFetch<Movie>(`/movies/${id}`)

    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)

        return () => {
            window.removeEventListener("scroll", handleScroll)
        }
    }, [])


	//const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL
    //const VIMEUS_VIEW_KEY = import.meta.env.VITE_VIMEUS_KEY_VIEW

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
            <div className={`${styles.navbar} ${scrolled ? styles.scrolled : ""}`}>
                <div className={styles.navbarBackground}></div>
                <div className={styles.elements}>
                    <Navbar/>
                </div>
            </div>
            <Background className={styles.containerBackground} data={data} action={change}/>
            
            <div ref={playerRef} className={styles.movieContainer}>
                <div className={isActive ? styles.isActive : styles.desactive} >
                <TvRegion id="player" className={styles.moviePlayer} focusClassName="tv-focused-hero">
                    <MoviePlayer
                        tmdbId={id!}
                        title={data.title}
                    />
                </TvRegion>
                </div>
            </div>
            <div className={styles.container}>
                <ContentSection title={"Peliculas similares"} url={`/movies/recommendations/${id}`} types={"movies"}/>
            </div>
            <Footer />
        </>
    )
}

