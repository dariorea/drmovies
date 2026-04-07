import { NavLink, } from "react-router-dom"
import styles from "./aside.module.css"

interface Props {
    className: string
}


export const Aside = ({className}: Props) => {
    return (
        <div className={className}>
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
                    Buscar
                </NavLink>
            </li>
        </ul>
        </div>
    )
}