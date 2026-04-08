import { Logo } from "../Logo/Logo"
import { Link, NavLink } from "react-router-dom"
import styles from "./navbar.module.css"
import { useState, useEffect } from "react"
import { Aside } from "../Aside/Aside"

export const Navbar = () => {
    const [isActive, setIsActive] = useState(false)


    const activar = () => {
        if(!isActive){
            setIsActive(true)
            return
        }
        setIsActive(false)
    }

    useEffect(() => {
        if (isActive) {
          document.body.style.overflow = "hidden"
        } else {
          document.body.style.overflow = "auto"
        }
      
        return () => {
          document.body.style.overflow = "auto"
        }
      }, [isActive])
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
                    Buscar
                </NavLink>
            </li>
        </ul>
        <div onClick={activar} className={styles.asideIcon}>
            <i className="bi bi-list"></i>
        </div>
    </nav>
    <div className={styles.asideContainer}>
        <Aside action={activar} className={isActive ? styles.isActive : styles.desactive}/> 
    </div>
    </>
  )
}