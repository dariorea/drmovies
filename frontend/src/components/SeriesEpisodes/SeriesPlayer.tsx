import {
    useEffect,
    useRef,
    useState
} from "react";

import styles from "./seriesepisodes.module.css";
import { TvRegion } from "../TvRegion/TvRegion";
import { EpisodePlayer } from "../Episodes/EpisodePlayer";

interface Props {
    id: number;
    season: number;
    episode: number;
}

interface StreamSource {
    source: string;
}

interface StreamResponse {
    sources?: StreamSource[];
    error?: string;
}

export const SeriesPlayer = ({
    id,
    season,
    episode
}: Props) => {
    // =========================================
    // STREAM
    // =========================================

    const [streamUrl, setStreamUrl] = useState<string | null>(null);


    const triedSourcesRef = useRef<Set<number>>(new Set());
    const currentSourceIndexRef = useRef(0);
    const sourcesRef = useRef<StreamSource[]>([]);
    const apiUrl = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // =========================================
    // VIDEO
    // =========================================

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const sourceRequestRef = useRef(0);

    // =========================================
    // CONTROLES
    // =========================================

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const [showControls, setShowControls] = useState(true);

    const controlsTimerRef =
        useRef<ReturnType<typeof setTimeout> | null>(null);

    // =========================================
    // OBTENER STREAM
    // =========================================

    useEffect(() => {
        if (!id || !apiUrl) {
            setError("Falta la configuración de la API.");
            setLoading(false);
            return;
        }

        const controller = new AbortController();

        const loadStream = async () => {
            try {
                setLoading(true);
                setError(null);
                setStreamUrl(null);
                sourcesRef.current = [];

                currentSourceIndexRef.current = 0;
                triedSourcesRef.current.clear();
                sourceRequestRef.current++;

                setVideoError(false);
                setIsPlaying(false);
                setIsLoading(true);
                setCurrentTime(0);
                setDuration(0);

                const response = await fetch(
                    `${apiUrl}/series/${id}/stream` +
                    `?season=${season}&episode=${episode}`,
                    { signal: controller.signal }
                );

                const data: StreamResponse = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error || `Error HTTP ${response.status}`
                    );
                }

                // El backend devuelve solo los identificadores,
                // nunca las URLs IPTV ni las credenciales.
                const availableSources = Array.isArray(data.sources)
                    ? data.sources.filter(
                        (item): item is StreamSource =>
                            typeof item?.source === "string" &&
                            /^lista-\d+$/i.test(item.source)
                    )
                    : [];

                if (availableSources.length === 0) {
                    throw new Error(
                        "El episodio no tiene fuentes IPTV válidas."
                    );
                }

                sourcesRef.current = availableSources;

                triedSourcesRef.current.add(0);
                currentSourceIndexRef.current = 0;

                console.log(
                    `📺 Fuentes disponibles: ${availableSources.length}`,
                    availableSources.map(item => item.source)
                );

                setStreamUrl(
                    `${apiUrl}/series/${id}/proxy` +
                    `?season=${season}` +
                    `&episode=${episode}` +
                    `&sourceIndex=0`
                );
            } catch (err) {
                if (
                    err instanceof DOMException &&
                    err.name === "AbortError"
                ) {
                    return;
                }

                setError(
                    err instanceof Error
                        ? err.message
                        : "Error desconocido al cargar el episodio."
                );
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void loadStream();

        return () => controller.abort();
    }, [id, season, episode, apiUrl]);

    // =========================================
    // PROBAR LA SIGUIENTE FUENTE
    // =========================================

    const tryNextSource = () => {
        const availableSources = sourcesRef.current;
        const currentIndex = currentSourceIndexRef.current;

        const nextIndex = availableSources.findIndex(
            (_, index) =>
                index > currentIndex &&
                !triedSourcesRef.current.has(index)
        );

        if (nextIndex === -1) {
            console.error("❌ No quedan fuentes alternativas.");

            setVideoError(true);
            setIsLoading(false);
            setIsPlaying(false);
            return;
        }

        triedSourcesRef.current.add(nextIndex);
        currentSourceIndexRef.current = nextIndex;

        setVideoError(false);
        setIsLoading(true);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);

        console.warn(
            `⚠️ Falló la fuente ${currentIndex + 1}. ` +
            `Probando fuente ${nextIndex + 1}/${availableSources.length}:`,
            availableSources[nextIndex].source
        );

        setStreamUrl(
            `${apiUrl}/series/${id}/proxy` +
            `?season=${season}` +
            `&episode=${episode}` +
            `&sourceIndex=${nextIndex}`
        );
    };

    // =========================================
    // EVENTOS DEL VIDEO
    // =========================================

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !streamUrl) return;

        // Identifica la fuente asociada a estos eventos.
        const requestId = ++sourceRequestRef.current;

        const isCurrentRequest = () =>
            sourceRequestRef.current === requestId;

        const handleLoadedMetadata = () => {
            if (!isCurrentRequest()) return;

            setDuration(
                Number.isFinite(video.duration) ? video.duration : 0
            );
            setIsLoading(false);
        };

        const handleTimeUpdate = () => {
            if (!isCurrentRequest()) return;
            setCurrentTime(video.currentTime);
        };

        const handlePlay = () => {
            if (!isCurrentRequest()) return;
            setIsPlaying(true);
        };

        const handlePause = () => {
            if (!isCurrentRequest()) return;
            setIsPlaying(false);
        };

        const handleWaiting = () => {
            if (!isCurrentRequest()) return;
            setIsLoading(true);
        };

        const handlePlaying = () => {
            if (!isCurrentRequest()) return;
            setIsLoading(false);
            setVideoError(false);
        };

        const handleError = () => {
            if (!isCurrentRequest()) return;
            tryNextSource();
        };

        video.addEventListener("loadedmetadata", handleLoadedMetadata);
        video.addEventListener("timeupdate", handleTimeUpdate);
        video.addEventListener("play", handlePlay);
        video.addEventListener("pause", handlePause);
        video.addEventListener("waiting", handleWaiting);
        video.addEventListener("playing", handlePlaying);
        video.addEventListener("error", handleError);

        return () => {
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
            video.removeEventListener("timeupdate", handleTimeUpdate);
            video.removeEventListener("play", handlePlay);
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("waiting", handleWaiting);
            video.removeEventListener("playing", handlePlaying);
            video.removeEventListener("error", handleError);

            if (sourceRequestRef.current === requestId) {
                sourceRequestRef.current++;
            }
        };
    }, [streamUrl, id, season, episode]);

    // =========================================
    // TIMER DE CONTROLES
    // =========================================

    const resetControlsTimer = () => {
        setShowControls(true);

        if (controlsTimerRef.current) {
            clearTimeout(controlsTimerRef.current);
        }

        controlsTimerRef.current = setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) {
                setShowControls(false);
            }
        }, 3000);
    };

    useEffect(() => {
        return () => {
            if (controlsTimerRef.current) {
                clearTimeout(controlsTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (isPlaying) {
            resetControlsTimer();
        } else {
            setShowControls(true);

            if (controlsTimerRef.current) {
                clearTimeout(controlsTimerRef.current);
                controlsTimerRef.current = null;
            }
        }
    }, [isPlaying]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const keys = [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Enter",
                "Escape",
                " "
            ];

            if (keys.includes(event.key)) {
                resetControlsTimer();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    // =========================================
    // PLAY / PAUSE
    // =========================================

    const togglePlay = async () => {
        const video = videoRef.current;

        if (!video) return;

        try {
            if (video.paused) {
                await video.play();
            } else {
                video.pause();
            }
        } catch (err) {
            console.error("No se pudo reproducir:", err);
        }
    };

    // =========================================
    // SEEK
    // =========================================

    const seek = (seconds: number) => {
        const video = videoRef.current;

        if (!video || !Number.isFinite(video.duration)) return;

        video.currentTime = Math.max(
            0,
            Math.min(video.currentTime + seconds, video.duration)
        );
    };

    // =========================================
    // PROGRESO
    // =========================================

    const handleProgress = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const video = videoRef.current;

        if (!video) return;

        const time = Number(event.target.value);

        video.currentTime = time;
        setCurrentTime(time);
    };

    // =========================================
    // VOLUMEN
    // =========================================

    const handleVolume = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const video = videoRef.current;

        if (!video) return;

        const value = Number(event.target.value);

        video.volume = value;
        setVolume(value);
    };

    // =========================================
    // FULLSCREEN
    // =========================================

    const toggleFullscreen = async () => {
        const container = videoRef.current?.parentElement;

        if (!container) return;

        try {
            if (!document.fullscreenElement) {
                await container.requestFullscreen();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (err) {
            console.error("No se pudo cambiar pantalla completa:", err);
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange
            );
        };
    }, []);

    // =========================================
    // FORMATEAR TIEMPO
    // =========================================

    const formatTime = (time: number) => {
        if (!Number.isFinite(time) || time < 0) {
            return "00:00";
        }

        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);

        return (
            `${String(minutes).padStart(2, "0")}:` +
            `${String(seconds).padStart(2, "0")}`
        );
    };

    // =========================================
    // LOADING DEL STREAM
    // =========================================

    if (loading) {
        return (
            <div className={styles.reproductor}>
                <div className={styles.titleContainer}>
                    <h2>
                        Temporada {season} Episodio {episode}
                    </h2>
                </div>

                <p>Cargando episodio...</p>
            </div>
        );
    }

    // =========================================
    // ERROR AL CARGAR EL STREAM
    // =========================================

    if (error) {
        return (
            <div className={styles.reproductor}>
                <EpisodePlayer
                    id={id}
                    season={season}
                    episode={episode}
                    typeUrl="serie"
                />

                <p>{error}</p>
            </div>
        );
    }

    // =========================================
    // SIN STREAM
    // =========================================

    if (!streamUrl) {
        return (
            <div className={styles.reproductor}>
                <p>No hay stream disponible.</p>
            </div>
        );
    }

    // =========================================
    // REPRODUCTOR
    // =========================================

    return (
        <div className={styles.reproductor}>
            <div className={styles.titleContainer}>
                <h2>
                    Temporada {season} Episodio {episode}
                </h2>
            </div>

            <div
                className={styles.player}
                onMouseMove={resetControlsTimer}
                onMouseDown={resetControlsTimer}
                onTouchStart={resetControlsTimer}
                onClick={resetControlsTimer}
            >
                <video
                    key={`${id}-${season}-${episode}`}
                    ref={videoRef}
                    className={styles.video}
                    src={streamUrl}
                    preload="metadata"
                    playsInline
                />

                {isLoading && !videoError && (
                    <div className={styles.loading}>
                        <i className="bi bi-arrow-repeat"></i>
                        <span>Cargando...</span>
                    </div>
                )}

                {videoError && (
                    <div className={styles.error}>
                        <i className="bi bi-exclamation-triangle"></i>
                        <span>
                            No se pudo reproducir el episodio con las fuentes disponibles.
                        </span>
                    </div>
                )}

                {!videoError && (
                    <TvRegion
                        scrollOffset={500}
                        id="series-controls"
                        className={`
                            ${styles.controls}
                            ${
                                showControls
                                    ? styles.controlsVisible
                                    : styles.controlsHidden
                            }
                        `}
                        focusClassName="tv-focused-hero"
                    >
                        <button
                            className={styles.control}
                            onClick={togglePlay}
                            data-tv-focusable
                            aria-label={isPlaying ? "Pausar" : "Reproducir"}
                        >
                            <i
                                className={
                                    isPlaying
                                        ? "bi bi-pause-fill"
                                        : "bi bi-play-fill"
                                }
                            ></i>
                        </button>

                        <button
                            className={styles.control}
                            onClick={() => seek(-10)}
                            data-tv-focusable
                            aria-label="Retroceder 10 segundos"
                        >
                            <i className="bi bi-arrow-counterclockwise"></i>
                        </button>

                        <button
                            className={styles.control}
                            onClick={() => seek(10)}
                            data-tv-focusable
                            aria-label="Avanzar 10 segundos"
                        >
                            <i className="bi bi-arrow-clockwise"></i>
                        </button>

                        <span className={styles.time}>
                            {formatTime(currentTime)}
                        </span>

                        <input
                            className={styles.progress}
                            type="range"
                            min="0"
                            max={duration || 0}
                            step="0.1"
                            value={Math.min(currentTime, duration || 0)}
                            onChange={handleProgress}
                            data-tv-focusable
                            aria-label="Progreso del video"
                        />

                        <span className={styles.time}>
                            {formatTime(duration)}
                        </span>

                        <i className="bi bi-volume-up"></i>

                        <input
                            className={styles.volume}
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolume}
                            data-tv-focusable
                            aria-label="Volumen"
                        />

                        <button
                            className={styles.control}
                            onClick={toggleFullscreen}
                            data-tv-focusable
                            aria-label={
                                isFullscreen
                                    ? "Salir de pantalla completa"
                                    : "Pantalla completa"
                            }
                        >
                            <i
                                className={
                                    isFullscreen
                                        ? "bi bi-fullscreen-exit"
                                        : "bi bi-fullscreen"
                                }
                            ></i>
                        </button>
                    </TvRegion>
                )}
            </div>
        </div>
    );
};
