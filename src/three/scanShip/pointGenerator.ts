/* 从 voyager/src/boat/point_generator.ts 原样移植：
   按三角形面积 + Y 分层均匀采样点云。 */
import { Vector3 } from 'three'

export type Triangle = {
    v0: Vector3,
    v1: Vector3,
    v2: Vector3,
    area: number,
}

export class PointGenerator {
    public sampleMeshTrianglesYUniformSimple(triangles: Triangle[], count: number) {
        const points: { x: number, y: number, z: number, a: number }[] = []

        if (triangles.length === 0 || count === 0) return points

        let minY = Infinity, maxY = -Infinity
        for (const tri of triangles) {
            minY = Math.min(minY, tri.v0.y, tri.v1.y, tri.v2.y)
            maxY = Math.max(maxY, tri.v0.y, tri.v1.y, tri.v2.y)
        }
        const yRange = maxY - minY
        if (yRange === 0) return this._sampleMeshTriangles(triangles, count)

        const numLayers = Math.min(Math.ceil(count / 10), 100)
        const layerHeight = yRange / numLayers
        const pointsPerLayer = Math.floor(count / numLayers)
        const remaining = count - pointsPerLayer * numLayers

        const triYBounds = triangles.map(tri => ({
            tri,
            minY: Math.min(tri.v0.y, tri.v1.y, tri.v2.y),
            maxY: Math.max(tri.v0.y, tri.v1.y, tri.v2.y),
        }))

        let pointCount = 0
        for (let layer = 0; layer < numLayers && pointCount < count; layer++) {
            const layerMinY = minY + layer * layerHeight
            const layerMaxY = layerMinY + layerHeight

            const candidates = triYBounds.filter(
                b => b.maxY >= layerMinY && b.minY <= layerMaxY
            )

            if (candidates.length === 0) continue

            const totalArea = candidates.reduce((sum, c) => sum + c.tri.area, 0)
            let layerCount = pointsPerLayer
            if (layer < remaining) layerCount++
            layerCount = Math.min(layerCount, count - pointCount)

            for (let i = 0; i < layerCount; i++) {
                let r = Math.random() * totalArea
                let selected = candidates[0]
                for (const c of candidates) {
                    r -= c.tri.area
                    if (r <= 0) {
                        selected = c
                        break
                    }
                }

                let attempts = 0
                let success = false
                while (attempts < 30 && !success) {
                    let u = Math.random()
                    let v = Math.random()
                    if (u + v > 1) { u = 1 - u; v = 1 - v }
                    const w = 1 - u - v
                    const y = u * selected.tri.v0.y + v * selected.tri.v1.y + w * selected.tri.v2.y

                    if (y >= layerMinY && y < layerMaxY) {
                        points.push({
                            x: u * selected.tri.v0.x + v * selected.tri.v1.x + w * selected.tri.v2.x,
                            y: y,
                            z: u * selected.tri.v0.z + v * selected.tri.v1.z + w * selected.tri.v2.z,
                            a: 1.0,
                        })
                        pointCount++
                        success = true
                    }
                    attempts++
                }
            }
        }

        if (points.length < count) {
            const extra = this._sampleMeshTriangles(triangles, count - points.length)
            points.push(...extra)
        }

        return points
    }

    private _sampleMeshTriangles(triangles: Triangle[], count: number) {
        const points: { x: number, y: number, z: number, a: number }[] = []

        const totalArea = triangles.reduce((sum, t) => sum + t.area, 0)
        if (totalArea === 0) return points

        for (let i = 0; i < count; i++) {
            let r = Math.random() * totalArea
            let selected = triangles[0]
            for (const tri of triangles) {
                r -= tri.area
                if (r <= 0) {
                    selected = tri
                    break
                }
            }

            const { v0, v1, v2 } = selected
            let u = Math.random()
            let v = Math.random()
            if (u + v > 1) {
                u = 1 - u
                v = 1 - v
            }
            const w = 1 - u - v

            points.push({
                x: u * v0.x + v * v1.x + w * v2.x,
                y: u * v0.y + v * v1.y + w * v2.y,
                z: u * v0.z + v * v1.z + w * v2.z,
                a: 1.0,
            })
        }

        return points
    }
}
