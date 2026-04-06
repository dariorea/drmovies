import { useState, useEffect } from "react"
import type { Movie, MoviesResponse } from "../types/Movie"

export function useInfinityFetch(url: string) {

    const API_URL = import.meta.env.VITE_API_URL
    const [data, setData] = useState<Movie[]>([])
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [hasMore, setHasMore] = useState(true)

    useEffect(() => {
        setData([])
        setPage(1)
        setHasMore(true)
      }, [url])

    useEffect(() => {

        const controller = new AbortController()
        
        const fetchData = async () => {
            try {
                setLoading(true)

                const res = await fetch(`${API_URL}${url}?page=${page}`, {
                    signal: controller.signal
                })
                const json: MoviesResponse = await res.json()

                setData( (prev) => [...prev, ...json.results])

                if (page >= json.total_pages) {
                    setHasMore(false)
                }
            } catch (err) {
                if ((err as any).name === "AbortError") return
            } finally {
                setLoading(false)
            }
        }
        fetchData()

        return ()=> controller.abort()
    }, [url, page])
    
    return {
        data,
        loading,
        hasMore,
        nextPage: () => setPage(prev => prev + 1),
        reset: () => {
            setData([])
            setPage(1)
            setHasMore(true)
        }
    }
}