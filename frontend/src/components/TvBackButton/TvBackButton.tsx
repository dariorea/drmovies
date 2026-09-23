import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { App } from "@capacitor/app"

export const TvBackButton = () => {

    const navigate = useNavigate()

    useEffect(() => {

        const handleKeyDown = (event: KeyboardEvent) => {

            const backKeys = [
                "Escape",
                "BrowserBack",
                "GoBack"
            ]

            if (!backKeys.includes(event.key)) {
                return
            }

            event.preventDefault()

            navigate(-1)
        }

        window.addEventListener(
            "keydown",
            handleKeyDown
        )


        const backButtonListener =
            App.addListener(
                "backButton",
                () => {

                    navigate(-1)

                }
            )


        return () => {

            window.removeEventListener(
                "keydown",
                handleKeyDown
            )

            backButtonListener.then(
                listener => listener.remove()
            )

        }

    }, [navigate])

    return null
}