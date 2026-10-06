import { Logo } from "../Logo/Logo"
import styles from "./footer.module.css"


export const Footer = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.containerLogo}>
                <Logo className={styles.logoDrMovies} />
            </div>
        </footer>
    )
}