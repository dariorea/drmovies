import { Footer } from "../../components/Footer/Footer"
import { Hero } from "../../components/Hero/Hero"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./home.module.css"
import { useState, useEffect } from "react"
import { ContentSection } from "../../components/ContentSection/ContentSection"



export const Home = () => {

    
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
    
    return (
        <div className={styles.container}>
<div className={`${styles.navbar} ${scrolled ? styles.scrolled : ""}`}>
    
    <div className={styles.navbarBackground}></div>

    <div className={styles.elements}>
        <Navbar/>
    </div>

</div>
            
            <div className={styles.preHero}>
                <Hero url={`/movies/popular`} />
            </div>
 
            <div className={styles.mainContainer}>
                <ContentSection
                    title="Peliculas"
                    link="/movies"
                    url="/movies"
                    types="movies"
                    className={styles.cardContainer}
                />

                <ContentSection
                    title="Series"
                    link="/series"
                    url="/series"
                    types="series"
                    className={styles.cardContainer}
                />

                <ContentSection
                    title="Mejor Valoradas"
                    link="/movies"
                    url="/movies/top_rated"
                    types="movies"
                    className={styles.cardContainer}
                />
            </div>
            
            <Footer />
        </div>

        
    )
}