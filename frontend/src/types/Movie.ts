export type Genre = {
    id: number
    name: string
  }

export type Movie = {
    id: number
    title: string
    overview: string
    poster_path: string
    backdrop_path: string
    release_date: string
    vote_average: number
    vote_count: number
    adult: boolean
    genre_ids: number[]
    original_language: string
    original_title: string
    popularity: number
    video: boolean
    genres: Genre[]
    logo?: string
}

export type MoviesResponse = {
    dates: {
        maximum: string
        minimum: string
    }
    page: number
    results: Movie[]
    total_pages: number
    total_results: number
  }