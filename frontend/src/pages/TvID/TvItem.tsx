import { useParams } from "react-router-dom"
import { useState, useEffect, useRef } from "react"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./tvitem.module.css"
import { useFetch } from "../../hooks/useFetch"
import type { Media } from "../../types/Movie"
import { Episodes } from "../../components/Episodes/Episodes"
import { Background } from "../../components/Background/Background"
import { Footer } from "../../components/Footer/Footer"
import { Preload } from "../../components/Preload/Preload"
import { ContentSection } from "../../components/ContentSection/ContentSection"
//STSK-094 Shoplifting Girl A

export const TvItem = () => {

    const { id } = useParams()
    const { data, loading, error } = useFetch<Media>(`/series/${id}`)
    const seasonsRef = useRef<HTMLDivElement | null>(null)


    const [scrolled, setScrolled] = useState(false)
    const toSeasons = () => {


    // scroll hacia el reproductor
    setTimeout(() => {
        seasonsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        })
    }, 100)
    }

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)

        return () => {
            window.removeEventListener("scroll", handleScroll)
        }
    }, [])


    if (loading) return <Preload /> 
    if (error) return <p>Error: {error.message}</p>
    if (!data) return <Preload />
    console.log(data)

    

    return (
        <>
            <div className={`${styles.navbar} ${scrolled ? styles.scrolled : ""}`}>
                <div className={styles.navbarBackground}></div>
                <div className={styles.elements}>
                    <Navbar/>
                </div>
            </div>
            <Background className={styles.containerBackground} data={data} action={toSeasons} />
            <div ref={seasonsRef} className={styles.container}>
                <Episodes data={data}/>
                <ContentSection title="Series similares" url={`/series/recommendations/${id}`} types={"series"} />
            </div>
            <Footer />
        </>
    )
}