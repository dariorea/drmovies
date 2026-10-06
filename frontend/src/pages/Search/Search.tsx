import { useEffect, useRef, useState } from "react"
import { useNavSnapshot } from "@tv-spatial-navigation/react"

import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./search.module.css"
import type { Media } from "../../types/Movie"
import { ItemCard } from "../../components/ItemCard/ItemCard"
import { TvRegion } from "../../components/TvRegion/TvRegion"
import { Loading } from "../../components/Loading/Loading"

export const Search = () => {
    const [query, setQuery] = useState("")
    const [search, setSearch] = useState("")
    const [item, setItem] = useState<Media[]>([])
    const [loading, setLoading] = useState(false)

    const [scrolled, setScrolled] = useState(false)
    const [editing, setEditing] = useState(false)

    const inputRef = useRef<HTMLInputElement>(null)

    const snapshot = useNavSnapshot()

    const API_URL = import.meta.env.VITE_API_URL

    /*
     * Detectamos dónde está actualmente el foco del D-pad.
     *
     * form:0 -> input
     * form:1 -> botón buscar
     */
    useEffect(() => {
        if (!snapshot.focusKey) return
    
        const [region, index] = snapshot.focusKey.split(":")
        const focusedIndex = Number(index)
    
        /*
         * El D-pad está dentro de la región del buscador.
         */
        if (region === "form") {
    
            /*
             * form:0 = input
             *
             * Le damos foco REAL al input.
             * De esta manera el usuario puede escribir
             * inmediatamente al tenerlo seleccionado.
             */
            if (focusedIndex === 0) {
                inputRef.current?.focus()
                setEditing(true)
                return
            }
    
            /*
             * form:1 = botón Buscar
             *
             * Quitamos el foco real del input.
             */
            if (focusedIndex === 1) {
                setEditing(false)
                inputRef.current?.blur()
                return
            }
        }
    
        /*
         * Si salimos completamente de la región form,
         * también quitamos el foco real del input.
         */
        if (editing) {
            setEditing(false)
            inputRef.current?.blur()
        }
    
    }, [snapshot.focusKey])
    

    /*
     * Detectar scroll para modificar el Navbar.
     */
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }

        window.addEventListener("scroll", handleScroll)

        return () => {
            window.removeEventListener("scroll", handleScroll)
        }
    }, [])

    /*
     * Buscar películas.
     */
    useEffect(() => {
        if (!search) {
            setItem([])
            return
        }

        const searchItem = async () => {
            try {
                setLoading(true)

                const res = await fetch(
                    `${API_URL}/search/movie?query=${encodeURIComponent(search)}`
                )

                const data = await res.json()

                setItem(data.results ?? [])

            } catch (error) {
                console.error(error)
                setItem([])

            } finally {
                setLoading(false)
            }
        }

        searchItem()
    }, [search, API_URL])

    /*
     * Ejecutar búsqueda.
     */
    const handleSearch = () => {
        const value = query.trim()

        if (!value) return

        setSearch(value)

        /*
         * Cuando se ejecuta la búsqueda desde el input,
         * dejamos el modo escritura.
         */
        setEditing(false)
        inputRef.current?.blur()
    }

    return (
        <div className={styles.container}>

            <div
                className={`${styles.navbar} ${
                    scrolled ? styles.scrolled : ""
                }`}
            >
                <div className={styles.navbarBackground}></div>

                <div className={styles.elements}>
                    <Navbar />
                </div>
            </div>

            <TvRegion
                id="form"
                type="row"
                focusClassName="tv-focused-nav"
                className={styles.mainContainer}
            >

                <div className={styles.titleContainer}>
                    <h2>¿Que querés ver hoy?</h2>
                </div>

                <form
                    className={styles.inputContainer}
                    onSubmit={(e) => {
                        e.preventDefault()
                        handleSearch()
                    }}
                >

                    <input
                        ref={inputRef}
                        data-tv-focusable
                        type="text"
                        placeholder="Buscar películas..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                        }}
                        onFocus={() => {
                            setEditing(true)
                        }}
                        onKeyDown={(e) => {

                            /*
                             * Escape sale del modo escritura.
                             */
                            if (e.key === "Escape") {
                                setEditing(false)
                                inputRef.current?.blur()
                            }

                            /*
                             * Enter ejecuta la búsqueda.
                             */
                            if (e.key === "Enter") {
                                e.preventDefault()
                                handleSearch()
                            }
                        }}
                    />

                    <button
                        data-tv-focusable
                        className={styles.btnSearch}
                        type="submit"
                        aria-label="Buscar"
                    >
                        <i className="bi bi-search"></i>
                    </button>

                </form>

            </TvRegion>

            {loading && <Loading />}
            
            <TvRegion
                id="grid"
                focusClassName="tv-focused-card"
                className={styles.moviesGrid}
            >

                {item.map((movie) => (
                    <ItemCard
                        key={movie.id}
                        item={movie}
                        type={
                            movie.first_air_date
                                ? "series"
                                : "movies"
                        }
                    />
                ))}
            </TvRegion>

        </div>
    )
}
