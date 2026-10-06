
import { ContentSection } from "../../components/ContentSection/ContentSection";
import { Footer } from "../../components/Footer/Footer";
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./series.module.css"


export const Series = () => {
    const genres = [
        { id: 10759, name: "Acción y aventura" },
        { id: 35, name: "Comedia" },
        { id: 80, name: "Crimen" },
        { id: 10765, name: "Ciencia ficción y fantasía" },
        { id: 9648, name: "Misterio" },
        { id: 10749, name: "Romance" },
        { id: 99, name: "Documental" }
    ];

    return (
        <div className={styles.container}>
            <Navbar />
            <ContentSection title={"Tendencias"} url={"/series"} types="series"/>
            <ContentSection
                title="Dramas Coreanos"
                url="/series/discover?country=KR&genre=18"
                types="series"
            />
            <ContentSection
                title="Animes"
                url="/series/discover?country=JP&genre=16"
                types="series"
            />
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