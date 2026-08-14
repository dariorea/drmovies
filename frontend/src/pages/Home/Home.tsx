import { Link } from "react-router-dom"
import { CardContainer } from "../../components/CardContainer/CardContainer"
import { Footer } from "../../components/Footer/Footer"
import { Hero } from "../../components/Hero/Hero"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./home.module.css"
import { useState, useEffect } from "react"
import { Aside } from "../../components/Aside/Aside"


export const Home = () => {
    const [isActive, setIsActive] = useState(false)
    const [isVisible, setIsVisible] = useState(false)


    const activar = () => {
        if (!isActive) {
            setIsVisible(true)
            setIsActive(true)
        } else {
            setIsActive(false)
    
            setTimeout(() => {
                setIsVisible(false)
            }, 100)
        }
    }
    useEffect(() => {
        if (isActive) {
            document.body.style.overflow = "hidden"
        } else {
            document.body.style.overflow = "auto"
        }
        return () => {
            document.body.style.overflow = "auto"
        }
    }, [isActive])
    
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
                <div className={styles.elements}>
                    <Navbar/>
                    <div onClick={activar} className={styles.asideIcon}>
                        <i className="bi bi-list"></i>
                    </div>
                </div>
            </div>
            {isVisible && (
            <div
                className={`
                    ${styles.asideContainer}
                    animate__animated
                    ${isActive ? "animate__fadeInRightBig" : "animate__fadeOutRightBig"}
                `}>
                <Aside action={activar} />
            </div>
            )}
            
            <div className={styles.preHero}>
                <Hero url={`/movies/popular`} />
            </div>
 
            <div className={styles.mainContainer}>
                <div className={styles.section}>
                    <div className={styles.titleSection}>
                        <h2>Peliculas</h2>
                        <Link to={`/movies`}>ver mas<i className="bi bi-chevron-right"></i></Link>
                    </div>
                    <CardContainer className={styles.cardContainer} url="/movies" types="movies"/>    
                </div>
                <div className={styles.section}>
                    <div className={styles.titleSection}>
                        <h2>Series</h2>
                        <Link to={`/series`}>ver mas<i className="bi bi-chevron-right"></i></Link>

                    </div>
                    <CardContainer className={styles.cardContainer} url="/series" types="series"/>
                </div>
                <div className={styles.section}>
                    <div className={styles.titleSection}>
                        <h2>Mejor Valoradas</h2>
                        <Link to={`/movies`}>ver mas<i className="bi bi-chevron-right"></i></Link>
                    </div>
                    <CardContainer  className={styles.cardContainer} url="/movies/top_rated" types="movies"/>    
                </div>
            </div>
            <Footer></Footer>
        </div>

        
    )
}