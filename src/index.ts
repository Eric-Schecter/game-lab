const wrapper = document.querySelector('.wrapper') as HTMLElement;
const pages = document.querySelectorAll('section');
const total = pages.length;

let current = 0;
let animating = false;
const DURATION = 700; // 必须和 CSS transition 时间一致

const videos = document.querySelectorAll('video');

function setTransform(animate = true) {
    if (!wrapper) return;
    const h = window.innerHeight;
    if (!animate) wrapper.style.transition = 'none';
    wrapper.style.transform = `translateY(-${current * h}px)`;
    if (!animate) {
        // 强制回流后再恢复 transition，避免下次切换没有动画
        void wrapper.offsetHeight;
        wrapper.style.transition = '';
    }
}

function videoInPage(index: number): HTMLVideoElement | null {
    return pages[index]?.querySelector('video') ?? null;
}

function handleVideo(index: number, restart = false) {
    const active = videoInPage(index);
    videos.forEach((video) => {
        if (video === active) {
            if (restart) video.currentTime = 0;
            video.play().catch(() => { });
        } else {
            video.pause();
            video.currentTime = 0;
        }
    });
}

function goTo(index: number) {
    if (index < 0 || index >= total || animating || index === current) return;
    animating = true;
    current = index;
    // 进入视频页时立刻开播，翻页过程中画面已经在动
    handleVideo(current, true);
    setTransform(true);
    setTimeout(() => {
        animating = false;
        handleVideo(current);
    }, DURATION);
}

/* 滚轮 */
window.addEventListener('wheel', (e) => {
    if (animating) return;
    if (e.deltaY > 0) goTo(current + 1);
    else goTo(current - 1);
}, { passive: true }); // 这里不需要 preventDefault，因为根本没原生滚动

/* 键盘 */
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') goTo(current + 1);
    if (e.key === 'ArrowUp' || e.key === 'PageUp') goTo(current - 1);
});

/* 说明栏跳转链接 */
document.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
    if (!link) return;
    e.preventDefault();
    const index = Number(link.dataset.goto);
    if (Number.isInteger(index)) goTo(index);
});
let resizeTimer: number;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => setTransform(false), 100);
});
