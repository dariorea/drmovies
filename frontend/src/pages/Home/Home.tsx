
import { CardContainer } from "../../components/CardContainer/CardContainer"
import { Hero } from "../../components/Hero/Hero"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./home.module.css"



export const Home = () => {

    
    return (
        <div className={styles.container}>
            <div className={styles.navbar}>
                <Navbar/>
            </div>

            <div className={styles.preHero}>
                <Hero url={`/movies/popular`} />
            </div>
            
            

            <div className={styles.mainContainer}>
                <div className={styles.section}>
                    <div className={styles.titleSection}>
                        <h2>Peliculas</h2>
                    </div>
                    <CardContainer className={styles.cardContainer} url="/movies" types="movies"/>    
                </div>
                <div className={styles.section}>
                    <div className={styles.titleSection}>
                        <h2>Series</h2>
                    </div>
                    <CardContainer className={styles.cardContainer} url="/series" types="series"/>
                </div>
                <div className={styles.section}>
                    <div className={styles.titleSection}>
                        <h2>Mejor Valoradas</h2>
                    </div>
                    <CardContainer  className={styles.cardContainer} url="/movies/top_rated" types="movies"/>    
                </div>
            </div>
        </div>
        

    )
}