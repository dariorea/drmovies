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

            navigation.handleKeyDown(event)
        }

        window.addEventListener("keydown", handleKeyDown)

        return () => {
            window.removeEventListener("keydown", handleKeyDown)
        }

    }, [navigation])

    return null
}