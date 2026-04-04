import { useEffect, useState } from "react";

type Data<T> = T | null
type ErrorType = Error | null

interface Params<T> {
    data: Data<T>;
    loading: boolean;
    error : ErrorType;
}
const API_URL = import.meta.env.VITE_API_URL

export function useFetch<T>(url: string): Params<T> {
    const [data, setData] = useState<Data<T>>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<ErrorType>(null)

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)

        const fetchAPI = async () => {
            try { 
                const response = await fetch(`${API_URL}${url}`, {
                    signal: controller.signal
                })
                if(!response.ok) {
                    throw new Error("Error en la petición");
                }
                const dataJson : T = await response.json()
                setData(dataJson)
                setError(null)
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") {
                    return // ignorar este error
                }
                setError(err as Error)
            } finally {
                setLoading(false)
            }            
        }

    fetchAPI()

    return () => {
        controller.abort()
    }
    }, [url])
    return {data, loading, error}
}