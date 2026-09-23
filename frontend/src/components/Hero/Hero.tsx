import styles from "./hero.module.css"
import { Link, useNavigate } from "react-router-dom"
import { useEffect, useRef } from "react"
import { useSpatialNavigation, useNavSnapshot } from "@tv-spatial-navigation/react"
import type { ApiResponse, Media } from "../../types/Movie"
import { TvRegion } from "../TvRegion/TvRegion"
import { useFetch } from "../../hooks/useFetch"
import { LogoMovie } from "../LogoMovie/LogoMovie"
import { Button } from "../Button/Button"

interface Props {
    url: string
}

export const Hero = ({ url }: Props) => {

    const navigate = useNavigate()
    const navigation = useSpatialNavigation()
    const snapshot = useNavSnapshot()

    const IMG_BASE =
        import.meta.env.VITE_TMDB_BACKGROUND_IMAGE_URL

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

            if (!slideWidth) return

            const currentIndex = Math.round(
                container.scrollLeft / slideWidth
            )

            const nextIndex = currentIndex + 1

            container.scrollTo({
                left: nextIndex * slideWidth,
                behavior: "smooth"
            })

        }, 9000)

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

                if (!slideWidth || !results.length) return

                const currentIndex = Math.round(
                    container.scrollLeft / slideWidth
                )


                // Clon del primer slide
                if (
                    currentIndex === results.length + 1
                ) {

                    container.style.scrollBehavior = "auto"

                    container.scrollLeft = slideWidth

                    requestAnimationFrame(() => {
                        container.style.scrollBehavior = ""
                    })

                }


                // Clon del último slide
                else if (currentIndex === 0) {

                    container.style.scrollBehavior = "auto"

                    container.scrollLeft =
                        results.length * slideWidth

                    requestAnimationFrame(() => {
                        container.style.scrollBehavior = ""
                    })

                }

            }, 200)

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


    // --------------------------------
    // CAMBIAR SLIDE
    // --------------------------------

    const moveSlide = (
        direction: "next" | "prev"
    ) => {

        const container = containerRef.current

        if (!container) return

        const slideWidth = container.clientWidth

        if (!slideWidth) return

        const currentIndex = Math.round(
            container.scrollLeft / slideWidth
        )

        const nextIndex =
            direction === "next"
                ? currentIndex + 1
                : currentIndex - 1

        container.scrollTo({
            left: nextIndex * slideWidth,
            behavior: "smooth"
        })

    }


    // --------------------------------
    // ← →
    // --------------------------------

    useEffect(() => {

        const handleKeyDown = (
            event: KeyboardEvent
        ) => {

            const snapshot =
                navigation.getSnapshot()

            if (
                snapshot.focusKey !== "hero:0"
            ) {
                return
            }

            if (
                event.key !== "ArrowRight" &&
                event.key !== "ArrowLeft"
            ) {
                return
            }

            event.preventDefault()
            event.stopPropagation()

            moveSlide(
                event.key === "ArrowRight"
                    ? "next"
                    : "prev"
            )

        }

        window.addEventListener(
            "keydown",
            handleKeyDown,
            true
        )

        return () => {

            window.removeEventListener(
                "keydown",
                handleKeyDown,
                true
            )

        }

    }, [navigation])


    // --------------------------------
    // ENTER
    // --------------------------------

    useEffect(() => {

        const handleKeyDown = (
            event: KeyboardEvent
        ) => {

            const snapshot =
                navigation.getSnapshot()

            if (
                snapshot.focusKey !== "hero:0"
            ) {
                return
            }

            if (event.key !== "Enter") return

            const container =
                containerRef.current

            if (
                !container ||
                !results.length
            ) {
                return
            }

            const slideWidth =
                container.clientWidth

            if (!slideWidth) return

            const currentIndex = Math.round(
                container.scrollLeft / slideWidth
            )

            let movieIndex: number


            // Clon del último
            if (currentIndex === 0) {

                movieIndex =
                    results.length - 1

            }


            // Clon del primero
            else if (
                currentIndex === results.length + 1
            ) {

                movieIndex = 0

            }


            // Slide real
            else {

                movieIndex =
                    currentIndex - 1

            }

            const movie =
                results[movieIndex]

            if (!movie) return

            event.preventDefault()
            event.stopPropagation()

            navigate(
                `/movies/${movie.id}`
            )

        }

        window.addEventListener(
            "keydown",
            handleKeyDown,
            true
        )

        return () => {

            window.removeEventListener(
                "keydown",
                handleKeyDown,
                true
            )

        }

    }, [
        navigation,
        navigate,
        results
    ])

    useEffect(() => {

        if (snapshot.focusKey !== "hero:0") {
            return
        }
    
        window.scrollTo({
            top: 0,
            behavior: "auto"
        })
    
    }, [snapshot.focusKey])

    // --------------------------------
    // ESTADOS
    // --------------------------------

    if (loading) {
        return <div />
    }

    if (error) {
        return <p>Error: {error.message}</p>
    }


    // --------------------------------
    // RENDER
    // --------------------------------

    return (

        <TvRegion
            id="hero"
            type="row"
            className={styles.containerHero}
            focusClassName="tv-focused-card"
        >

            {/* Elemento utilizado solamente para el foco TV */}
            <div
                data-tv-focusable
                className={styles.heroFocus}
                aria-hidden="true"
            />

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
                                        180deg,
                                        transparent 0%,
                                        rgba(0, 0, 0, 1) 95%,
                                        rgba(0, 0, 0, 1) 100%
                                    ),
                                    url(${IMG_BASE}${movie.backdrop_path})
                                `
                            }}
                        >

                            <div
                                className={styles.nameHero}
                            >

                                <LogoMovie
                                    data={movie}
                                />

                                <Link
                                    to={`/movies/${movie.id}`}
                                    className={`${styles.verAhora} ${
                                        snapshot.focusKey === "hero:0"
                                            ? "tv-focused-hero"
                                            : ""
                                    }`}
                                >
                                    <Button color="--red">

                                        <i className="bi bi-play-fill"></i>

                                        <h3>
                                            Ver ahora
                                        </h3>

                                    </Button>
                                </Link>

                            </div>

                        </div>

                    </div>

                ))}

            </div>
            <div className={styles.black}></div>

        </TvRegion>
    )
}