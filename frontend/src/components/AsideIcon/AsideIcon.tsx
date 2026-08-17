import styles from "./asideIcon.module.css"
import { Aside } from "../../components/Aside/Aside"
import { useEffect, useState } from "react"



export const AsideIcon = ()=> {

    const [isActive, setIsActive] = useState(false)
    const [isVisible, setIsVisible] = useState(false)



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


    const activar = () => {
        if (!isActive) {
            setIsVisible(true)
            setIsActive(true)
        } else {
            setIsActive(false)
    
            setTimeout(() => {
                setIsVisible(false)
            }, 500)
        }
    }
    return (
        <>
            <div onClick={activar} className={styles.asideIcon}>
                <i className="bi bi-list"></i>
            </div>
    
            {isVisible && (
                <div className={styles.asideContainer}>
    
                    {/* Fondo */}
                    <div
                        className={`
                            ${styles.overlay}
                            animate__animated
                            ${isActive
                                ? "animate__fadeIn"
                                : "animate__fadeOut"
                            }
                        `}
                        onClick={activar}
                    />
    
                    {/* Menú */}
                    <div
                        className={`
                            ${styles.asideWrapper}
                            animate__animated
                            ${isActive
                                ? "animate__fadeInRightBig"
                                : "animate__fadeOutRightBig"
                            }
                        `}
                    >
                        <Aside action={activar} />
                    </div>
    
                </div>
            )}
        </>
    )
}