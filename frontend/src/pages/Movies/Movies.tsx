import { ContentSection } from "../../components/ContentSection/ContentSection"
import { Footer } from "../../components/Footer/Footer"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./movies.module.css"


export const Movies = () => {

    return (
        <div className={styles.container}>
           <Navbar /> 
            <ContentSection
                title="Tendencias"
                url="/movies"
                types="movies"
            />
            <ContentSection
                title="Películas 2026"
                url="/movies/discover?year=2026"
                types="movies"
            />
            <ContentSection
                title="Comedia"
                url="/movies/genre/35"
                types="movies"
            />
            <ContentSection
                title="Películas de Corea del Sur"
                url="/movies/discover?country=KR"
                types="movies"
            />

            <ContentSection
                title="Crimen"
                url="/movies/genre/80"
                types="movies"
            />
            <ContentSection
                title="Animación"
                url="/movies/genre/16"
                types="movies"
            />
            <ContentSection
                title="Terror"
                url="/movies/genre/27"
                types="movies"
            />
            <ContentSection
                title="Drama"
                url="/movies/genre/18"
                types="movies"
            />
            <ContentSection
                title="Ciencia Ficcion"
                url="/movies/genre/878"
                types="movies"
            />
            <ContentSection
                title="Thriller"
                url="/movies/genre/53"
                types="movies"
            />
            <Footer />
        </div>
    )
}