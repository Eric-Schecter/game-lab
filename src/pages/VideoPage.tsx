interface VideoPageProps {
    videoRef: (el: HTMLVideoElement | null) => void
    videoSrc: string | undefined
    kicker: string
    title: string
    desc: string
    linkUrl: string
    linkLabel: string
}

export default function VideoPage({ videoRef, videoSrc, kicker, title, desc, linkUrl, linkLabel }: VideoPageProps) {
    return (
        <section className="video-page">
            <div className="video-stage">
                <video ref={videoRef} src={videoSrc} muted playsInline preload="auto" loop />
            </div>
            <aside className="video-meta">
                <p className="kicker">{kicker}</p>
                <h2>{title}</h2>
                <p className="desc">{desc}</p>
                <nav className="video-links">
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                        {linkLabel}
                    </a>
                </nav>
            </aside>
        </section>
    )
}
