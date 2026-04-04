import { MovieCard } from "../MovieCard/MovieCard"
import type { MoviesResponse } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"
import styles from "./cardcontainer.module.css"


interface Props {
    url: string
    types: "series" | "movies"
}

export const CardContainer = ({url, types}: Props) => {
    const { data, loading, error } = useFetch<MoviesResponse>(url)

    if (loading) return <p>Cargando...</p>
    if (error) return <p>Error: {error.message}</p>

    return (    
        <div className={styles.cardContainer}>
            {data?.results.map(movie => (
            <div key={movie.id}>
                <MovieCard item={movie} type={types}/>
            </div>
            ))}
        </div>
    )
}