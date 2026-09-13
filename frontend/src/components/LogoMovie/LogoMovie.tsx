import type { Media } from "../../types/Movie";
import styles from "./itemlogo.module.css"


interface Props {
    data: Media
}

export const LogoMovie = ({data}: Props) => {

        console.log(data)
        const title = data.title || data.name


        return(
            <>
            <div className={styles.container}>
                <img className={styles.logo} src={`https://image.tmdb.org/t/p/original${data.logo}`} alt={title} />
            </div>
            </>
        )
}