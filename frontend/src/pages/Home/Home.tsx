import { Footer } from "../../components/Footer/Footer"
import { Hero } from "../../components/Hero/Hero"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./home.module.css"
import { ContentSection } from "../../components/ContentSection/ContentSection"



export const Home = () => {

    
    return (
        <div className={styles.container}>
        <div className={styles.mainContainer}>
            <Navbar />
        </div>
        <Hero url={`/movies`} />
            <div className={styles.mainContainer}>
                <ContentSection
                    title="Peliculas"
                    url="/movies"
                    types="movies"
                    icon="bi bi-fire"

                />
                <ContentSection
                    title="Series"
                    url="/series"
                    types="series"
                    icon="bi bi-tv"
                />

                <ContentSection
                    title="Mejor Valoradas"
                    url="/movies/top_rated"
                    types="movies"
                    icon="bi bi-trophy-fill"

                />
            </div>
            <Footer />
        </div>
    )
}