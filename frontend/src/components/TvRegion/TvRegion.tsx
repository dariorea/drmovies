import {
    useEffect,
    useRef,
    type ReactNode
} from "react"

import {
    useSpatialNavigation,
    useNavSnapshot
} from "@tv-spatial-navigation/react"

interface Props {
    id: string
    type?: "row" | "sidebar" | "form"
    children: ReactNode
    className?: string
    focusClassName?: string
}

export const TvRegion = ({
    id,
    type = "row",
    children,
    className,
    focusClassName
}: Props) => {

    const containerRef = useRef<HTMLDivElement>(null)

    const navigation = useSpatialNavigation()
    const snapshot = useNavSnapshot()


    // Registrar la región
    useEffect(() => {

        navigation.setEnabled(true)

        const container = containerRef.current

        if (!container) return


        const registerItems = () => {

            const items = Array.from(
                container.querySelectorAll<HTMLElement>(
                    "[data-tv-focusable]"
                )
            )

            if (!items.length) return

            navigation.registerRegion({
                id,
                items,
                type
            })
        }


        registerItems()


        const observer = new MutationObserver(() => {
            registerItems()
        })


        observer.observe(container, {
            childList: true,
            subtree: true
        })


        return () => {
            observer.disconnect()
        }

    }, [
        id,
        type,
        navigation
    ])


    // Aplicar foco visual
    useEffect(() => {

        const container = containerRef.current

        if (!container) return

        const items = Array.from(
            container.querySelectorAll<HTMLElement>(
                "[data-tv-focusable]"
            )
        )


        // Quitar foco anterior
        items.forEach(item => {

            if (focusClassName) {
                item.classList.remove(focusClassName)
            }

        })


        if (!snapshot.focusKey) return


        const [focusedRegion, focusedIndex] =
            snapshot.focusKey.split(":")


        if (focusedRegion !== id) return


        const index = Number(focusedIndex)

        if (Number.isNaN(index)) return


        const focusedItem = items[index]

        if (!focusedItem) return


        if (focusClassName) {
            focusedItem.classList.add(focusClassName)
        }

    }, [
        snapshot.focusKey,
        id,
        focusClassName
    ])


    return (
        <div
            ref={containerRef}
            className={className}
        >
            {children}
        </div>
    )
}