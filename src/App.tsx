import { useCallback, useEffect, useRef, useState } from 'react'
import PreloaderPage from './pages/PreloaderPage'
import VideoPage from './pages/VideoPage'

const DURATION = 700
const VIDEO_SOURCES = ['videos/video1.mp4', 'videos/ocean2-720.mp4']
const TOTAL = VIDEO_SOURCES.length + 1

export default function App() {
    const [current, setCurrent] = useState(0)
    const [shipProgress, setShipProgress] = useState(0)
    const [vh, setVh] = useState(() => window.innerHeight)
    const [videoSrcs, setVideoSrcs] = useState<(string | undefined)[]>(() =>
        VIDEO_SOURCES.map(() => undefined),
    )
    const animatingRef = useRef(false)
    const wheelArmedRef = useRef(true)
    const wheelDeltasRef = useRef<number[]>([])
    const wheelLastTimeRef = useRef(0)
    const currentRef = useRef(0)
    const videoRefs = useRef<(HTMLVideoElement | null)[]>([])

    const goTo = useCallback((index: number) => {
        if (index < 0 || index >= TOTAL || animatingRef.current || index === currentRef.current) return
        animatingRef.current = true
        currentRef.current = index
        setCurrent(index)
        window.setTimeout(() => {
            animatingRef.current = false
        }, DURATION)
    }, [])

    const handleLoaded = useCallback((urls: (string | null)[]) => {
        setVideoSrcs(urls.map((url, i) => url ?? VIDEO_SOURCES[i]))
    }, [])

    const handleEnter = useCallback(() => {
        goTo(1)
    }, [goTo])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            videoRefs.current.forEach((video, i) => {
                if (!video) return
                video.muted = true
                if (current === i + 1) {
                    video.currentTime = 0
                    video.play().catch(() => {})
                } else {
                    video.pause()
                    video.currentTime = 0
                }
            })
        }, DURATION)
        return () => window.clearTimeout(timer)
    }, [current])

    useEffect(() => {
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
            const now = performance.now()
            const gap = now - wheelLastTimeRef.current
            wheelLastTimeRef.current = now
            if (gap > 500) {
                wheelArmedRef.current = true
                wheelDeltasRef.current = []
            }
            const deltas = wheelDeltasRef.current
            deltas.push(Math.abs(e.deltaY))
            if (deltas.length > 40) deltas.shift()

            if (animatingRef.current) return

            let fire = wheelArmedRef.current
            if (!fire) {
                if (deltas.length >= 8) {
                    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
                    const recentAvg = avg(deltas.slice(-5))
                    const olderAvg = avg(deltas.slice(0, -5))
                    fire = recentAvg > Math.max(olderAvg * 1.8, 25)
                } else {
                    fire = gap > 120 && Math.abs(e.deltaY) > 6
                }
            }
            if (!fire) return

            wheelArmedRef.current = false
            if (e.deltaY > 0) goTo(currentRef.current + 1)
            else goTo(currentRef.current - 1)
        }
        window.addEventListener('wheel', onWheel, { passive: true })
        return () => window.removeEventListener('wheel', onWheel)
    }, [goTo])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'PageDown') goTo(currentRef.current + 1)
            if (e.key === 'ArrowUp' || e.key === 'PageUp') goTo(currentRef.current - 1)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [goTo])

    useEffect(() => {
        let timer = 0
        const onResize = () => {
            window.clearTimeout(timer)
            timer = window.setTimeout(() => setVh(window.innerHeight), 100)
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    return (
        <div className="fullpage">
            <div className="wrapper" style={{ transform: `translateY(${-current * vh}px)` }}>
                <PreloaderPage sources={VIDEO_SOURCES} onLoaded={handleLoaded} onEnter={handleEnter} onProgress={setShipProgress} />
                <VideoPage
                    videoRef={(el) => {
                        videoRefs.current[0] = el
                    }}
                    videoSrc={videoSrcs[0]}
                    kicker="Experiment 01"
                    title="Real-Time Naval Combat"
                    desc="An Age-of-Sail combat prototype in the spirit of Uncharted Waters Online. Fleets trade real-time broadsides inside visible firing arcs — HP bars, floating damage numbers, a full day/night cycle, and shifting weather over open water."
                    linkUrl="https://eric-schecter.github.io/posts/ocean/"
                    linkLabel="View Demo Notes"
                />
                <VideoPage
                    videoRef={(el) => {
                        videoRefs.current[1] = el
                    }}
                    videoSrc={videoSrcs[1]}
                    kicker="Experiment 02"
                    title="Turn-Based Naval Tactics"
                    desc="An HD-2D-inspired tactics experiment: pixel-art ships on a painterly miniature ocean. Roam island waters freely, then settle each encounter on a hex grid, where positioning and firing arcs decide every exchange."
                    linkUrl="https://eric-schecter.github.io/posts/ocean2/"
                    linkLabel="View Demo Notes"
                />
            </div>
        </div>
    )
}
