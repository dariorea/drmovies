import { Logo } from "../Logo/Logo"
import { Link, NavLink } from "react-router-dom"
import styles from "./navbar.module.css"

export const Navbar = () => {
  return (
    <nav className={styles.navbar}>
        <Link className={styles.logoContainer} to="/">
            <Logo className={styles.logo} />
        </Link>
        
        <ul className={styles.navLinks}>
            <li>
                <NavLink to="/peliculas" className={({ isActive }) => isActive ? styles.active : ""}>
                    Películas
                </NavLink>
            </li>
            <li>
                <NavLink to="/series" className={({ isActive }) => isActive ? styles.active : ""}>
                    Series
                </NavLink>
            </li>
            <li>
                <NavLink to="/buscar" className={({ isActive }) => isActive ? styles.active : ""}>
                    Buscar
                </NavLink>
            </li>
        </ul>
    </nav>
  )
}