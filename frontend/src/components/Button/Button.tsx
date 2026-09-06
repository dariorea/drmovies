import React from "react"
import styles from "./button.module.css"

interface Props {
    action?: () => void
    children: React.ReactNode
    color: string
}

export const Button = ({action, children, color}: Props) => {
    return (
        <button style={{ backgroundColor: `var(${color})`  }} className={styles.btnCustom} onClick={action}>{children}</button>
    )
}