/* 精简版 Actor（voyager/src/boat/actor.ts）：
   去掉时间轴过渡、海浪跟随、航行、销毁逻辑；
   扫描线位置改由外部进度直接驱动：setTargetProgress(p)。 */
import {
    AdditiveBlending, Box3, BufferAttribute, BufferGeometry, Group, Line,
    LineBasicMaterial, Mesh, MeshStandardMaterial, Points, ShaderMaterial, Vector3,
} from 'three'

function random(min: number, max: number): number {
    return min + Math.random() * (max - min)
}

export class ScanShip extends Group {
    private _points: Points
    private _meshes: Group
    private _rayGroup = new Group()
    private _bbox = new Box3()
    private _scan = -0.08
    private _target = 0

    public constructor(points: Points, meshes: Group) {
        super()
        this._points = points
        this._meshes = meshes
        this.add(points)
        this.add(meshes)
        this.add(this._rayGroup)

        this._bbox.setFromObject(meshes)

        const mat = points.material as ShaderMaterial
        mat.uniforms.uShow.value = 1
        meshes.traverse((o) => {
            if (o instanceof Mesh) {
                const m = o.material as MeshStandardMaterial
                m.userData.customUniforms.uShow.value = 1
            }
        })

        this._updateMaterial()
        this._applyScan(this._scan)
    }

    /* 外部进度（0-1）：下载百分比直接映射为扫描线位置 */
    public setTargetProgress(p: number) {
        this._target = Math.min(1, Math.max(0, p))
    }

    public tick(delta: number) {
        // 扫描线平滑追踪目标，百分比跳变时船体不闪
        const targetScan = this._target * 1.18 - 0.08
        this._scan += (targetScan - this._scan) * Math.min(1, delta * 5)
        if (Math.abs(targetScan - this._scan) < 0.0005) this._scan = targetScan
        this._applyScan(this._scan)

        // 扫描进行中时，在扫描线处打下光柱
        if (this._target > 0.005 && this._target < 0.999 && Math.random() < 0.5) {
            const { max, min } = this._bbox
            this._spawnRays(3, min.y + this._scan * (max.y - min.y))
        }
        this._updateRays(delta)
    }

    public get height(): number {
        return this._bbox.max.y - this._bbox.min.y
    }

    private _updateMaterial() {
        const mat = this._points.material as ShaderMaterial
        const scale = 1.1
        mat.uniforms.uRangeY.value = this.height * scale
        mat.uniforms.uBottom.value = this._bbox.min.y
        this._meshes.traverse((o) => {
            if (o instanceof Mesh) {
                const u = (o.material as MeshStandardMaterial).userData.customUniforms
                u.uRangeY.value = this.height * scale
                u.uBottom.value = this._bbox.min.y
            }
        })
    }

    private _applyScan(scan: number) {
        const mat = this._points.material as ShaderMaterial
        mat.uniforms.uReveal.value = scan
        mat.uniforms.uScan.value = scan
        this._meshes.traverse((o) => {
            if (o instanceof Mesh) {
                const u = (o.material as MeshStandardMaterial).userData.customUniforms
                u.uReveal.value = scan - 0.05
                u.uScan.value = scan - 0.05
            }
        })
    }

    private _pickRayTargetIndex(scanY: number, rangeY: number): Vector3 | null {
        const attr = this._points.geometry.getAttribute('position') as BufferAttribute
        const arr = attr.array as Float32Array
        const count = arr.length / 3
        for (let tries = 0; tries < 48; tries++) {
            const i = Math.floor(Math.random() * count) * 3
            if (Math.abs(arr[i + 1] - scanY) < rangeY / 100) {
                return new Vector3(arr[i], arr[i + 1], arr[i + 2])
            }
        }
        return null
    }

    private _spawnRays(total: number, scanY: number) {
        const { max, min } = this._bbox
        const rangeX = max.x - min.x
        const rangeY = max.y - min.y
        const rangeZ = max.z - min.z
        for (let i = 0; i < total; i++) {
            const target = this._pickRayTargetIndex(scanY, rangeY)
            if (!target) continue
            const src = new Vector3(
                target.x + random(-rangeX, rangeX) * 2,
                max.y + rangeY * 4,
                target.z + random(-rangeZ, rangeZ) * 2,
            )
            const geo = new BufferGeometry().setFromPoints([src, target])
            const mat = new LineBasicMaterial({
                color: 0x88aaff,
                transparent: true,
                opacity: 0.34,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
                blending: AdditiveBlending,
            })
            const line = new Line(geo, mat)
            const life = random(0.18, 0.56)
            line.userData.life = life
            line.userData.maxLife = life
            this._rayGroup.add(line)
        }
    }

    private _updateRays(delta: number) {
        for (let i = this._rayGroup.children.length - 1; i >= 0; i--) {
            const ray = this._rayGroup.children[i]
            if (!(ray instanceof Line)) continue
            ray.userData.life -= delta
            const mat = ray.material as LineBasicMaterial
            mat.opacity = Math.max(0, ray.userData.life / ray.userData.maxLife) * 0.38
            if (this._scan > 0.8) {
                mat.opacity -= 0.2 * this._scan
            }
            const attr = ray.geometry.getAttribute('position') as BufferAttribute
            attr.setY(1, attr.getY(1) + delta * this.height)
            attr.needsUpdate = true
            if (ray.userData.life <= 0) {
                ray.geometry.dispose()
                mat.dispose()
                this._rayGroup.remove(ray)
            }
        }
    }
}
