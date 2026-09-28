/* three.js 画布：把扫描线帆船装进 React。
   - effect 只在挂载时跑一次：建 renderer / scene / 灯光 / 船，启动渲染循环
   - progress 经 ref 传进循环，不会每次百分比更新都重建场景
   - 卸载时完整释放（翻页切走、StrictMode 双挂载都安全） */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createProceduralShip } from '../three/scanShip/ProceduralShip'
import { buildScanShip } from '../three/scanShip/scanShipBuilder'
import { ScanShip } from '../three/scanShip/ScanShip'

/* 真实航行：船在侧视平面内航行，yaw 是绕桅杆（Y 轴）的转向（0 = 船艏朝右，π = 朝左）。
   操舵逻辑：小角度直航追踪；大角度掉头（>100°）时先沿当前艏向直行一段，
   再顺势拐弯进港 → 急转弯时减速 → 到港前收速（比页面稍晚滑入泊位）。 */
const SAIL_MS = 700
const TURN_RATE = 8 /* 转向角速度 rad/s */
const SETTLE_RATE = 4 /* 到港后回正角速度 rad/s */
const MAX_SPEED = 700 /* 世界单位/秒 */
const ARRIVE_K = 4 /* 进港减速：速度上限 = 到目标距离 × K，越近越慢 */
const PHASE1_T = 0.34 /* 直行航段时间（秒）：大角度掉头时先走直线 */

/* 屏幕坐标（CSS px）→ 世界坐标：保持船到相机的视线距离不变，
   只在相机的右/上方向上平移，船的表观大小不变 */
function screenToWorld(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, xPx: number, yPx: number): THREE.Vector3 {
    camera.updateMatrixWorld()
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize()
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    const dist = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), camera.position).dot(dir)
    const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h
    const dxPx = xPx - w / 2
    const dyPx = yPx - h / 2
    return new THREE.Vector3()
        .addScaledVector(right, dxPx * worldPerPx)
        .addScaledVector(up, -dyPx * worldPerPx)
}

/* 船在第 activePage 页的停靠点：视频标题（h2）文字的左侧、垂直居中。
   用 h2 相对 section 的偏移计算——翻页过程中两者一起平移，此值不变；
   section 落定后停在视口顶部，直接得到标题的最终屏幕坐标。 */
function dockTarget(activePage: number, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): THREE.Vector3 {
    const home = new THREE.Vector3(0, 0, 0)
    if (activePage <= 0) return home
    const page = document.querySelectorAll('.video-page')[activePage - 1]
    const h2 = page?.querySelector('.video-meta h2')
    if (!page || !h2) return home
    const hr = h2.getBoundingClientRect()
    const sr = page.getBoundingClientRect()
    const xPx = hr.left - 64 /* 标题文字左侧：船半宽 + 边距 */
    const yPx = hr.top - sr.top + hr.height / 2
    return screenToWorld(camera, canvas, xPx, yPx)
}

interface ScanCanvasProps {
    progress: number
    /* 0 = 预加载页（船在中央），>0 = 停靠到第几个视频页的标题处 */
    activePage: number
}

export default function ScanCanvas({ progress, activePage }: ScanCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const progressRef = useRef(progress)
    const activePageRef = useRef(activePage)
    const sailRef = useRef<THREE.Group | null>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    /* 真实航行状态：yaw 绕 Y 轴（桅杆）持续累积，跨次航行不断 */
    const sailAnimRef = useRef<{
        to: THREE.Vector3
        t: number
        yaw: number
        settling: boolean
        rightW: THREE.Vector3 /* 屏幕右方向在 XZ 平面的投影：船的航道轴 */
        waypoint: THREE.Vector3 | null /* 大角度掉头时的直行航段目标 */
        phase: 1 | 2
    } | null>(null)

    useEffect(() => {
        progressRef.current = progress
    }, [progress])

    /* 翻页时起航：记下目标停靠点；转向与推进在渲染循环里按操舵逻辑走 */
    useEffect(() => {
        activePageRef.current = activePage
        const sail = sailRef.current
        const camera = cameraRef.current
        const canvas = canvasRef.current
        if (!sail || !camera || !canvas) return
        camera.updateMatrixWorld()
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
        right.y = 0
        right.normalize()
        const prev = sailAnimRef.current
        const startYaw = prev ? prev.yaw : sail.rotation.y
        const to = dockTarget(activePage, camera, canvas)
        /* 大角度掉头（>100°）：先沿当前艏向直行一段（不超过半个界面宽度），再顺势拐弯 */
        let waypoint: THREE.Vector3 | null = null
        const toStart = new THREE.Vector3().subVectors(to, sail.position)
        if (toStart.length() > 40) {
            const yawRight = Math.atan2(-right.z, right.x)
            const desired = toStart.x >= 0 ? yawRight : yawRight + Math.PI
            const err = Math.abs(THREE.MathUtils.euclideanModulo(desired - startYaw + Math.PI, Math.PI * 2) - Math.PI)
            if (err > 1.75) {
                const worldPerPx = (2 * camera.position.distanceTo(new THREE.Vector3()) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / canvas.clientHeight
                const legLen = Math.min(worldPerPx * canvas.clientWidth * 0.5, toStart.length() * 0.5)
                waypoint = sail.position.clone().add(new THREE.Vector3(
                    Math.cos(startYaw) * legLen, 0, -Math.sin(startYaw) * legLen,
                ))
            }
        }
        sailAnimRef.current = {
            to,
            t: 0,
            yaw: startYaw,
            settling: false,
            rightW: right,
            waypoint,
            phase: 1,
        }
    }, [activePage])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setClearColor(0x000000, 0)

        const scene = new THREE.Scene()

        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500)
        camera.position.set(192, 90, 352)
        camera.lookAt(0, 2, 0)

        /* 基底灯用暖白，还原船体剪影；蓝色只留给轮廓光和扫描线特效做冷暖对比 */
        scene.add(new THREE.AmbientLight(0xfff2e0, 1.0))
        const key = new THREE.DirectionalLight(0xfff4e0, 1.2)
        key.position.set(30, 50, 40)
        scene.add(key)
        const rim = new THREE.DirectionalLight(0x3355aa, 0.6)
        rim.position.set(-40, 20, -30)
        scene.add(rim)

        const { points, meshes } = buildScanShip(createProceduralShip())
        const sprite = (points.material as THREE.ShaderMaterial).uniforms.uTexture.value as THREE.CanvasTexture
        const ship = new ScanShip(points, meshes)

        const floater = new THREE.Group()
        floater.add(ship)
        /* 航行组：翻页时船在场景内平移，canvas 本体保持全屏不动 */
        const sail = new THREE.Group()
        sail.add(floater)
        scene.add(sail)
        sailRef.current = sail
        cameraRef.current = camera

        const resize = () => {
            const w = canvas.clientWidth
            const h = canvas.clientHeight
            if (w === 0 || h === 0) return
            renderer.setSize(w, h, false)
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            /* 停靠中改变窗口尺寸：按新尺寸重算停靠点，避免船漂移 */
            if (activePageRef.current > 0 && !sailAnimRef.current && sailRef.current) {
                sailRef.current.position.copy(dockTarget(activePageRef.current, camera, canvas))
            }
        }
        resize()
        window.addEventListener('resize', resize)

        let raf = 0
        let last = performance.now()
        let t = 0
        const animate = (now: number) => {
            raf = requestAnimationFrame(animate)
            const delta = Math.min(0.05, (now - last) / 1000)
            last = now
            t += delta

            ship.setTargetProgress(progressRef.current / 100)
            ship.tick(delta)

            floater.position.y = Math.sin(t * 0.8) * 0.8
            floater.rotation.y = Math.sin(t * 0.15) * 0.06
            floater.rotation.z = Math.sin(t * 0.6) * 0.015

            /* 真实航行：先转向目标（绕桅杆 yaw，桅杆始终朝上），再沿船艏方向推进；
               急转弯时减速，边转边走划出弧线；高度差很小，直接柔和跟随 */
            const st = sailAnimRef.current
            if (st) {
                const dur = SAIL_MS / 1000
                st.t += delta

                /* 航段：大角度掉头时先直行一段（waypoint），再顺势拐弯进港；无 waypoint 直接进第二段 */
                let target = st.phase === 1 && st.waypoint ? st.waypoint : st.to
                let toTarget = new THREE.Vector3().subVectors(target, sail.position)
                let dist = toTarget.length()
                if (st.phase === 1 && (!st.waypoint || dist < 14 || st.t >= PHASE1_T)) {
                    st.phase = 2
                    target = st.to
                    toTarget = new THREE.Vector3().subVectors(target, sail.position)
                    dist = toTarget.length()
                }

                if (!st.settling) {
                    /* 期望艏向：目标在右舷朝 yawRight，在左舷朝 yawRight + π；走最短转向 */
                    const yawRight = Math.atan2(-st.rightW.z, st.rightW.x)
                    /* 最终进港（6 个单位内）：保持艏向直线进坞，不再追逐抖动的方位角 */
                    const finalApproach = st.phase === 2 && dist < 6
                    let diff = 0
                    let yawVel = 0
                    if (!finalApproach) {
                        const desired = toTarget.x >= 0 ? yawRight : yawRight + Math.PI
                        diff = THREE.MathUtils.euclideanModulo(desired - st.yaw + Math.PI, Math.PI * 2) - Math.PI
                        const prevYaw = st.yaw
                        st.yaw += THREE.MathUtils.clamp(diff, -TURN_RATE * delta, TURN_RATE * delta)
                        yawVel = (st.yaw - prevYaw) / Math.max(delta, 1e-4)
                    }

                    /* 第一段：按直行段时间配速、带速过 waypoint 不减速；第二段：进港减速 */
                    const align = finalApproach ? 1 : Math.max(0, Math.cos(THREE.MathUtils.clamp(diff, -Math.PI / 2, Math.PI / 2)))
                    const remaining = st.phase === 1
                        ? Math.max(PHASE1_T - st.t, 1e-3)
                        : Math.max(dur - st.t, 1e-3)
                    let speed = st.phase === 1
                        ? Math.min(dist / remaining, 420)
                        : Math.min(dist / remaining, MAX_SPEED, dist * ARRIVE_K)
                    speed *= 0.35 + 0.65 * align
                    speed *= Math.min(1, st.t / 0.12)

                    sail.position.x += Math.cos(st.yaw) * speed * delta
                    sail.position.z += -Math.sin(st.yaw) * speed * delta
                    sail.position.y += (target.y - sail.position.y) * Math.min(1, delta * 8)

                    /* 转弯压舷（小角度点缀） */
                    sail.rotation.z = THREE.MathUtils.clamp(yawVel * 0.015, -0.06, 0.06)

                    /* 到港：距离足够近就收速停靠；超时兜底 */
                    if (st.phase === 2 && (dist < 2.5 || st.t >= dur + 0.8)) {
                        sail.position.copy(st.to)
                        sail.rotation.z = 0
                        /* 回到预加载页：把船艏回正朝右；视频页保持到港艏向 */
                        st.settling = activePageRef.current <= 0
                        if (!st.settling) sailAnimRef.current = null
                    }
                } else {
                    /* 到港回正：原地缓慢转向，不再位移 */
                    const diff = THREE.MathUtils.euclideanModulo(0 - st.yaw + Math.PI, Math.PI * 2) - Math.PI
                    st.yaw += THREE.MathUtils.clamp(diff, -SETTLE_RATE * delta, SETTLE_RATE * delta)
                    if (Math.abs(diff) < 0.02) {
                        st.yaw = 0
                        sailAnimRef.current = null
                    }
                }
                sail.rotation.y = st.yaw
            }

            renderer.render(scene, camera)
        }
        raf = requestAnimationFrame(animate)

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', resize)
            scene.traverse((obj) => {
                const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
                geo?.dispose()
                const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
                if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
                else mat?.dispose()
            })
            sprite.dispose()
            renderer.dispose()
        }
    }, [])

    return <canvas ref={canvasRef} className="scan-canvas" />
}
