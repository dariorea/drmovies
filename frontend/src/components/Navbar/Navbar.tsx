import { Logo } from "../Logo/Logo"
import { Link, NavLink } from "react-router-dom"
import styles from "./navbar.module.css"
import { AsideIcon } from "../AsideIcon/AsideIcon"
import { TvRegion } from "../TvRegion/TvRegion"

export const Navbar = () => {

    return (
        <TvRegion
            id="navbar"
            type="row"
            className={styles.tvRegion}
            focusClassName="tv-focused-hero"
            >
            <nav className={styles.navbar}>

                <Link
                    className={styles.logoContainer}
                    to="/"
                >
                    <Logo className={styles.logo} />
                </Link>

                <ul className={styles.navLinks}>
                    <li>
                        <NavLink
                            to="/"
                            data-tv-focusable
                            className={({ isActive }) =>
                                isActive
                                    ? styles.active
                                    : ""
                            }
                        >
                            Inicio
                        </NavLink>
                    </li>
                    <li>
                        <NavLink
                            to="/movies"
                            data-tv-focusable
                            className={({ isActive }) =>
                                isActive
                                    ? styles.active
                                    : ""
                            }
                        >
                            Películas
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/series"
                            data-tv-focusable
                            className={({ isActive }) =>
                                isActive
                                    ? styles.active
                                    : ""
                            }
                        >
                            Series
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/search"
                            data-tv-focusable
                            className={({ isActive }) =>
                                isActive
                                    ? styles.active
                                    : ""
                            }
                        >
                            Buscar
                        </NavLink>
                    </li>

                </ul>

                <AsideIcon />

            </nav>
        </TvRegion>
    )
}