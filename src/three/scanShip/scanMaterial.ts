/* 从 voyager/src/boat/actor_creator.ts 移植：粒子贴图、点云材质、网格扫描线材质补丁。
   去掉了 GLB 加载部分（预加载页用程序化帆船，不需要模型文件）。 */
import {
    AdditiveBlending, CanvasTexture, Color, MeshStandardMaterial, ShaderMaterial,
} from 'three'

/* 粒子贴图：径向渐变圆点 */
export function makeParticleSprite(): CanvasTexture {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    const s = 64 * 10
    c.width = s
    c.height = s
    const center = s / 2
    const radius = s / 2
    const g = ctx.createRadialGradient(center, center, 0, center, center, radius)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.24, 'rgba(255,255,255,.9)')
    g.addColorStop(0.72, 'rgba(255,255,255,.18)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    const tex = new CanvasTexture(c)
    tex.needsUpdate = true
    return tex
}

/* 点云材质：粒子只在扫描线附近发光，形成那条扫过的光带 */
export function createPointsMaterial(sprite: CanvasTexture): ShaderMaterial {
    return new ShaderMaterial({
        uniforms: {
            uTexture: { value: sprite },
            uPointSize: { value: 640 * window.devicePixelRatio },
            uColor: { value: new Color(0x88aaff) },
            uScan: { value: 0 },
            uReveal: { value: 1 },
            uShow: { value: 1 },
            uRangeY: { value: 1 },
            uBottom: { value: 0 },
        },
        vertexShader: /* glsl */ `
            attribute float alpha;
            uniform float uPointSize;
            uniform float uRangeY;
            uniform float uScan;
            uniform float uReveal;
            uniform float uShow;
            uniform float uBottom;
            varying float vScan;
            varying float vAlpha;

            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                float worldY = clamp((worldPosition.y - uBottom) / uRangeY, 0.0, 1.0);

                vec4 mvPosition = viewMatrix * worldPosition;
                gl_PointSize = uPointSize * (1.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;

                float scanGlow = 1.0 - smoothstep(0.0, 0.02, abs(worldY - uScan));
                float revealAlpha = 1.0 - smoothstep(uReveal, uReveal + 0.075, worldY);

                vScan = scanGlow;
                vAlpha = revealAlpha;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform sampler2D uTexture;
            uniform vec3 uColor;
            varying float vAlpha;
            varying float vScan;

            void main() {
                vec4 tex = texture2D(uTexture, gl_PointCoord);
                float alpha = tex.a * vAlpha * (vScan * 1.4);
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
    })
}

/* 网格材质补丁：扫描线以下实体、以上透明，扫描线附近发光 */
export function setupScanMaterial(material: MeshStandardMaterial): MeshStandardMaterial {
    if (material.userData.customUniforms) return material

    const customUniforms = {
        uColor: { value: new Color(0x88aaff) },
        uScan: { value: 0 },
        uReveal: { value: 1 },
        uShow: { value: 1 },
        uRangeY: { value: 1 },
        uBottom: { value: 0 },
    }

    material.userData.customUniforms = customUniforms
    material.transparent = true
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uScan = customUniforms.uScan
        shader.uniforms.uReveal = customUniforms.uReveal
        shader.uniforms.uShow = customUniforms.uShow
        shader.uniforms.uRangeY = customUniforms.uRangeY
        shader.uniforms.uColor = customUniforms.uColor
        shader.uniforms.uBottom = customUniforms.uBottom

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            /* glsl */ `#include <common>
                varying vec4 vWorldPosition;
            `,
        )

        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            /* glsl */ `#include <project_vertex>
                vWorldPosition = modelMatrix * vec4(position, 1.0);
            `,
        )

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            /* glsl */ `#include <common>
                uniform float uScan;
                uniform float uReveal;
                uniform float uShow;
                uniform float uRangeY;
                uniform float uBottom;
                uniform vec3 uColor;
                varying vec4 vWorldPosition;
            `,
        )

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            /* glsl */ `#include <opaque_fragment>
                float worldY = clamp((vWorldPosition.y - uBottom) / uRangeY, 0.0, 1.0);
                float scanGlow = 1.0 - smoothstep(0.0, 0.05, abs(worldY - uScan));
                float revealAlpha = 1.0 - smoothstep(uReveal, uReveal + 0.075, worldY);
                if (uShow == 0.0) {
                    revealAlpha = 1.0 - revealAlpha;
                }
                float finalAlpha = diffuseColor.a * revealAlpha * (1.0 + scanGlow * 1.4);
                gl_FragColor.a = finalAlpha;
            `,
        )
    }
    return material
}
