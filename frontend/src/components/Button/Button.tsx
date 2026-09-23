import React from "react"
import styles from "./button.module.css"

interface Props {
    action?: () => void
    children: React.ReactNode
    color: string
}

export const Button = ({action, children, color}: Props) => {
    return (
        <button data-tv-focusable style={{ backgroundColor: `var(${color})`  }} className={styles.btnCustom} onClick={action}>{children}</button>
    )
}