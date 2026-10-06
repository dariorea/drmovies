import {
    useEffect,
    useRef
} from "react"

import type {
    Media
} from "../../types/Movie"

import { SeasonCard } from "./SeasonCard"
import { EpisodeCard } from "./EpisodeCard"

import { TvRegion } from "../TvRegion/TvRegion"

import styles from "./seriesepisodes.module.css"
 
interface Props {
    data: Media

    season:
        number | null

    episode:
        number | null 

    onSeasonChange:
        (season: number) => void

    onEpisodeChange:
        (episode: number) => void
}


export const SeriesEpisodeSelector = ({
    data,
    season,
    onSeasonChange,
    onEpisodeChange
}: Props) => {

    const episodeRef = useRef<HTMLDivElement | null>(null)


    const selectedSeason =
        data.seasons?.find(
            item =>
                item.season_number === season
        )


    // =========================================
    // Scroll cuando cambia la temporada
    // =========================================

    useEffect(() => {

        if (season !== null) {

            setTimeout(() => {

                episodeRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                })

            }, 100)
        }

    }, [season])


    // =========================================
    // Sin temporadas
    // =========================================

    if (!data.seasons?.length) {

        return (
            <p>
                No hay temporadas disponibles.
            </p>
        )
    }


    return (
        <div className={styles.mainContainer}>

            {/* ================================= */}
            {/* TEMPORADAS */}
            {/* ================================= */}

            <section >

                <div id="series-episodes" className={styles.titleContainer}>

                    <h2>
                        Temporadas
                    </h2>

                </div>


                <TvRegion
                    id="season"
                    className={styles.seasonContainer}
                    focusClassName="tv-focused-card"
                >

                    {data.seasons.map(
                        seasonItem => (

                            seasonItem.name === "Especiales"? "" :
                            <SeasonCard
                                key={
                                    seasonItem.id
                                }
                                season={
                                    seasonItem
                                }
                                onSelect={
                                    onSeasonChange
                                }
                            />

                        )
                    )}

                </TvRegion>

            </section>


            {/* ================================= */}
            {/* EPISODIOS */}
            {/* ================================= */}

            <div ref={episodeRef}>



            <TvRegion
                id="episode"
                type="row"
                className={
                    styles.episodesContainer
                }
                focusClassName="tv-focused-ep"
                scrollOffset={200}
            >

                {selectedSeason?.episodes?.map(
                    episodeItem => (

                        <EpisodeCard
                            key={
                                episodeItem.id
                            }
                            episode={
                                episodeItem
                            }
                            onSelect={
                                onEpisodeChange
                            }
                        />

                    )
                )}

            </TvRegion>
            </div>


        </div>
    )
}