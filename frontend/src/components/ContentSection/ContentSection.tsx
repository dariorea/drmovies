import styles from "./contentSection.module.css"
import { CardContainer } from "../CardContainer/CardContainer"
import { TvRegion } from "../TvRegion/TvRegion"

interface Props {
    title: string
    link?: string
    url: string
    types: "movies" | "series" | "anime"
    icon?: string
}

export const ContentSection = ({
    title,
    url,
    types,
    icon
}: Props) => {

    return (
        <section className={styles.section}>

            <div className={styles.titleSection}>
                <i className={icon}></i>
                <h3>{title}</h3>
            </div>

            <TvRegion
                id={`section-${title}`}
                type="row"
                focusClassName="tv-focused-card"
                className={styles.region}
                scrollOffset={100}

            >
                <CardContainer url={url} types={types}/>
            </TvRegion>

        </section>
    )
}