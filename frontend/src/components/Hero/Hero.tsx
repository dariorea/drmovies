import styles from "./hero.module.css"
import type { ApiResponse, Media } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"
import { Link } from "react-router-dom"
import { useEffect, useRef } from "react"

interface Props {
    url: string
}

export const Hero = ({ url }: Props) => {

    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL

    const { data, loading, error } =
        useFetch<ApiResponse<Media>>(url)

    const containerRef = useRef<HTMLDivElement>(null)

    const results = data?.results ?? []

    const slides = results.length > 0
        ? [
            results[results.length - 1],
            ...results,
            results[0]
        ]
        : []


    // --------------------------------
    // POSICIÓN INICIAL
    // --------------------------------

    useEffect(() => {

        if (!results.length) return

        const container = containerRef.current

        if (!container) return

        container.scrollLeft = container.clientWidth

    }, [results.length])


    // --------------------------------
    // AUTOPLAY
    // --------------------------------

    useEffect(() => {

        if (!results.length) return

        const interval = setInterval(() => {

            const container = containerRef.current

            if (!container) return

            const slideWidth = container.clientWidth

            const currentIndex = Math.round(
                container.scrollLeft / slideWidth
            )

            const nextIndex = currentIndex + 1

            container.scrollTo({
                left: nextIndex * slideWidth,
                behavior: "smooth"
            })

        }, 5000)

        return () => clearInterval(interval)

    }, [results.length])


    // --------------------------------
    // LOOP INFINITO
    // --------------------------------

    useEffect(() => {

        const container = containerRef.current

        if (!container) return

        let timeout: ReturnType<typeof setTimeout>

        const handleScroll = () => {

            clearTimeout(timeout)

            timeout = setTimeout(() => {

                const slideWidth = container.clientWidth

                if (!slideWidth) return

                const currentIndex = Math.round(
                    container.scrollLeft / slideWidth
                )


                // Llegamos al clon del primero
                if (currentIndex === results.length + 1) {

                    container.scrollTo({
                        left: slideWidth,
                        behavior: "auto"
                    })

                }


                // Llegamos al clon del último
                else if (currentIndex === 0) {

                    container.scrollTo({
                        left: results.length * slideWidth,
                        behavior: "auto"
                    })

                }

            }, 150)

        }

        container.addEventListener(
            "scroll",
            handleScroll,
            { passive: true }
        )

        return () => {

            clearTimeout(timeout)

            container.removeEventListener(
                "scroll",
                handleScroll
            )

        }

    }, [results.length])


    if (loading) {
        return <div />
    }

    if (error) {
        return <p>Error: {error.message}</p>
    }


    return (

        <div className={styles.containerHero}>

            <div
                ref={containerRef}
                className={styles.slider}
            >

                {slides.map((movie, index) => (

                    <div
                        className={styles.slide}
                        key={`${movie.id}-${index}`}
                    >

                        <div
                            className={styles.portada}
                            style={{
                                backgroundImage: `
                                    linear-gradient(
                                        to top,
                                        black 0%,
                                        transparent 60%,
                                        transparent 100%
                                    ),
                                    url(${IMG_BASE}${movie.backdrop_path})
                                `
                            }}
                        >

                            <div className={styles.nameHero}>

                                <h1>
                                    {movie.title || movie.name}
                                </h1>

                                <Link
                                    to={`/movies/${movie.id}`}
                                    className={styles.btnWatch}
                                >

                                    <i className="bi bi-play-fill"></i>

                                    <span>
                                        Ver ahora
                                    </span>

                                </Link>

                            </div>

                        </div>

                    </div>

                ))}

            </div>

        </div>
    )
}