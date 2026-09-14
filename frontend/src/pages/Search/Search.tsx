import { useEffect, useState } from "react"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./search.module.css"
import type { Media } from "../../types/Movie"
import { MovieCard } from "../../components/MovieCard/MovieCard"



export const Search = () => {
    const [query, setQuery] = useState("")
    const [search, setSearch] = useState("")
    const [item, setItem] = useState<Media[]>([])
    const [loading, setLoading] = useState(false)
    const API_URL = import.meta.env.VITE_API_URL

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

    useEffect(()=> {
        if(!search) return

        const searchItem =async () => {
            try {
                setLoading(true)
        
                const res = await fetch(`${API_URL}/search/movie?query=${search}`)
                const data = await res.json()
    
                setItem(data.results)

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
            <div className={`${styles.navbar} ${scrolled ? styles.scrolled : ""}`}>
                <div className={styles.navbarBackground}></div>
                <div className={styles.elements}>
                    <Navbar/>
                </div>
            </div>
            <div className={styles.mainContainer}>
                <div className={styles.titleContainer}>
                    <h1>¿Que querés ver hoy?</h1>
                </div>
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
                    <button className={styles.btnSearch} type="submit">
                        <i className="bi bi-search"></i>
                    </button>
                </form>
                
            </div>
            
            
            {loading && <p>Buscando...</p>}
            
            <div className={styles.moviesGrid}>
                {item.map(movie => (
                    <div key={movie.id}>
                        <MovieCard item={movie} type={movie.first_air_date ? "series" : "movies"}/>
                    </div>
                ))}
            </div>
        </div>
    )
}