import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import styles from "./livePlayer.module.css"

interface LivePlayerProps {
    channelId: string
    channelName: string
}

export const LivePlayer = ({
    channelName
}: LivePlayerProps) => {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const hlsRef = useRef<Hls | null>(null)

    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)


    

    const streamUrl = "http://23.153.217.158:8080/live/951363474tv/73c345nz25/459.m3u8"

    useEffect(() => {
        const video = videoRef.current

        if (!video) return

        setIsLoading(true)
        setError(false)

        /*
         * Algunos navegadores, como Safari,
         * pueden reproducir HLS directamente.
         */
        if (
            video.canPlayType(
                "application/vnd.apple.mpegurl"
            )
        ) {
            video.src = streamUrl

            const handleLoadedMetadata = () => {
                setIsLoading(false)
            }

            const handlePlay = () => {
                setIsPlaying(true)
            }

            const handlePause = () => {
                setIsPlaying(false)
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
                "play",
                handlePlay
            )

            video.addEventListener(
                "pause",
                handlePause
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
                    "play",
                    handlePlay
                )

                video.removeEventListener(
                    "pause",
                    handlePause
                )

                video.removeEventListener(
                    "error",
                    handleError
                )

                video.removeAttribute("src")
                video.load()
            }
        }

        /*
         * Chrome, Android TV y la mayoría de
         * navegadores necesitan hls.js.
         */
        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
            
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 6,
            
                fragLoadingMaxRetry: 3,
                manifestLoadingMaxRetry: 3
            })
            hls.on(Hls.Events.MANIFEST_LOADING, (_event) => {
                console.log("📋 MANIFEST_LOADING")
            })
            
            hls.on(Hls.Events.MANIFEST_LOADED, (_event, data) => {
                console.log("📋 MANIFEST_LOADED", {
                    levels: data.levels?.length
                })
            })
            
            hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
                console.log("✅ MANIFEST_PARSED", {
                    levels: data.levels?.length,
                    firstLevel: data.firstLevel
                })
            })
            
            hls.on(Hls.Events.LEVEL_LOADING, (_event, data) => {
                console.log("📡 LEVEL_LOADING", {
                    level: data.level
                })
            })
            
            hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
                console.log("📡 LEVEL_LOADED", {
                    level: data.level
                })
            })
            
            hls.on(Hls.Events.FRAG_LOADING, (_event, data) => {
                console.log("⬇️ FRAG_LOADING", {
                    sn: data.frag?.sn,
                    type: data.frag?.type
                })
            })
            
            hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
                console.log("✅ FRAG_LOADED", {
                    sn: data.frag?.sn,
                    type: data.frag?.type
                })
            })
            
            hls.on(Hls.Events.ERROR, (_event, data) => {
                console.error("❌ HLS ERROR", {
                    type: data.type,
                    details: data.details,
                    fatal: data.fatal,
                    response: data.response
                        ? {
                            code: data.response.code,
                            text: data.response.text
                        }
                        : undefined
                })
            })
            hlsRef.current = hls
            
            console.log("📺 Iniciando HLS:", streamUrl)
            
            
            // ==============================
            // DIAGNÓSTICO HLS
            // ==============================
            
            hls.on(
                Hls.Events.MANIFEST_LOADING,
                (_event, data) => {
                    console.log(
                        "📋 MANIFEST_LOADING",
                        data.url
                    )
                }
            )
            
            hls.on(
                Hls.Events.MANIFEST_LOADED,
                (_event, data) => {
                    console.log(
                        "📋 MANIFEST_LOADED",
                        data.url
                    )
                }
            )
            
            hls.on(
                Hls.Events.MANIFEST_PARSED,
                (_event, data) => {
                    console.log(
                        "✅ MANIFEST_PARSED",
                        {
                            levels: data.levels?.length,
                            firstLevel: data.firstLevel
                        }
                    )
            
                    setIsLoading(false)
            
                    video.play().catch(error => {
                        console.warn(
                            "⚠️ Autoplay bloqueado:",
                            error
                        )
                    })
                }
            )
            
            hls.on(
                Hls.Events.LEVEL_LOADING,
                (_event, data) => {
                    console.log(
                        "📡 LEVEL_LOADING",
                        {
                            level: data.level,
                            url: data.url
                        }
                    )
                }
            )
            
            hls.on(
                Hls.Events.LEVEL_LOADED,
                (_event, data) => {
                    console.log(
                        "📡 LEVEL_LOADED",
                        {
                            level: data.level,
                            details: data.details
                        }
                    )
                }
            )
            
            hls.on(
                Hls.Events.FRAG_LOADING,
                (_event, data) => {
                    console.log(
                        "⬇️ FRAG_LOADING",
                        {
                            sn: data.frag?.sn,
                            type: data.frag?.type
                        }
                    )
                }
            )
            
            hls.on(
                Hls.Events.FRAG_LOADED,
                (_event, data) => {
                    console.log(
                        "✅ FRAG_LOADED",
                        {
                            sn: data.frag?.sn,
                            type: data.frag?.type
                        }
                    )
                }
            )
            
            hls.on(
                Hls.Events.BUFFER_APPENDING,
                (_event, data) => {
                    console.log(
                        "📦 BUFFER_APPENDING",
                        {
                            type: data.type,
                            dataLength: data.data?.length
                        }
                    )
                }
            )
            
            
            // ==============================
            // ERRORES
            // ==============================
            
            hls.on(
                Hls.Events.ERROR,
                (_event, data) => {
                    console.error(
                        "❌ HLS ERROR",
                        {
                            type: data.type,
                            details: data.details,
                            fatal: data.fatal,
                            response: data.response,
                            url: data.url
                        }
                    )
            
                    if (!data.fatal) {
                        return
                    }
            
                    switch (data.type) {
            
                        case Hls.ErrorTypes.NETWORK_ERROR:
            
                            console.warn(
                                "🔄 Error de red HLS. Intentando recuperar..."
                            )
            
                            hls.startLoad()
            
                            break
            
            
                        case Hls.ErrorTypes.MEDIA_ERROR:
            
                            console.warn(
                                "🔄 Error de media HLS. Intentando recuperar..."
                            )
            
                            hls.recoverMediaError()
            
                            break
            
            
                        default:
            
                            console.error(
                                "💀 Error HLS irrecuperable"
                            )
            
                            setError(true)
                            setIsLoading(false)
            
                            hls.destroy()
            
                            break
                    }
                }
            )
            
            hls.loadSource(streamUrl)
            hls.attachMedia(video)
            hls.on(
                Hls.Events.ERROR,
                (_event, data) => {
                    console.error(
                        "HLS error:",
                        data
                    )

                    if (
                        data.fatal
                    ) {
                        setError(true)
                        setIsLoading(false)

                        switch (
                            data.type
                        ) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.log(
                                    "🔄 Intentando recuperar conexión HLS..."
                                )

                                hls.startLoad()
                                break

                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log(
                                    "🔄 Intentando recuperar error de media..."
                                )

                                hls.recoverMediaError()
                                break

                            default:
                                hls.destroy()
                                break
                        }
                    }
                }
            )

            const handlePlay = () => {
                setIsPlaying(true)
            }

            const handlePause = () => {
                setIsPlaying(false)
            }

            video.addEventListener(
                "play",
                handlePlay
            )

            video.addEventListener(
                "pause",
                handlePause
            )

            return () => {
                video.removeEventListener(
                    "play",
                    handlePlay
                )

                video.removeEventListener(
                    "pause",
                    handlePause
                )

                hls.destroy()
                hlsRef.current = null
            }
        }

        /*
         * El navegador no soporta HLS.
         */
        setError(true)
        setIsLoading(false)

    }, [streamUrl])

    const togglePlay = () => {
        const video = videoRef.current

        if (!video) return

        if (video.paused) {
            video.play().catch(error => {
                console.error(
                    "No se pudo reproducir:",
                    error
                )
            })
        } else {
            video.pause()
        }
    }

    const toggleFullscreen = async () => {
        const video = videoRef.current

        if (!video) return

        try {
            if (!document.fullscreenElement) {
                await video.requestFullscreen()
                setIsFullscreen(true)
            } else {
                await document.exitFullscreen()
                setIsFullscreen(false)
            }
        } catch (error) {
            console.error(
                "Error entrando en fullscreen:",
                error
            )
        }
    }
    useEffect(() => {
        const video = videoRef.current
    
        if (!video) return
    
        const events = [
            "loadstart",
            "loadedmetadata",
            "canplay",
            "playing",
            "waiting",
            "stalled",
            "suspend",
            "error"
        ]
    
        const handlers = events.map(event => {
            const handler = () => {
                console.log(`🎥 VIDEO ${event}`, {
                    readyState: video.readyState,
                    networkState: video.networkState,
                    currentTime: video.currentTime,
                    error: video.error
                        ? {
                            code: video.error.code,
                            message: video.error.message
                        }
                        : null
                })
            }
    
            video.addEventListener(event, handler)
            return { event, handler }
        })
    
        return () => {
            handlers.forEach(({ event, handler }) => {
                video.removeEventListener(event, handler)
            })
        }
    }, [])

    return (
        <div className={styles.container}>

            <div className={styles.title}>
                <h2>
                    Estás viendo "{channelName}"
                </h2>
            </div>

            <div className={styles.player}>

                <video
                    ref={videoRef}
                    className={styles.video}
                    playsInline
                    controls={false}
                />

                {isLoading && !error && (
                    <div className={styles.loading}>
                        <i className="bi bi-arrow-repeat"></i>
                        <span>
                            Cargando canal...
                        </span>
                    </div>
                )}

                {error && (
                    <div className={styles.error}>
                        <i className="bi bi-exclamation-triangle"></i>

                        <span>
                            No se pudo reproducir el canal
                        </span>
                    </div>
                )}

                {!error && !isLoading && (
                    <div className={styles.controls}>

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

                        <span className={styles.live}>
                            <span></span>
                            EN VIVO
                        </span>

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

                    </div>
                )}

            </div>

        </div>
    )
}