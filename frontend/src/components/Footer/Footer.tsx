import { Link } from "react-router-dom"
import { Logo } from "../Logo/Logo"
import styles from "./footer.module.css"


export const Footer = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.containerLogo}>
                <Logo className={styles.logoDrMovies} />
            </div>
            <div className={styles.containerSection}>
                <div className={styles.linksSection}>
                    <Link to={"#"}><i className="bi bi-github"> (Repo del Proyecto)</i></Link>
                    <Link to={""}><i className="bi bi-briefcase-fill"> Portafolio</i></Link>
                    <Link to={"#"}><i className="bi bi-github"> (Perfil)</i></Link>
                    <Link to={"#"}><i className="bi bi-envelope-at"> Contacto</i></Link>            
                </div>
                <div className={styles.linksSection}>
                    <Link to={"/movies"}>Peliculas</Link>
                    <Link to={"/series"}>Series</Link>
                    <Link to={"#"}>Estrenos</Link>
                    <Link to={"/search"}>Buscar</Link>            
                </div>
            </div>
            <p>2026</p>
            
        </footer>
    )
}