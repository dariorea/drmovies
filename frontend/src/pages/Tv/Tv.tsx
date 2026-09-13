import { CardContainer } from "../../components/CardContainer/CardContainer"
import { ContentSection } from "../../components/ContentSection/ContentSection";
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
    return (
        <div className={styles.container}>
            <Navbar />
            <div className={styles.titleContainer}>
                <h1>Series</h1>
                <p>Explora y descubre las mejores Series en nuestro catalogo</p>
            </div>
            <h2>Tendencias</h2>
            <CardContainer url="/series" types="series" />
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
            
        </div>
    )
}