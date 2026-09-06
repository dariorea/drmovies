import styles from "./episodes.module.css";

interface Props {
    id: string | undefined;
    season: number;
    episode: number;
}

const VIMEUS_VIEW_KEY = import.meta.env.VITE_VIMEUS_KEY_VIEW;

export const EpisodePlayer = ({
    id,
    season,
    episode,
}: Props) => {
    const videoUrl =
        `https://vimeus.com/e/serie` +
        `?tmdb=${id}` +
        `&view_key=${VIMEUS_VIEW_KEY}` +
        `&se=${season}` +
        `&ep=${episode}` +
        `&autoplay=1`;

    return (
        <div className={styles.reproductor}>
            <div className={styles.titleContainer}>
                <h2>
                    T{season} EP: {episode}
                </h2>
            </div>

            <iframe
                key={`${season}-${episode}`}
                className={styles.iframe}
                src={videoUrl}
                width="100%"
                height="300"
                frameBorder="0"
                allowFullScreen
                referrerPolicy="origin"
                title={`Temporada ${season}, episodio ${episode}`}
            />
        </div>
    );
};