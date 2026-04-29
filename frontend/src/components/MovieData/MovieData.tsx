
import type { Media } from "../../types/Movie"
import styles from "./moviedata.module.css"

interface Props {
    data: Media 

}

export const MovieData = ({data}: Props) => {

    const logo = data.logo || data.logoFanart
    const title = data.title || data.name
    
    return (
        
        <div className={styles.container}>
            <img className={styles.movieLogo} src={`${logo}`} alt={title} />
        </div>
        

        
    )
}