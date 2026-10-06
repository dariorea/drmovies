import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"

import { Navbar } from "../../components/Navbar/Navbar"
import { Background } from "../../components/Background/Background"
import { ContentSection } from "../../components/ContentSection/ContentSection"
import { Footer } from "../../components/Footer/Footer"
import { Preload } from "../../components/Preload/Preload"

import { SeriesEpisodeSelector } from "../../components/SeriesEpisodes/SeriesEpisodesSelector"

import { useFetch } from "../../hooks/useFetch"
import type { Media } from "../../types/Movie"

import styles from "./seriedetail.module.css"
import { SeriesPlayer } from "../../components/SeriesEpisodes/SeriesPlayer"

export const SeriesDetail = () => {

    const { id } = useParams()

    useEffect(() => {
        setSeason(null)
        setEpisode(null)
    }, [id])

    const {data, loading, error } = useFetch<Media>(`/series/${id}`)

    const [season, setSeason] = useState<number | null>(null)

    const [episode, setEpisode] = useState<number | null>(null)

    const playerRef = useRef<HTMLDivElement | null>(null)



    // =========================================
    // Seleccionar temporada
    // =========================================

    const handleSeasonChange =
        (seasonNumber: number) => {

            setSeason(seasonNumber)

            // Al cambiar de temporada
            // dejamos de tener un episodio seleccionado.
            setEpisode(null)
        }


    // =========================================
    // Seleccionar episodio
    // =========================================

    const handleEpisodeChange =
        (episodeNumber: number) => {

            setEpisode(
                episodeNumber
            )
        }


    // =========================================
    // Scroll hacia reproductor
    // =========================================

    useEffect(() => {

        if (episode !== null) {

            setTimeout(() => {

                playerRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                })

            }, 100)
        }

    }, [episode])


    // =========================================
    // Scroll desde Background
    // =========================================

    const handleEpisodesNavigation = () => {

        setTimeout(() => {

            document
                .getElementById("series-episodes")
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                })

        }, 100)
    }


    // =========================================
    // Estados
    // =========================================

    if (loading) {
        return <Preload />
    }

    if (error) {
        return (
            <p>
                Error: {error.message}
            </p>
        )
    }

    if (!data) {
        return <Preload />
    }
    return (
        <div className={styles.containerAll}>
            <div className={styles.container}>
                <Navbar />
            </div>
            <Background
                className={styles.containerBackground}
                data={data}
                optionOne={handleEpisodesNavigation}
            />
                
                
            <div className={styles.container}>
                        <SeriesEpisodeSelector
                            data={data}
                            season={season}
                            episode={episode}
                            onSeasonChange={
                                handleSeasonChange
                            }
                            onEpisodeChange={
                                handleEpisodeChange
                            }
                        />
                
                {season !== null &&
                    episode !== null && (
                        <div className={styles.playerContainer} >
                            <SeriesPlayer
                                id={Number(id)}
                                season={season}
                                episode={episode}
                            />
                        </div>
                    )
                }   
                <ContentSection
                    title="Series similares"
                    url={`/series/recommendations/${id}`}
                    types="series"
                />
            </div>
            <Footer />
        </div>
    )
}