import { ContentSection } from "../../components/ContentSection/ContentSection"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./movies.module.css"


export const Movies = () => {

    return (
        <div className={styles.container}>
            <Navbar />
            <div className={styles.titleContainer}>
                <h1>Peliculas</h1>
                <p>Explora y descubre las mejores Peliculas en nuestro catalogo</p>
            </div>
            <ContentSection
                title="Tendencias"
                url="/movies"
                types="movies"
            />
            <ContentSection
                title="Acción"
                url="/movies/genre/28"
                types="movies"
            />
            <ContentSection
                title="Comedia"
                url="/movies/genre/35"
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

        </div>
    )
}