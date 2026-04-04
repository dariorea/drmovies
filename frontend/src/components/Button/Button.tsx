import React from "react"
import styles from "./button.module.css"

interface Props {
    action: () => void
    children: React.ReactNode
}

export const Button = ({action, children}: Props) => {
    return (
        <button className={styles.btnCustom} onClick={action}>{children}</button>
    )
}