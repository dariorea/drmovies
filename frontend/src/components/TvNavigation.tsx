import { useEffect } from "react"
import { useSpatialNavigation } from "@tv-spatial-navigation/react"

export const TvNavigation = () => {

    const navigation = useSpatialNavigation() as any

    useEffect(() => {

        const handleKeyDown = (event: KeyboardEvent) => {

            const keys = [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Enter"
            ]

            if (!keys.includes(event.key)) return

            const activeElement = document.activeElement

            if (
                event.key === "Enter" &&
                activeElement instanceof HTMLIFrameElement
            ) {
                console.log("🎬 ENTER → VIMEUS")
                return
            }

            navigation.handleKeyDown(event)
        }

        window.addEventListener("keydown", handleKeyDown)

        return () => {
            window.removeEventListener("keydown", handleKeyDown)
        }

    }, [navigation])

    return null
}