export type Genre = {
    id: number
    name: string
  }
export type Season = {
    episodes: Episode[]
    id: number
    name: string
    poster_path: string
    season_number: number
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

  export type ApiResponse<T> = {
    page: number
    results: T[]
    total_pages: number
    total_results: number
  }


  type Episode = {
    episode_number: number
    name: string
    id: number
    still_path: string
  }
  export type Media = {
    id: number
    title?: string
    name?: string
    overview: string
    poster_path: string
    backdrop_path: string
    release_date?: string
    first_air_date?: string
    vote_average: number
    genres: Genre[]
    logo?: string
    logoFanart?: string
    seasons?: Season[]
  }