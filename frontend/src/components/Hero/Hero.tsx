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

    // Creamos una lista con el último al principio
    // y el primero al final
    const slides = results.length > 0
        ? [
            results[results.length - 1],
            ...results,
            results[0]
        ]
        : []

    useEffect(() => {
        if (!results.length) return

        // Empezamos en el primer slide real
        if (containerRef.current) {
            containerRef.current.scrollLeft =
                containerRef.current.clientWidth
        }
    }, [results.length])

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

    useEffect(() => {
        if (!results.length) return

        const interval = setInterval(() => {

            setCurrentSlide(prev => {

                const next = prev + 1

                if (containerRef.current) {
                    containerRef.current.scrollTo({
                        left: next * containerRef.current.clientWidth,
                        behavior: "smooth"
                    })
                }

                return next
            })

        }, 5000)

        return () => clearInterval(interval)

    }, [results.length])

    // Cuando llegamos a los clones,
    // reposicionamos el slider sin animación
    useEffect(() => {

        if (!containerRef.current) return

        if (currentSlide === results.length + 1) {

            setTimeout(() => {

                if (!containerRef.current) return

                containerRef.current.scrollTo({
                    left: containerRef.current.clientWidth,
                    behavior: "auto"
                })

                setCurrentSlide(1)

            }, 1000)

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