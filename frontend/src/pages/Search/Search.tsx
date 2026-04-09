import { useEffect, useState } from "react"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./search.module.css"
import type { Movie } from "../../types/Movie"
import { MovieCard } from "../../components/MovieCard/MovieCard"



export const Search = () => {
    const [query, setQuery] = useState("")
    const [search, setSearch] = useState("")
    const [movies, setMovies] = useState<Movie[]>([])
    const [loading, setLoading] = useState(false)
    const API_URL = import.meta.env.VITE_API_URL

    useEffect(()=> {
        if(!search) return

        const searchItem =async () => {
            try {
                setLoading(true)
        
                const res = await fetch(`${API_URL}/search/movie?query=${search}`)
                const data = await res.json()
    
                setMovies(data.results)

            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
                }
            
        }

        searchItem()
    }, [search])
    return (
        <div className={styles.container}>
            <Navbar />
            <form
                className={styles.inputContainer}
                onSubmit={(e) => {
                    e.preventDefault()
                    setSearch(query)
                }}
                >
                <input
                    type="text"
                    placeholder="Buscar películas..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />

                <button type="submit">Buscar</button>
            </form>
            {loading && <p>Buscando...</p>}

            <div className={styles.moviesGrid}>
                {movies.map(movie => (
                    <MovieCard item={movie} type="movies"/>
                ))}
            </div>
        </div>
    )
}