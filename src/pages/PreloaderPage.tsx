import { useEffect, useRef, useState } from 'react'

interface PreloaderPageProps {
    sources: string[]
    onLoaded: (urls: (string | null)[]) => void
    onEnter: () => void
    onProgress: (p: number) => void
}

export default function PreloaderPage({ sources, onLoaded, onEnter, onProgress }: PreloaderPageProps) {
    const [progress, setProgress] = useState(0)
    const [ready, setReady] = useState(false)
    const doneRef = useRef(false)

    useEffect(() => {
        onProgress(progress)
    }, [progress, onProgress])

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            const totalFiles = sources.length
            const urls: (string | null)[] = new Array(totalFiles).fill(null)

            for (let i = 0; i < totalFiles; i++) {
                const base = (i / totalFiles) * 100
                const span = 100 / totalFiles
                try {
                    const res = await fetch(sources[i])
                    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
                    const total = Number(res.headers.get('Content-Length')) || 0
                    const reader = res.body.getReader()
                    const chunks: BlobPart[] = []
                    let received = 0
                    for (;;) {
                        const { done, value } = await reader.read()
                        if (cancelled) return
                        if (done) break
                        chunks.push(value)
                        received += value.length
                        if (total > 0) {
                            setProgress(Math.round(base + (received / total) * span))
                        }
                    }
                    urls[i] = URL.createObjectURL(new Blob(chunks))
                } catch {
                    urls[i] = null
                }
                if (!cancelled) setProgress(Math.round(((i + 1) / totalFiles) * 100))
            }

            if (cancelled || doneRef.current) return
            doneRef.current = true
            onLoaded(urls)
            setProgress(100)
            setTimeout(() => {
                if (!cancelled) setReady(true)
            }, 500)
        }

        load()
        return () => {
            cancelled = true
        }
    }, [sources, onLoaded])

    return (
        <section className="preloader">
            <div className={`load-overlay${ready ? ' ready' : ''}`}>
                <p className="load-kicker">Personal Projects</p>
                <h1 className="load-title">
                    <span className="load-line load-line-1">Game</span>
                    <span className="load-line load-line-2">Lab</span>
                </h1>
                <div className="load-progress" aria-hidden="true">
                    <div className="load-progress-fill" style={{ transform: `scaleX(${progress / 100})` }} />
                </div>
                <button
                    type="button"
                    className={`scroll-hint${ready ? ' show' : ''}`}
                    onClick={onEnter}
                    aria-label="进入下一页"
                    aria-hidden={!ready}
                    tabIndex={ready ? 0 : -1}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="chev chev-1" d="M6 8l6 6 6-6" />
                        <path className="chev chev-2" d="M6 8l6 6 6-6" />
                    </svg>
                </button>
            </div>
        </section>
    )
}
