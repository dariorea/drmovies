
import { useState, useEffect } from "react";
import { ContentSection } from "../../components/ContentSection/ContentSection";
import { Footer } from "../../components/Footer/Footer";
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./tv.module.css"


export const Tv = () => {
    const genres = [
        { id: 10759, name: "Acción y aventura" },
        { id: 35, name: "Comedia" },
        { id: 80, name: "Crimen" },
        { id: 18, name: "Drama" },
        { id: 10765, name: "Ciencia ficción y fantasía" },
        { id: 9648, name: "Misterio" },
        { id: 10749, name: "Romance" },
        { id: 99, name: "Documental" }
    ];
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
            <div className={styles.titleContainer}>
                <h1>Series</h1>
                <p>Explora y descubre las mejores Series en nuestro catalogo</p>
            </div>
            {genres.map((g) => {
                return (
                    <ContentSection
                    key={g.id}
                    title={g.name}
                    url={`/series/genre/${g.id}`}
                    types="series"
                    />
                );
            })}
            <Footer />
        </div>
    )
}