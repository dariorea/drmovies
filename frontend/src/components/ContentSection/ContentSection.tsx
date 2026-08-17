import styles from "./contentSection.module.css"
import { Link } from "react-router-dom"
import { CardContainer } from "../CardContainer/CardContainer"

interface Props {
    title: string
    link: string
    url: string
    types: "movies" | "series"
    className: string
}

export const ContentSection = ({
    title,
    link,
    url,
    types,
    className
}: Props) => {

    return (
        <section className={styles.section}>

            <div className={styles.titleSection}>

                <h2>
                    {title}
                </h2>

                <Link to={link}>
                    ver mas
                    <i className="bi bi-chevron-right"></i>
                </Link>

            </div>

            <CardContainer
                className={className}
                url={url}
                types={types}
            />

        </section>
    )
}