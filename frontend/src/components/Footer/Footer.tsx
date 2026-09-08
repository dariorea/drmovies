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
                    <Link to={"/movies"}>Peliculas</Link>
                    <Link to={"/series"}>Series</Link>
                    <Link to={"#"}>Estrenos</Link>
                    <Link to={"/search"}>Buscar</Link>            
                </div>
                <div className={styles.linksSection}>
                    <Link to={"#"}>Reposotorio del Proyecto</Link>
                    <Link to={""}>Portafolio</Link>
                    <Link to={"#"}>Perfil</Link>
                    <Link to={"#"}> Contacto</Link>            
                </div>
            </div>
            
        </footer>
    )
}