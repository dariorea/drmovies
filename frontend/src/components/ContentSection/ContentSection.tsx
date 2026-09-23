import styles from "./contentSection.module.css"
import { Link } from "react-router-dom"
import { CardContainer } from "../CardContainer/CardContainer"
import { TvRegion } from "../TvRegion/TvRegion"

interface Props {
    title: string
    link?: string
    url: string
    types: "movies" | "series"
}

export const ContentSection = ({
    title,
    link,
    url,
    types
}: Props) => {

    return (
        <section className={styles.section}>

            <div className={styles.titleSection}>

                <h3>{title}</h3>

                {link && (
                    <Link
                        className={styles.verMas}
                        to={link}
                        tabIndex={-1}
                    >
                        <p>ver más</p>
                        <i className="bi bi-chevron-right"></i>
                    </Link>
                )}

            </div>

            <TvRegion
                id={`section-${title}`}
                type="row"
                focusClassName="tv-focused-card"
            >
                <div className={styles.containerCard}>
                    <CardContainer
                        url={url}
                        types={types}
                    />
                </div>
            </TvRegion>

        </section>
    )
}