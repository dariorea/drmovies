import styles from "./hero.module.css"
import type { ApiResponse, Media } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"
import { Link } from "react-router-dom"
import { useEffect, useRef, useState } from "react"

interface Props {
    url: string
}

export const Hero = ({ url }: Props) => {

    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL

    const { data, loading, error } =
        useFetch<ApiResponse<Media>>(url)

    const containerRef = useRef<HTMLDivElement>(null)

    const [currentSlide, setCurrentSlide] = useState(1)

    const results = data?.results ?? []

    // Clonamos el último al principio
    // y el primero al final
    const slides = results.length > 0
        ? [
            results[results.length - 1],
            ...results,
            results[0]
        ]
        : []

  // Posición inicial
useEffect(() => {
    if (!results.length) return

    const container = containerRef.current

    if (!container) return

    container.scrollLeft = container.clientWidth

}, [results.length])


// Detectar slide actual
useEffect(() => {

    const container = containerRef.current

    if (!container) return

    const handleScroll = () => {

        const slideWidth = container.clientWidth

        const index = Math.round(
            container.scrollLeft / slideWidth
        )

        setCurrentSlide(index)
    }

    container.addEventListener("scroll", handleScroll)

    return () => {
        container.removeEventListener("scroll", handleScroll)
    }

}, [])


// Autoplay
useEffect(() => {

    if (!results.length) return

    const interval = setInterval(() => {

        const container = containerRef.current

        if (!container) return

        const nextSlide = currentSlide + 1

        container.scrollTo({
            left: nextSlide * container.clientWidth,
            behavior: "smooth"
        })

    }, 5000)

    return () => clearInterval(interval)

}, [currentSlide, results.length])


// Loop infinito
useEffect(() => {

    const container = containerRef.current

    if (!container) return

    const handleScrollEnd = () => {

        // Clon del primer slide
        if (currentSlide === results.length + 1) {

            container.scrollTo({
                left: container.clientWidth,
                behavior: "auto"
            })

            setCurrentSlide(1)
        }


        // Clon del último slide
        if (currentSlide === 0) {

            container.scrollTo({
                left: results.length * container.clientWidth,
                behavior: "auto"
            })

            setCurrentSlide(results.length)
        }
    }

    container.addEventListener(
        "scrollend",
        handleScrollEnd
    )

    return () => {
        container.removeEventListener(
            "scrollend",
            handleScrollEnd
        )
    }

}, [currentSlide, results.length])
    if (loading) return <div />

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
                                        black 1%,
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