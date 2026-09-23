import { useEffect, useRef, useState } from "react"
import styles from "./moviePlayer.module.css"
import { TvRegion } from "../TvRegion/TvRegion"

interface MoviePlayerProps {
    tmdbId: string
    title: string
}

export const MoviePlayer = ({
    tmdbId,
    title
}: MoviePlayerProps) => {

    const videoRef = useRef<HTMLVideoElement | null>(null)

    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [error, setError] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const API_URL = import.meta.env.VITE_API_URL

    const streamUrl = `${API_URL}/api/streams/${tmdbId}`

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

        const handlePlay = () => {
            setIsPlaying(true)
        }

        const handlePause = () => {
            setIsPlaying(false)
        }

        const handleWaiting = () => {
            setIsLoading(true)
        }

        const handlePlaying = () => {
            setIsLoading(false)
        }

        const handleError = () => {
            setError(true)
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
    }, [])
    useEffect(() => {
        return () => {
            if (controlsTimerRef.current) {
                clearTimeout(controlsTimerRef.current)
            }
        }
    }, [])
    useEffect(() => {
        if (isPlaying) {
            resetControlsTimer()
        } else {
            setShowControls(true)
    
            if (controlsTimerRef.current) {
                clearTimeout(controlsTimerRef.current)
            }
        }
    }, [isPlaying])
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const keys = [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Enter",
                "Escape",
                " ",
            ]
    
            if (!keys.includes(event.key)) return
    
            resetControlsTimer()
        }
    
        window.addEventListener("keydown", handleKeyDown)
    
        return () => {
            window.removeEventListener("keydown", handleKeyDown)
        }
    }, [isPlaying])

    const togglePlay = () => {
        const video = videoRef.current

        if (!video) return

        if (video.paused) {
            video.play()
        } else {
            video.pause()
        }
    }

    const seek = (seconds: number) => {
        const video = videoRef.current

        if (!video) return

        video.currentTime = Math.max(
            0,
            Math.min(
                video.currentTime + seconds,
                video.duration
            )
        )
    }

    const handleProgress = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const video = videoRef.current

        if (!video) return

        const time = Number(event.target.value)

        video.currentTime = time
        setCurrentTime(time)
    }

    const handleVolume = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const video = videoRef.current

        if (!video) return

        const value = Number(event.target.value)

        video.volume = value
        setVolume(value)
    }

    const toggleFullscreen = async () => {
        const container = videoRef.current?.parentElement

        if (!container) return

        if (!document.fullscreenElement) {
            await container.requestFullscreen()
            setIsFullscreen(true)
        } else {
            await document.exitFullscreen()
            setIsFullscreen(false)
        }
    }

    const formatTime = (time: number) => {
        if (!Number.isFinite(time)) {
            return "00:00"
        }

        const minutes = Math.floor(time / 60)
        const seconds = Math.floor(time % 60)

        return `${String(minutes).padStart(2, "0")}:${String(
            seconds
        ).padStart(2, "0")}`
    }
    const resetControlsTimer = () => {
        setShowControls(true)
    
        if (controlsTimerRef.current) {
            clearTimeout(controlsTimerRef.current)
        }
    
        controlsTimerRef.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false)
            }
        }, 3000)
    }

    return (
        <div className={styles.container}>

            <div className={styles.title}>
                <h2>
                    Estás viendo "{title}"
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
                    ref={videoRef}
                    className={styles.video}
                    src={streamUrl}
                    autoPlay
                    playsInline
                />

                {isLoading && !error && (
                    <div className={styles.loading}>
                        <i className="bi bi-arrow-repeat"></i>
                        <span>Cargando...</span>
                    </div>
                )}

                {error && (
                    <div className={styles.error}>
                        <i className="bi bi-exclamation-triangle"></i>
                        <span>
                            No se pudo reproducir la película
                        </span>
                    </div>
                )}

                {!error && (
                    <TvRegion id="controls" className={`${styles.controls} ${
                        showControls
                            ? styles.controlsVisible
                            : styles.controlsHidden
                    }`}>

                        <button
                            className={styles.control}
                            onClick={togglePlay}
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

                        <button
                            className={styles.control}
                            onClick={() => seek(-10)}
                            data-tv-focusable
                        >
                            <i className="bi bi-arrow-counterclockwise"></i>
                        </button>

                        <button
                            className={styles.control}
                            onClick={() => seek(10)}
                            data-tv-focusable
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
                            value={currentTime}
                            onChange={handleProgress}
                            data-tv-focusable
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
                        />

                        <button
                            className={styles.control}
                            onClick={toggleFullscreen}
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