import type { Season } from "../../types/Movie";
import styles from "./episodes.module.css";

interface Props {
    season: Season;
    onSelect: (seasonNumber: number) => void;
}

const IMG_BASE = import.meta.env.VITE_TMDB_IMAGE_URL;

export const SeasonCard = ({ season, onSelect }: Props) => {
    return (
        <div className={styles.seasonCard}>
            <button
                type="button"
                onClick={() => onSelect(season.season_number)}
            >
                <img
                    src={`${IMG_BASE}${season.poster_path}`}
                    alt={season.name}
                />
            </button>
        </div>
    );
}; 