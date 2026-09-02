import styles from "./contentSection.module.css"
import { Link } from "react-router-dom"
import { CardContainer } from "../CardContainer/CardContainer"

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
                <Link to={!link ? "" : link}>ver mas<i className="bi bi-chevron-right"></i></Link>
            </div>

            <CardContainer url={url} types={types}/>

        </section>
    )
}