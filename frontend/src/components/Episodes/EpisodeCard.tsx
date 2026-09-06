import type { Episode } from "../../types/Movie";
import styles from "./episodes.module.css";

interface Props {
    episode: Episode;
    onSelect: (episodeNumber: number) => void;
}

const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL;

export const EpisodeCard = ({ episode, onSelect }: Props) => {
    return (
        <button
            type="button"
            className={styles.episodesCard}
            onClick={() => onSelect(episode.episode_number)}
        >
            <img
                src={
                    episode.still_path
                        ? `${IMG_BASE}${episode.still_path}`
                        : ""
                }
                alt={episode.name}
            />

            <div className={styles.episodeData}>
                <p>
                    EP{episode.episode_number} - {episode.name}
                </p>
            </div>
        </button>
    );
};