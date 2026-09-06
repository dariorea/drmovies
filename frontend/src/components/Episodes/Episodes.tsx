import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { Media } from "../../types/Movie";
import styles from "./episodes.module.css";

import { SeasonCard } from "./SeasonCard";
import { EpisodeCard } from "./EpisodeCard";
import { EpisodePlayer } from "./EpisodePlayer";

interface Props {
    data: Media;
}

//const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL;

export const Episodes = ({ data }: Props) => {
    const { id } = useParams();

    const [season, setSeason] = useState<number | null>(null);
    const [episode, setEpisode] = useState<number | null>(null);

    const playerRef = useRef<HTMLDivElement>(null);
    const episodeRef = useRef<HTMLDivElement>(null);

    const selectedSeason = data.seasons?.find(
        (s) => s.season_number === season
    );

    const handleSeasonChange = (seasonNumber: number) => {
        setSeason(seasonNumber);
        setEpisode(null);
    };

    const handleEpisodeChange = (episodeNumber: number) => {
        setEpisode(episodeNumber);
    };

    // Scroll hacia los episodios al seleccionar una temporada
    useEffect(() => {
        if (season !== null) {
            episodeRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    }, [season]);

    // Scroll hacia el reproductor al seleccionar un episodio
    useEffect(() => {
        if (episode !== null) {
            playerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    }, [episode]);

    if (!data.seasons?.length) {
        return <p>No hay temporadas disponibles.</p>;
    }

    return (
        <div className={styles.mainContainer}>

            {/* ==================== */}
            {/* TEMPORADAS */}
            {/* ==================== */}

            <section>
                <div className={styles.titleContainer}>
                    <h2>Temporadas</h2>
                </div>

                <div className={styles.seasonContainer}>
                    {data.seasons.map((seasonItem) => (
                        <SeasonCard
                            key={seasonItem.id}
                            season={seasonItem}
                            onSelect={handleSeasonChange}
                        />
                    ))}
                </div>
            </section>

            {/* ==================== */}
            {/* REPRODUCTOR */}
            {/* ==================== */}

            <div ref={playerRef}>
                {season !== null && episode !== null && (
                    <EpisodePlayer
                        id={id}
                        season={season}
                        episode={episode}
                    />
                )}
            </div>

            {/* ==================== */}
            {/* EPISODIOS */}
            {/* ==================== */}

            <div ref={episodeRef}>
                {selectedSeason?.episodes?.length ? (
                    <div className={styles.titleContainer}>
                        <h2>T{season} Episodios</h2>
                    </div>
                ) : null}
            </div>

            <div className={styles.episodesContainer}>
                {selectedSeason?.episodes?.map((episodeItem) => (
                    <EpisodeCard
                        key={episodeItem.id}
                        episode={episodeItem}
                        onSelect={handleEpisodeChange}
                    />
                ))}
            </div>

        </div>
    );
};