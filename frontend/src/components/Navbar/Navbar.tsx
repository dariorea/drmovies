import { Logo } from "../Logo/Logo"
import { Link, NavLink } from "react-router-dom"
import styles from "./navbar.module.css"


export const Navbar = () => {

  return (
    <>
    <nav className={styles.navbar}>
        <Link className={styles.logoContainer} to="/">
            <Logo className={styles.logo} />
        </Link>
        
        <ul className={styles.navLinks}>
            <li>
                <NavLink to="/movies" className={({ isActive }) => isActive ? styles.active : ""}>
                    Películas
                </NavLink>
            </li>
            <li>
                <NavLink to="/series" className={({ isActive }) => isActive ? styles.active : ""}>
                    Series
                </NavLink>
            </li>
            <li>
                <NavLink to="/search" className={({ isActive }) => isActive ? styles.active : ""}>
                    <i className="bi bi-search-heart"></i> Buscar
                </NavLink>
            </li>
        </ul>
        
    </nav>
    </>
  )
}


//SW-191 Dream play! My Father Secretly Erects In My Daughter's Body Around The Daughter Who Noticed The Hardened Ji ○ Port Secretly Inserted It Into My Mother
