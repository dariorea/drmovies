
import { useState, useRef, useEffect } from "react"
import { useParams } from "react-router-dom"
import styles from "./moviedetail.module.css"
import type { Movie } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"
import { Navbar } from "../../components/Navbar/Navbar"
import { Background } from "../../components/Background/Background"
import { Preload } from "../../components/Preload/Preload"
import { Footer } from "../../components/Footer/Footer"
import { ContentSection } from "../../components/ContentSection/ContentSection"
import { MoviePlayer } from "../../components/MoviePlayer/MoviePlayer"
import { VimeusPlayer } from "../../components/VimeusPlayer/VimeusPlayer"

export const MovieID = () => {
    const [isActive, setIsActive] = useState(false)
    const [isVimeusActive, setVimeusActive] = useState(false)
    const playerRef = useRef<HTMLDivElement | null>(null)

    const { id } = useParams()

    const {
        data,
        loading,
        error
    } = useFetch<Movie>(`/movies/${id}`)

    /*
     * Cada vez que cambia la película,
     * el reproductor vuelve a estar inactivo.
     *
     * Esto evita que al pasar de una película
     * a otra se conserve el estado "activo".
     */
    useEffect(() => {
        setIsActive(false)
        setVimeusActive(false)
    }, [id])

    if (loading) return <Preload />

    if (error) {
        return <p>Error: {error.message}</p>
    }

    if (!data) return <Preload />

    const change = () => {

        setIsActive(true)
        setVimeusActive(false)
        setTimeout(() => {

            playerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            })

        }, 100)
    }
    const changeTwo = () => {
        setVimeusActive(true)
        setIsActive(false)
        setTimeout(() => {

            playerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            })

        }, 100)
    }

    return (
        <>
            <div className={styles.container}>

                <Navbar />

                

            </div>
            <Background
                    className={styles.containerBackground}
                    data={data}
                    optionOne={change}
                    optionTwo={changeTwo}
                />

            <div
                ref={playerRef}
                className={styles.movieContainer}
            >

                <div
                    className={
                        isActive
                            ? styles.isActive
                            : styles.desactive
                    }
                >

                    <MoviePlayer
                        key={id}
                        tmdbId={id!}
                        title={data.title}
                        active={isActive}
                    />

                </div>
                <div
                    className={
                        isVimeusActive
                            ? styles.isActive
                            : styles.desactive
                    }
                >

                    <VimeusPlayer
                        key={id}
                        id={id}
                        typeUrl={"movie"}
                    />

                </div>

            </div>
            
            <div className={styles.container}>

                <ContentSection
                    title="Peliculas similares"
                    url={`/movies/recommendations/${id}`}
                    types="movies"
                />
            </div>

            <Footer />

        </>
    )
}