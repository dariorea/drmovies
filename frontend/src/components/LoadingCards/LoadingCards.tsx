import { Logo } from "../Logo/Logo"
import styles from "./loadingcards.module.css"

export const LoadingCards = () => {
    return (
        <div className={styles.containerLoadingCards}>
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div>
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div>
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div>
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div>
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div> 
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div> 
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div>
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div> 
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div> 
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div> 
            <div className={styles.loadingCard}><Logo className={styles.logo}/></div>
        </div>
    )
}