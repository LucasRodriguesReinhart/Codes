// Post chain: scene (single or split-screen) -> bloom -> tone map -> "edit" grade pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Renders one or more {scene, camera, rect:[x,y,w,h] in 0..1 from bottom-left} views.
class ViewsPass extends Pass {
  constructor() { super(); this.views = []; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    // Viewport/scissor live on the render target: shadow-map passes inside render()
    // restore the target's own viewport, which would wipe a renderer-level viewport.
    const t = readBuffer, W = t.width, H = t.height;
    t.viewport.set(0, 0, W, H); t.scissorTest = false;
    renderer.setRenderTarget(t); renderer.setClearColor(0x000000, 1); renderer.clear();
    for (const v of this.views) {
      const [x, y, w, h] = v.rect || [0, 0, 1, 1];
      t.viewport.set(x * W, y * H, w * W, h * H); t.scissor.set(x * W, y * H, w * W, h * H); t.scissorTest = true;
      renderer.setRenderTarget(t);
      v.camera.aspect = (w * W) / (h * H); v.camera.updateProjectionMatrix();
      renderer.render(v.scene, v.camera);
    }
    t.viewport.set(0, 0, W, H); t.scissorTest = false; renderer.setRenderTarget(t);
  }
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, ca: { value: 0 }, zoomBlur: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.5) },
    vignette: { value: 0.35 }, flash: { value: 0 }, flashColor: { value: new THREE.Color('#ffffff') }, sat: { value: 1.12 },
    contrast: { value: 1.06 }, time: { value: 0 }, grain: { value: 0.025 }, dirBlur: { value: new THREE.Vector2(0, 0) }, invert: { value: 0 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float ca, zoomBlur, vignette, flash, sat, contrast, time, grain, invert; uniform vec2 center, dirBlur; uniform vec3 flashColor, tint; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
    vec3 samp(vec2 uv){
      vec2 d = uv-center; float k = ca*length(d);
      return vec3(texture2D(tDiffuse, uv - d*k).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + d*k).b);
    }
    void main(){
      vec3 c = vec3(0.);
      if (zoomBlur > 0.001 || length(dirBlur) > 0.0001) {
        for (int i=0;i<16;i++){ float f=float(i)/15.; vec2 uv = vUv + (center - vUv)*zoomBlur*f + dirBlur*(f-0.5); c += samp(uv); }
        c /= 16.;
      } else c = samp(vUv);
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(l), c, sat);
      c = (c-0.5)*contrast+0.5;
      c *= tint;
      vec2 v = vUv-0.5; v.x *= 0.62; c *= 1. - vignette*smoothstep(0.25, 0.75, length(v));
      c = mix(c, 1.-c, invert);
      c = mix(c, flashColor, clamp(flash,0.,1.));
      c += (rand(vUv*vec2(1080.,1920.)+time) - 0.5)*grain;
      gl_FragColor = vec4(c,1.);
    }`,
};

export function makePost(renderer, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(w, h);
  const views = new ViewsPass();
  const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.55, 0.55, 0.92);
  const final = new ShaderPass(FinalShader);
  composer.addPass(views); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(final);
  return { composer, views, bloom, final: final.uniforms };
}
