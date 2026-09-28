/* 把任意 three.js Group 转成扫描线船：
   网格逐个打上扫描线材质补丁 + 按面积采样点云；
   整体居中并把最长边归一到 40（照搬 voyager 的尺度逻辑）。 */
import {
    Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh,
    MeshStandardMaterial, Points, Vector3,
} from 'three'
import { PointGenerator } from './pointGenerator'
import type { Triangle } from './pointGenerator'
import { createPointsMaterial, makeParticleSprite, setupScanMaterial } from './scanMaterial'

export function buildScanShip(source: Group, targetCount = 45000): { points: Points; meshes: Group } {
    const meshes = new Group()
    const generator = new PointGenerator()

    source.updateMatrixWorld(true)

    interface MeshData { triangles: Triangle[]; totalArea: number }
    const datas: MeshData[] = []

    source.traverse((child) => {
        if (!(child instanceof Mesh)) return
        const posAttr = child.geometry.getAttribute('position') as BufferAttribute | undefined
        const index = child.geometry.getIndex()
        if (!posAttr) return

        const mesh = new Mesh(
            child.geometry.clone(),
            setupScanMaterial((child.material as MeshStandardMaterial).clone()),
        )
        mesh.geometry.applyMatrix4(child.matrixWorld)
        meshes.add(mesh)

        const triangles: Triangle[] = []
        let totalArea = 0
        const v0 = new Vector3(), v1 = new Vector3(), v2 = new Vector3()
        const pushTri = (a: Vector3, b: Vector3, c: Vector3) => {
            const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
            totalArea += area
            triangles.push({ v0: a.clone(), v1: b.clone(), v2: c.clone(), area })
        }
        if (index) {
            for (let i = 0; i < index.count; i += 3) {
                v0.fromBufferAttribute(posAttr, index.getX(i)).applyMatrix4(child.matrixWorld)
                v1.fromBufferAttribute(posAttr, index.getX(i + 1)).applyMatrix4(child.matrixWorld)
                v2.fromBufferAttribute(posAttr, index.getX(i + 2)).applyMatrix4(child.matrixWorld)
                pushTri(v0, v1, v2)
            }
        } else {
            for (let i = 0; i < posAttr.count; i += 3) {
                v0.fromBufferAttribute(posAttr, i).applyMatrix4(child.matrixWorld)
                v1.fromBufferAttribute(posAttr, i + 1).applyMatrix4(child.matrixWorld)
                v2.fromBufferAttribute(posAttr, i + 2).applyMatrix4(child.matrixWorld)
                pushTri(v0, v1, v2)
            }
        }
        datas.push({ triangles, totalArea })
    })

    const grandTotal = datas.reduce((s, d) => s + d.totalArea, 0)

    // 归一化：中心移到原点，最长边缩放到 40
    const box = new Box3().setFromObject(meshes)
    const size = new Vector3()
    box.getSize(size)
    const center = new Vector3()
    box.getCenter(center)
    const scale = 40 / Math.max(1, Math.max(size.x, size.y, size.z))
    meshes.applyMatrix4(
        new Matrix4().makeScale(scale, scale, scale)
            .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z)),
    )
    for (const d of datas) {
        for (const t of d.triangles) {
            t.v0.sub(center).multiplyScalar(scale)
            t.v1.sub(center).multiplyScalar(scale)
            t.v2.sub(center).multiplyScalar(scale)
            t.area *= scale * scale
        }
        d.totalArea *= scale * scale
    }

    const allPoints: { x: number; y: number; z: number }[] = []
    if (grandTotal > 0) {
        let remaining = targetCount
        for (const d of datas) {
            let n = Math.floor((d.totalArea / grandTotal) * targetCount)
            n = Math.max(n, Math.min(100, Math.floor(targetCount * 0.01)))
            n = Math.min(n, remaining)
            const pts = generator.sampleMeshTrianglesYUniformSimple(d.triangles, n)
            for (const p of pts) allPoints.push({ x: p.x, y: p.y, z: p.z })
            remaining -= pts.length
        }
        if (remaining > 0 && datas.length > 0) {
            const largest = datas.reduce((a, b) => (a.totalArea > b.totalArea ? a : b))
            const extra = generator.sampleMeshTrianglesYUniformSimple(largest.triangles, remaining)
            for (const p of extra) allPoints.push({ x: p.x, y: p.y, z: p.z })
        }
    }

    const positions = new Float32Array(allPoints.length * 3)
    allPoints.forEach((p, i) => {
        positions[i * 3] = p.x
        positions[i * 3 + 1] = p.y
        positions[i * 3 + 2] = p.z
    })
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    const points = new Points(geo, createPointsMaterial(makeParticleSprite()))

    return { points, meshes }
}
