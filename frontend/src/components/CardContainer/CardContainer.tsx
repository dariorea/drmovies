import { MovieCard } from "../MovieCard/MovieCard"
import type { MoviesResponse } from "../../types/Movie"
import { useFetch } from "../../hooks/useFetch"

interface Props {
    url: string
    types: "series" | "movies"
    className: string
}

export const CardContainer = ({className, url, types}: Props) => {
    const { data, loading, error } = useFetch<MoviesResponse>(url)

    if (loading) return <p>Cargando...</p>
    if (error) return <p>Error: {error.message}</p>

    return (    
        <div className={className}>
            {data?.results.map(movie => (
            <div key={movie.id}>
                <MovieCard item={movie} type={types}/>
            </div>
            ))}
        </div>
    )
}