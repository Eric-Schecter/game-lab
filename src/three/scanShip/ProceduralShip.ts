/* 程序化帆船：剪影式低多边形三桅帆船。
   voyager 用的是 46MB 的 GLB 模型，预加载页等不起，所以这里用几何体现场拼一艘。
   扫描线材质对任意网格都生效，剪影在幽灵风渲染下足够好看。 */
import {
    BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Group, Mesh,
    MeshStandardMaterial, PlaneGeometry, Vector3,
} from 'three'

function std(color: number, roughness = 0.8, metalness = 0.2): MeshStandardMaterial {
    return new MeshStandardMaterial({ color, roughness, metalness })
}

/* 船体：拉长的方体，首尾收窄、底部上收、首尾上翘 */
function hullGeometry(): BoxGeometry {
    const geo = new BoxGeometry(22, 5, 7, 14, 3, 4)
    const pos = geo.attributes.position
    const v = new Vector3()
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        const t = Math.min(1, Math.abs(v.x) / 11)
        const taper = 1 - Math.pow(t, 2.4) * 0.88
        let y = v.y
        const z = v.z * taper
        if (v.y < 0) {
            y = v.y * (1 - Math.pow(t, 2) * 0.55) + Math.pow(t, 2.2) * 2.2
        }
        if (v.x > 7) y += (v.x - 7) * 0.5
        if (v.x < -7) y += (-v.x - 7) * 0.35
        pos.setXYZ(i, v.x, y, z)
    }
    geo.computeVertexNormals()
    return geo
}

/* 方帆：带一点兜风的弧度 */
function sailGeometry(w: number, h: number): PlaneGeometry {
    const geo = new PlaneGeometry(w, h, 8, 5)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const belly = Math.cos((x / w) * Math.PI) * Math.cos((y / h) * Math.PI)
        pos.setZ(i, Math.max(0, belly) * 1.1)
    }
    geo.computeVertexNormals()
    return geo
}

function addMesh(group: Group, geo: BufferGeometry, mat: MeshStandardMaterial, x = 0, y = 0, z = 0): Mesh {
    const mesh = new Mesh(geo, mat)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
}

export function createProceduralShip(): Group {
    const ship = new Group()
    const hullMat = std(0x24344d, 0.75, 0.3)
    const deckMat = std(0x2e3f5c, 0.85, 0.15)
    const mastMat = std(0x4a3a2c, 0.9, 0.05)
    const sailMat = new MeshStandardMaterial({ color: 0x9fb2cc, roughness: 0.9, metalness: 0, side: DoubleSide })

    addMesh(ship, hullGeometry(), hullMat, 0, 0, 0)
    addMesh(ship, new BoxGeometry(19, 0.5, 5.6), deckMat, 0, 2.6, 0)
    addMesh(ship, new BoxGeometry(5, 3, 5), hullMat, -8.5, 4, 0)

    // 三桅：前桅 / 主桅 / 后桅
    const masts = [
        { x: 6, h: 16 },
        { x: 0, h: 19 },
        { x: -6, h: 13 },
    ]
    for (const m of masts) {
        addMesh(ship, new CylinderGeometry(0.22, 0.32, m.h, 8), mastMat, m.x, 2.6 + m.h / 2, 0)
    }

    // 横桁 + 方帆（帆面与船体纵轴垂直）
    const yards = [
        { x: 6, y: 11, len: 7.5, sailW: 7, sailH: 4.4 },
        { x: 6, y: 15, len: 6.4, sailW: 6, sailH: 3.8 },
        { x: 0, y: 12, len: 9, sailW: 8.4, sailH: 4.6 },
        { x: 0, y: 17, len: 7.6, sailW: 7, sailH: 4 },
        { x: -6, y: 10, len: 6, sailW: 5.6, sailH: 3.6 },
        { x: -6, y: 13.5, len: 5, sailW: 4.6, sailH: 3.2 },
    ]
    for (const yd of yards) {
        const spar = addMesh(ship, new CylinderGeometry(0.12, 0.12, yd.len, 6), mastMat, yd.x, yd.y, 0)
        spar.rotation.x = Math.PI / 2
        const sail = addMesh(ship, sailGeometry(yd.sailW, yd.sailH), sailMat, yd.x, yd.y - yd.sailH / 2 - 0.25, 0)
        sail.rotation.y = Math.PI / 2
    }

    // 船头斜桅
    const bowsprit = addMesh(ship, new CylinderGeometry(0.14, 0.2, 9, 6), mastMat, 13.2, 5.2, 0)
    bowsprit.rotation.z = -Math.PI / 2 + 0.38

    return ship
}
