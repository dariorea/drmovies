import { useEffect, useRef } from "react"
import Hls from "hls.js"

export const TestChannel = () => {
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        const video = videoRef.current

        if (!video) return

        const streamUrl =
            "http://23.153.217.158:8080/live/951363474tv/73c345nz25/459.m3u8"

        if (!Hls.isSupported()) {
            console.error("❌ HLS.js no es compatible con este navegador")
            return
        }

        const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,

            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,

            fragLoadingMaxRetry: 3,
            manifestLoadingMaxRetry: 3,
        })

        // Primero conectamos HLS con el <video>
        hls.attachMedia(video)

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            console.log("🎬 Video conectado a HLS")

            // Ahora cargamos el M3U8
            hls.loadSource(streamUrl)
        })

        hls.on(Hls.Events.MANIFEST_LOADING, () => {
            console.log("📥 Cargando manifest...")
        })

        hls.on(Hls.Events.MANIFEST_LOADED, (_event, data) => {
            console.log("📄 Manifest recibido:", data)
        })

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
            console.log("✅ Manifest parseado:", data)

            video.play().catch(error => {
                console.error("▶️ No se pudo reproducir automáticamente:", error)
            })
        })

        hls.on(Hls.Events.FRAG_LOADING, (_event, data) => {
            console.log("📦 Cargando fragmento:", data.frag.sn)
        })

        hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
            console.log("✅ Fragmento recibido:", data.frag.sn)
        })

        hls.on(Hls.Events.ERROR, (_event, data) => {
            console.error("❌ HLS ERROR:", data)

            if (data.fatal) {
                console.error("🚨 ERROR FATAL HLS")

                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error("🌐 Error de red")
                        break

                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error("🎥 Error de reproducción/media")
                        console.error("Video error:", video.error)
                        break

                    default:
                        console.error("💥 Error irrecuperable")
                        break
                }
            }
        })

        video.addEventListener("error", () => {
            console.error("🎥 VIDEO ERROR:", video.error)

            if (video.error) {
                console.error("Código:", video.error.code)
                console.error("Mensaje:", video.error.message)
            }
        })

        return () => {
            console.log("🧹 Destruyendo HLS")

            hls.destroy()
        }
    }, [])

    return (
        <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            style={{
                width: "100%",
                maxWidth: "900px",
                background: "black",
            }}
        />
    )
}