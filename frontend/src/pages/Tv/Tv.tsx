import { CardContainer } from "../../components/CardContainer/CardContainer"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./tv.module.css"
export const Tv = () => {
    return (
        <div className={styles.container}>
            <Navbar />
            <div className={styles.titleContainer}>
                <h1>Series</h1>
                <p>Explora y descubre las mejores Peliculas en nuestro catalogo</p>
            </div>
            <h2>Tendencias</h2>
            <CardContainer className={styles.cardContainer} url="/series" types="series" /> 
        </div>
    )
}