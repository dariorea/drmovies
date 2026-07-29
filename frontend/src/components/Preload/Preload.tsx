import { Logo } from "../Logo/Logo"
import styles from "./preload.module.css"


export const Preload = () => {
    return (
        <div  className={styles.preload}>
            <Logo className={styles.movieLogo}/>
        </div>
    )
}