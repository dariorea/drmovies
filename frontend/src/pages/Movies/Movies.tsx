import { useEffect, useRef } from "react"
import { Navbar } from "../../components/Navbar/Navbar"
import { useInfinityFetch } from "../../hooks/useInfinityScroll"
//import type { Movie } from "../../types/Movie"
import styles from "./movies.module.css"
import { MovieCard } from "../../components/MovieCard/MovieCard"

export const Movies = () => {

    const { data, loading, hasMore, nextPage } = useInfinityFetch("/movies/all")
    const observerRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!hasMore) return

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !loading) {
                nextPage()
            }
        })

        const current = observerRef.current

        if (current) observer.observe(current)

        return () => {
            if (current) observer.unobserve(current)
        }
    }, [loading, hasMore, nextPage])

    return (
        <div className={styles.container}>
            <Navbar />
            <div className={styles.titleContainer}>
                <h1>Peliculas</h1>
                <p>Explora y descubre las mejores Peliculas en nuestro catalogo</p>
            </div>


            <div className={styles.cardContainer}>
                {data.map(movie => (
                    <MovieCard key={movie.id} item={movie} type="movies" />
                ))}
            </div>

            {loading && data.length > 0 && <p>Cargando más...</p>}

            <div ref={observerRef} style={{ height: "20px" }} />
        </div>
    )
}