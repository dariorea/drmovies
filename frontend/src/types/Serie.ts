import type { Genre } from "./Movie"

export interface Serie {
    adult: boolean
    backdrop_path: string | null
    first_air_date: string
    genres: Genre[]
    id: number
    name: string
    origin_country: string[]
    original_language: string
    original_name: string
    overview: string
    popularity: number
    poster_path: string | null
    vote_average: number
    vote_count: number
}

export interface SeriesResponse {
    page: number
    results: Serie[]
    total_pages: number
    total_results: number
}