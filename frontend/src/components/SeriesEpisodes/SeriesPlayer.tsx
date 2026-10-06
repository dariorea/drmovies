import {
    useEffect,
    useRef,
    useState
} from "react"

import styles from "./seriesepisodes.module.css"
import { TvRegion } from "../TvRegion/TvRegion"
import { EpisodePlayer } from "../Episodes/EpisodePlayer"

interface Props {
    id: number,
    season: number,
    episode: number,
}

interface StreamResponse {
    streamUrl: string
}


export const SeriesPlayer = ({
    id,
    season,
    episode
}: Props) => {

    // =========================================
    // STREAM
    // =========================================

    const [
        streamUrl,
        setStreamUrl
    ] = useState<string | null>(null)

    const [
        loading,
        setLoading
    ] = useState(true)

    const [
        error,
        setError
    ] = useState<string | null>(null)


    // =========================================
    // VIDEO
    // =========================================

    const videoRef =
        useRef<HTMLVideoElement | null>(null)


    // =========================================
    // CONTROLES
    // =========================================

    const [
        isPlaying,
        setIsPlaying
    ] = useState(false)

    const [
        isLoading,
        setIsLoading
    ] = useState(true)

    const [
        currentTime,
        setCurrentTime
    ] = useState(0)

    const [
        duration,
        setDuration
    ] = useState(0)

    const [
        volume,
        setVolume
    ] = useState(1)

    const [
        isFullscreen,
        setIsFullscreen
    ] = useState(false)

    const [
        videoError,
        setVideoError
    ] = useState(false)

    const [
        showControls,
        setShowControls
    ] = useState(true)

    const controlsTimerRef =
        useRef<ReturnType<typeof setTimeout> | null>(null)


    // =========================================
    // OBTENER STREAM
    // =========================================

    useEffect(() => {

        if (!id) {
            return
        }

        const controller =
            new AbortController()


        const loadStream =
            async () => {

                try {

                    setLoading(true)
                    setError(null)
                    setStreamUrl(null)

                    setVideoError(false)
                    setIsPlaying(false)
                    setIsLoading(true)
                    setCurrentTime(0)
                    setDuration(0)


                    const apiUrl =
                        import.meta.env.VITE_API_URL


                    const response =
                        await fetch(
                            `${apiUrl}/series/${id}/stream` +
                            `?season=${season}` +
                            `&episode=${episode}`,
                            {
                                signal:
                                    controller.signal
                            }
                        )


                    if (!response.ok) {

                        throw new Error(
                            `Error HTTP ${response.status}`
                        )
                    }


                    const data:
                        StreamResponse =
                            await response.json()


                    if (!data.streamUrl) {

                        throw new Error(
                            "El episodio no tiene stream"
                        )
                    }


                    setStreamUrl(
                        data.streamUrl
                    )

                } catch (error) {

                    if (
                        error instanceof DOMException &&
                        error.name === "AbortError"
                    ) {
                        return
                    }


                    setError(
                        error instanceof Error
                            ? error.message
                            : "Error desconocido"
                    )

                } finally {

                    setLoading(false)

                }

            }


        loadStream()


        return () => {
            controller.abort()
        }

    }, [
        id,
        season,
        episode
    ])


    // =========================================
    // EVENTOS DEL VIDEO
    // =========================================

    useEffect(() => {

        const video = videoRef.current

        if (!video) return

        const handleLoadedMetadata = () => {
            setDuration(video.duration)
                
            setIsLoading(false)
        }


        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime)
        }


        const handlePlay =() => {
            setIsPlaying(true)
        }

        const handlePause = () => {
            setIsPlaying(false)
        }

        const handleWaiting = () => {
            setIsLoading(true)
        }

        const handlePlaying =() => {
            setIsLoading(false)
        }


        const handleError =() => {
            setVideoError(true)
            setIsLoading(false)
        }


        video.addEventListener(
            "loadedmetadata",
            handleLoadedMetadata
        )

        video.addEventListener(
            "timeupdate",
            handleTimeUpdate
        )

        video.addEventListener(
            "play",
            handlePlay
        )

        video.addEventListener(
            "pause",
            handlePause
        )

        video.addEventListener(
            "waiting",
            handleWaiting
        )

        video.addEventListener(
            "playing",
            handlePlaying
        )

        video.addEventListener(
            "error",
            handleError
        )


        return () => {

            video.removeEventListener(
                "loadedmetadata",
                handleLoadedMetadata
            )

            video.removeEventListener(
                "timeupdate",
                handleTimeUpdate
            )

            video.removeEventListener(
                "play",
                handlePlay
            )

            video.removeEventListener(
                "pause",
                handlePause
            )

            video.removeEventListener(
                "waiting",
                handleWaiting
            )

            video.removeEventListener(
                "playing",
                handlePlaying
            )

            video.removeEventListener(
                "error",
                handleError
            )
        }

    }, [streamUrl])


    // =========================================
    // TIMER CONTROLES
    // =========================================

    useEffect(() => {

        return () => {

            if (
                controlsTimerRef.current
            ) {

                clearTimeout(
                    controlsTimerRef.current
                )
            }
        }

    }, [])


    useEffect(() => {

        if (isPlaying) {

            resetControlsTimer()

        } else {

            setShowControls(true)

            if (
                controlsTimerRef.current
            ) {

                clearTimeout(
                    controlsTimerRef.current
                )
            }
        }

    }, [isPlaying])


    useEffect(() => {

        const handleKeyDown =
            (event: KeyboardEvent) => {

                const keys = [
                    "ArrowUp",
                    "ArrowDown",
                    "ArrowLeft",
                    "ArrowRight",
                    "Enter",
                    "Escape",
                    " "
                ]


                if (
                    !keys.includes(
                        event.key
                    )
                ) {
                    return
                }


                resetControlsTimer()
            }


        window.addEventListener(
            "keydown",
            handleKeyDown
        )


        return () => {

            window.removeEventListener(
                "keydown",
                handleKeyDown
            )
        }

    }, [isPlaying])


    // =========================================
    // PLAY / PAUSE
    // =========================================

    const togglePlay =
        async () => {

            const video =
                videoRef.current

            if (!video) return


            try {

                if (video.paused) {

                    await video.play()

                } else {

                    video.pause()
                }

            } catch (error) {

                console.error(
                    "No se pudo reproducir:",
                    error
                )
            }
        }


    // =========================================
    // SEEK
    // =========================================

    const seek =
        (seconds: number) => {

            const video =
                videoRef.current

            if (!video) return


            video.currentTime =
                Math.max(
                    0,
                    Math.min(
                        video.currentTime +
                            seconds,
                        video.duration
                    )
                )
        }


    // =========================================
    // PROGRESO
    // =========================================

    const handleProgress =
        (
            event:
                React.ChangeEvent<HTMLInputElement>
        ) => {

            const video =
                videoRef.current

            if (!video) return


            const time =
                Number(
                    event.target.value
                )


            video.currentTime =
                time

            setCurrentTime(
                time
            )
        }


    // =========================================
    // VOLUMEN
    // =========================================

    const handleVolume =
        (
            event:
                React.ChangeEvent<HTMLInputElement>
        ) => {

            const video =
                videoRef.current

            if (!video) return


            const value =
                Number(
                    event.target.value
                )


            video.volume =
                value

            setVolume(
                value
            )
        }


    // =========================================
    // FULLSCREEN
    // =========================================

    const toggleFullscreen =
        async () => {

            const container =
                videoRef.current
                    ?.parentElement

            if (!container) return


            if (
                !document.fullscreenElement
            ) {

                await container.requestFullscreen()

                setIsFullscreen(true)

            } else {

                await document.exitFullscreen()

                setIsFullscreen(false)
            }
        }


    // =========================================
    // FORMATEAR TIEMPO
    // =========================================

    const formatTime = (time: number) => {
        if (
            !Number.isFinite(time)
        ) {
            return "00:00"
        }

        const minutes = Math.floor(time / 60)
        const seconds = Math.floor(time % 60)

        return (
            `${String(minutes).padStart(2, "0")}:` +
            `${String(seconds).padStart(2, "0")}`
        )
    }


    // =========================================
    // TIMER CONTROLES
    // =========================================

    const resetControlsTimer = () => {

            setShowControls(true)

            if (controlsTimerRef.current) {
                clearTimeout(
                    controlsTimerRef.current
                )
            }

            controlsTimerRef.current = setTimeout(() => {
                if (isPlaying) {
                    setShowControls(false)
                }
            }, 3000)
        }


    // =========================================
    // LOADING DEL STREAM
    // =========================================

    if (loading) {

        return (
            <div className={styles.reproductor}>

                <div className={styles.titleContainer}>
                    <h2>Temporada {season} Episodio: {episode}</h2>
                </div>

                <p> Cargando episodio...</p>

            </div>
        )
    }


    // =========================================
    // ERROR DEL STREAM
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
        )
    }


    // =========================================
    // SIN STREAM
    // =========================================

    if (!streamUrl) {

        return (
            <div className={styles.reproductor}>
                <p>No hay stream disponible.</p>
            </div>
        )
    }


    // =========================================
    // REPRODUCTOR
    // =========================================

    return (
        <div className={styles.reproductor}>

            <div className={styles.titleContainer}>
                <h2>Temporada {season} Episodio {episode}</h2>
            </div>
            <div
                className={styles.player}
                onMouseMove={
                    resetControlsTimer
                }
                onMouseDown={
                    resetControlsTimer
                }
                onTouchStart={
                    resetControlsTimer
                }
                onClick={
                    resetControlsTimer
                }
            >

                <video
                    key={`${season}-${episode}`}
                    ref={videoRef}
                    className={
                        styles.video
                    }
                    src={streamUrl}
                    preload="metadata"
                    playsInline
                />


                {isLoading &&
                    !videoError && (
                        <div className={styles.loading}>
                            <i className="bi bi-arrow-repeat"></i>
                            <span>Cargando...</span>
                        </div>
                    )
                }


                {videoError && (

                    <div className={styles.error}>
                        <i className="bi bi-exclamation-triangle"></i>
                        <span>No se pudo reproducir el episodio</span>
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

                        {/* PLAY */}

                        <button
                            className={
                                styles.control
                            }
                            onClick={
                                togglePlay
                            }
                            data-tv-focusable
                        >

                            <i
                                className={
                                    isPlaying
                                        ? "bi bi-pause-fill"
                                        : "bi bi-play-fill"
                                }
                            ></i>

                        </button>


                        {/* -10 */}

                        <button
                            className={
                                styles.control
                            }
                            onClick={() =>
                                seek(-10)
                            }
                            data-tv-focusable
                        >

                            <i className="bi bi-arrow-counterclockwise"></i>

                        </button>


                        {/* +10 */}

                        <button
                            className={
                                styles.control
                            }
                            onClick={() =>
                                seek(10)
                            }
                            data-tv-focusable
                        >

                            <i className="bi bi-arrow-clockwise"></i>

                        </button>


                        {/* TIEMPO ACTUAL */}

                        <span
                            className={
                                styles.time
                            }
                        >
                            {formatTime(
                                currentTime
                            )}
                        </span>


                        {/* PROGRESO */}

                        <input
                            className={
                                styles.progress
                            }
                            type="range"
                            min="0"
                            max={
                                duration || 0
                            }
                            step="0.1"
                            value={
                                currentTime
                            }
                            onChange={
                                handleProgress
                            }
                            data-tv-focusable
                        />


                        {/* DURACIÓN */}

                        <span
                            className={
                                styles.time
                            }
                        >
                            {formatTime(
                                duration
                            )}
                        </span>


                        {/* VOLUMEN */}

                        <i className="bi bi-volume-up"></i>

                        <input
                            className={
                                styles.volume
                            }
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={
                                volume
                            }
                            onChange={
                                handleVolume
                            }
                            data-tv-focusable
                        />


                        {/* FULLSCREEN */}

                        <button
                            className={
                                styles.control
                            }
                            onClick={
                                toggleFullscreen
                            }
                            data-tv-focusable
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
    )
}