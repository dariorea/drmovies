import type { Media } from "../../types/Movie"

interface Props {
    data: Media
    className: string
}

export const Background = ({data, className}: Props) => {
    const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL

    return (
        <div  className={className} style={{
            backgroundImage: `
                linear-gradient(
                    to top,
                    black 10%,
                    transparent 100%
                ),
                url(${IMG_BASE}${data.backdrop_path})`
            }}>
        </div>
    )
}