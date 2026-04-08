import { NavLink, } from "react-router-dom"
import styles from "./aside.module.css"

interface Props {
    className: string
    action: () => void
}


export const Aside = ({className, action}: Props) => {
    return (
        <div className={className}>
            <div className={styles.navContainer}>
                <div className={styles.menuContainer}>
                    <h1>Menu</h1>
                    <i onClick={action} className="bi bi-x-lg"></i>
                </div>
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
            
        </div>
    )
}