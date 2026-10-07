"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const PADDLE_URL = "/3d%20models%20pickleball%20ref/pickleball_paddle.glb";
const BALL_URL = "/3d%20models%20pickleball%20ref/pickleball_ball.glb";

/* ---- Tunables ---- */
const PADDLE_H = 2.2; // paddle height in scene units
const BALL_D = 0.62; // ball diameter
const PIVOT_FRAC = 0.17; // hand position along paddle (0 = butt, 1 = tip)
const HEAD_FRAC = 0.65; // face center along paddle
const G = -8; // gravity (scene units / s²)
const CONTACT_Y = 1.4; // typical contact height
const AREA = { x: 0.8, z: 0.55 }; // half-extent of where contacts can land
const MAX_TILT = 0.7; // max face tilt from horizontal (rad)
const SQUASH = 0.07; // ball impact squash amount (keep small)
const SHADOW_OFFSET = new THREE.Vector3(0.16, 0, 0.1); // drop-shadow direction
const CAM_TARGET = new THREE.Vector3(0, 2.05, 0);
const BLEED = { x: 0.4, top: 0.5, bottom: 0.2 }; // canvas bleed past layout box

/* ---- Cartoon look ---- */
const OUTLINES = true; // set false to test whether the outline layer is the problem
const OUTLINE_COLOR = 0x12151d;
const OUTLINE_PADDLE = 0.026; // outline thickness in scene units
const OUTLINE_BALL = 0.008;
const TOON_STEPS = [0.6, 0.85, 1.0, 1.0]; // light bands (dark -> bright)

type Kind = "dink" | "normal" | "lob" | "drive";
const KIND_CFG: Record<Kind, { t: [number, number]; w: number }> = {
  dink: { t: [0.62, 0.8], w: 2 },
  normal: { t: [0.9, 1.15], w: 4 },
  lob: { t: [1.3, 1.45], w: 1.4 },
  drive: { t: [0.78, 0.95], w: 2 },
};
const CAM_PRESETS = [
  { az: 0.46, el: 0.14, dist: 7.6, roll: -0.045 },
  { az: 0.95, el: 0.08, dist: 7.0, roll: 0.05 },
  { az: 0.2, el: 0.2, dist: 7.9, roll: -0.02 },
  { az: -0.35, el: 0.1, dist: 7.3, roll: 0.04 },
  { az: 0.7, el: 0.03, dist: 6.6, roll: -0.06 },
  { az: 1.15, el: 0.16, dist: 7.4, roll: 0.03 },
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
const pickKind = (prev: Kind | null): Kind => {
  const entries = (Object.keys(KIND_CFG) as Kind[]).filter((k) => k !== prev);
  const total = entries.reduce((s, k) => s + KIND_CFG[k].w, 0);
  let r = Math.random() * total;
  for (const k of entries) {
    r -= KIND_CFG[k].w;
    if (r <= 0) return k;
  }
  return "normal";
};

interface Hit {
  P: THREE.Vector3; // contact point (ball center)
  T: number; // flight time to the NEXT hit
  kind: Kind;
  psi: number; // paddle heading offset
  beta: number; // wind-back amount before the next swing
  spin: THREE.Vector3; // spin axis * speed after this hit
  vin: THREE.Vector3; // ball velocity arriving at this hit
  pose?: { q: THREE.Quaternion; pos: THREE.Vector3 };
}

/**
 * Cartoon pickleball rally: toon-shaded models with inverted-hull outlines,
 * planned ball/paddle contacts, blob drop shadows, and a canvas that bleeds
 * past its layout box so nothing is clipped. Static frame on
 * prefers-reduced-motion; pauses offscreen/hidden.
 */
export default function Hero3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // tames IBL highlights
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

    // Image-based lighting so PBR/metallic GLB surfaces never go black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();

    // ---- Camera director ----
    const cam = { ...CAM_PRESETS[0] };
    let camTarget = { ...CAM_PRESETS[0] };
    let camPresetIdx = 0;
    let hitsUntilCam = 5;
    const placeCamera = (t: number) => {
      const a = cam.az + Math.sin(t * 0.3) * 0.03;
      const e = cam.el + Math.sin(t * 0.22) * 0.015;
      camera.position.set(
        CAM_TARGET.x + cam.dist * Math.cos(e) * Math.sin(a),
        CAM_TARGET.y + cam.dist * Math.sin(e) + 0.9,
        CAM_TARGET.z + cam.dist * Math.cos(e) * Math.cos(a),
      );
      camera.lookAt(CAM_TARGET);
      camera.rotateZ(cam.roll);
    };
    placeCamera(0);

        // Lighting: env map does the heavy lifting; analytic lights add direction.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d2e8, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 7, 4);
    scene.add(key);

    // ---- Cartoon materials ----
    const gradData = new Uint8Array(
      TOON_STEPS.flatMap((v) => {
        const b = Math.round(v * 255);
        return [b, b, b, 255];
      }),
    );
    const gradientMap = new THREE.DataTexture(gradData, TOON_STEPS.length, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;

    const signedVolume = (g: THREE.BufferGeometry) => {
      const p = g.attributes.position;
      const idx = g.index;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const n = idx ? idx.count : p.count;
      let vol = 0;
      for (let i = 0; i < n; i += 3) {
        a.fromBufferAttribute(p, idx ? idx.getX(i) : i);
        b.fromBufferAttribute(p, idx ? idx.getX(i + 1) : i + 1);
        c.fromBufferAttribute(p, idx ? idx.getX(i + 2) : i + 2);
        vol += a.dot(b.cross(c));
      }
      return vol / 6;
    };

    // Swap a model's materials for toon ones and add an inverted-hull outline.
    const toonify = (root: THREE.Object3D, outlineWorld: number) => {
      const scale = root.scale.x || 1;
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });
      for (const mesh of meshes) {
        // The GLBs have no normals; give them creased ones (hard edges stay crisp,
        // curved surfaces like the ball and grip stay smooth).
        if (!mesh.geometry.attributes.normal) {
          mesh.geometry = toCreasedNormals(mesh.geometry, 0.6);
        }
        const old = mesh.material as THREE.MeshStandardMaterial;
        mesh.material = new THREE.MeshToonMaterial({
          color: old.color ? old.color.clone() : new THREE.Color(0xffffff),
          map: old.map ?? null,
          gradientMap,
        });
        if (old.map) old.map.anisotropy = 4;
        if (!OUTLINES) continue;

        // Weld vertices so the hull has no cracks at hard edges.
        let g = mesh.geometry.clone();
        for (const name of Object.keys(g.attributes)) {
          if (name !== "position") g.deleteAttribute(name);
        }
        g = mergeVertices(g, 1e-5);
        // If the mesh is inside-out, flip winding so the hull grows outward.
        if (signedVolume(g) < 0 && g.index) {
          const ia = g.index.array as Uint16Array | Uint32Array;
          for (let i = 0; i < ia.length; i += 3) {
            const t = ia[i + 1];
            ia[i + 1] = ia[i + 2];
            ia[i + 2] = t;
          }
          g.index.needsUpdate = true;
        }
        g.computeVertexNormals();
        g.computeBoundingBox();
        const dims = g.boundingBox!.getSize(new THREE.Vector3());
        const thickness = Math.min(outlineWorld / scale, Math.max(dims.x, dims.y, dims.z) * 0.04);

        const hull = new THREE.Mesh(
          g,
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            polygonOffset: true,
            polygonOffsetFactor: 4,
            polygonOffsetUnits: 4,
            uniforms: {
              uThick: { value: thickness },
              uColor: { value: new THREE.Color(OUTLINE_COLOR) },
            },
            vertexShader: `
              uniform float uThick;
              void main() {
                vec3 p = position + normalize(normal) * uThick;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
              }`,
            fragmentShader: `
              uniform vec3 uColor;
              void main() { gl_FragColor = vec4(uColor, 1.0); }`,
          }),
        );
        mesh.add(hull);
      }
    };

    // ---- Soft blob drop shadows ----
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext("2d")!;
    const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.9)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.35)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const makeShadow = () => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.3,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.01;
      scene.add(m);
      return m;
    };
    const ballShadow = makeShadow();
    const paddleShadow = makeShadow();

    // ---- Paddle: origin at the hand; face normal = local +Z, head = local +Y ----
    const paddle = new THREE.Group();
    const HEAD_Y = (HEAD_FRAC - PIVOT_FRAC) * PADDLE_H;

    const paddleFallback = new THREE.Group();
    const fFace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.06, 28),
      new THREE.MeshToonMaterial({ color: 0x282b38, gradientMap }),
    );
    fFace.rotation.x = Math.PI / 2;
    fFace.position.y = HEAD_Y;
    const fHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 1.0, 0.12),
      new THREE.MeshToonMaterial({ color: 0x969aa8, gradientMap }),
    );
    fHandle.position.y = 0.1;
    paddleFallback.add(fFace, fHandle);
    paddle.add(paddleFallback);
    scene.add(paddle);

    // ---- Ball: rig (position/squash) > spin > mesh ----
    const BALL_R = BALL_D / 2;
    const FACE_OFFSET = BALL_R + 0.034; // ball center distance from face plane
    const ballRig = new THREE.Group();
    const ballSpin = new THREE.Group();
    const ballFallback = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 28, 28),
      new THREE.MeshToonMaterial({ color: 0xc6f24e, gradientMap }),
    );
    ballSpin.add(ballFallback);
    ballRig.add(ballSpin);
    scene.add(ballRig);

    // Neutralize killer PBR values so authored colors survive: bare metalness
    // with nothing to reflect reads black; linear-space albedo maps render
    // dark. Both get carried into the toon materials, so fix the source.
    const sanitizePBR = (root: THREE.Object3D) => {
      root.traverse((o) => {
        const raw = (o as THREE.Mesh).material as unknown;
        if (!raw) return;
        for (const mat of (Array.isArray(raw) ? raw : [raw]) as THREE.MeshStandardMaterial[]) {
          if (typeof mat.metalness !== "number") continue;
          if (mat.metalness > 0.5 && !mat.metalnessMap) mat.metalness = 0.25;
          if (mat.roughness < 0.25 && !mat.roughnessMap) mat.roughness = 0.4;
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        }
      });
    };

    const fitPaddle = (model: THREE.Object3D) => {
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      if (size.y > 0) model.scale.setScalar(PADDLE_H / size.y);
      const box = new THREE.Box3().setFromObject(model);
      const s = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -(box.min.y + PIVOT_FRAC * s.y), -c.z);
      toonify(model, OUTLINE_PADDLE);
      paddleFallback.visible = false;
      return model;
    };
    const fitBall = (model: THREE.Object3D) => {
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) model.scale.setScalar(BALL_D / maxDim);
      const c = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      model.position.sub(c);
      toonify(model, OUTLINE_BALL);
      ballFallback.visible = false;
      return model;
    };

    let alive = true;
    const loader = new GLTFLoader();
    loader.load(
      PADDLE_URL,
      (gltf) => {
        if (!alive) return;
        sanitizePBR(gltf.scene);
        paddle.add(fitPaddle(gltf.scene));
        if (reduced) draw(1.2);
      },
      undefined,
      () => {},
    );
    loader.load(
      BALL_URL,
      (gltf) => {
        if (!alive) return;
        sanitizePBR(gltf.scene);
        ballSpin.add(fitBall(gltf.scene));
        if (reduced) draw(1.2);
      },
      undefined,
      () => {},
    );

    // ================= Rally planner =================
    const UP = new THREE.Vector3(0, 1, 0);
    const HEAD_DIR = new THREE.Vector3(-0.87, 0, 0.5).normalize();
    const hits: Hit[] = [];
    let lastKind: Kind | null = null;

    const velocity = (a: Hit, b: Hit) =>
      new THREE.Vector3(
        (b.P.x - a.P.x) / a.T,
        (b.P.y - a.P.y) / a.T - 0.5 * G * a.T,
        (b.P.z - a.P.z) / a.T,
      );

    const newHit = (prev: Hit | null): Hit => {
      const kind = pickKind(lastKind);
      lastKind = kind;
      const [t0, t1] = KIND_CFG[kind].t;
      const T = rand(t0, t1);
      const P = new THREE.Vector3();
      const prevP = prev?.P ?? new THREE.Vector3(0, CONTACT_Y, 0);
      if (kind === "dink") {
        P.set(
          THREE.MathUtils.clamp(prevP.x + rand(-0.4, 0.4), -AREA.x, AREA.x),
          0,
          THREE.MathUtils.clamp(prevP.z + rand(-0.3, 0.3), -AREA.z, AREA.z),
        );
      } else if (kind === "lob") {
        P.set(rand(-0.35, 0.35), 0, rand(-0.25, 0.25));
      } else if (kind === "drive") {
        const side = prevP.x > 0 ? -1 : 1;
        P.set(side * rand(0.45, AREA.x), 0, rand(-AREA.z, AREA.z));
      } else {
        P.set(rand(-AREA.x, AREA.x), 0, rand(-AREA.z, AREA.z));
      }
      P.y = CONTACT_Y + rand(-0.12, 0.2);

      let psi = rand(-0.55, 0.55);
      if (Math.random() < 0.2) psi += Math.PI + rand(-0.3, 0.3);

      const h: Hit = {
        P,
        T,
        kind,
        psi,
        beta: rand(0.35, 1.0) * (kind === "lob" ? 1.15 : kind === "dink" ? 0.7 : 1),
        spin: new THREE.Vector3(rand(-1, 1), rand(-0.4, 0.4), rand(-1, 1))
          .normalize()
          .multiplyScalar(rand(3, 11)),
        vin: new THREE.Vector3(rand(-0.3, 0.3), -2.5, rand(-0.3, 0.3)),
      };
      if (prev) {
        const v = velocity(prev, h);
        h.vin = new THREE.Vector3(v.x, v.y + G * prev.T, v.z);
      }
      return h;
    };

    const computePose = (h: Hit, next: Hit) => {
      const vout = velocity(h, next);
      const n = h.vin
        .clone()
        .normalize()
        .negate()
        .add(vout.clone().normalize())
        .normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(n.y, -1, 1));
      if (ang > MAX_TILT) {
        const axis = new THREE.Vector3().crossVectors(n, UP).normalize();
        n.applyAxisAngle(axis, ang - MAX_TILT);
      }
      const hd = HEAD_DIR.clone().applyAxisAngle(UP, h.psi);
      const y = hd.clone().addScaledVector(n, -hd.dot(n)).normalize();
      const x = new THREE.Vector3().crossVectors(y, n).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(x, y, n),
      );
      const pos = h.P.clone().addScaledVector(n, -FACE_OFFSET).addScaledVector(y, -HEAD_Y);
      h.pose = { q, pos };
    };

    const ensure = () => {
      while (hits.length < 3) hits.push(newHit(hits[hits.length - 1] ?? null));
      for (let i = 0; i < 2; i++) if (!hits[i].pose) computePose(hits[i], hits[i + 1]);
    };
    ensure();

    // ================= Runtime state =================
    let tau = 0;
    let squash = 0;
    const spinVel = hits[0].spin.clone();
    const qTmp = new THREE.Quaternion();
    const qSwing = new THREE.Quaternion();
    const qInv = new THREE.Quaternion();
    const X_AXIS = new THREE.Vector3(1, 0, 0);
    const posTmp = new THREE.Vector3();
    const local = new THREE.Vector3();
    const nWorld = new THREE.Vector3();
    const headW = new THREE.Vector3();
    const spinQ = new THREE.Quaternion();

    const onHit = () => {
      hits.shift();
      ensure();
      squash = 1;
      spinVel.copy(hits[0].spin);
      if (--hitsUntilCam <= 0) {
        hitsUntilCam = 4 + Math.floor(Math.random() * 4);
        let idx = camPresetIdx;
        while (idx === camPresetIdx) idx = Math.floor(Math.random() * CAM_PRESETS.length);
        camPresetIdx = idx;
        camTarget = { ...CAM_PRESETS[idx] };
      }
    };

    const resize = () => {
      const W = container.clientWidth || 300;
      const H = container.clientHeight || 300;
      const mx = W * BLEED.x;
      const mt = H * BLEED.top;
      const mb = H * BLEED.bottom;
      const cw = W + mx * 2;
      const ch = H + mt + mb;
      canvas.style.left = `${-mx}px`;
      canvas.style.top = `${-mt}px`;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      renderer.setSize(cw, ch, false);
      camera.aspect = W / H;
      camera.setViewOffset(W, H, -mx, -mt, cw, ch);
      camera.updateProjectionMatrix();
      if (reduced) draw(1.2);
    };

    let raf = 0;
    let last = performance.now();
    let visible = true;

    const draw = (t: number, dt = 0) => {
      const cur = hits[0];
      const nxt = hits[1];
      const s = Math.min(tau / cur.T, 1);

      // Ball: exact arc P_k -> P_{k+1}
      const v = velocity(cur, nxt);
      ballRig.position.set(
        cur.P.x + v.x * tau,
        cur.P.y + v.y * tau + 0.5 * G * tau * tau,
        cur.P.z + v.z * tau,
      );
      spinQ.setFromAxisAngle(spinVel.clone().normalize(), spinVel.length() * dt);
      ballSpin.quaternion.premultiply(spinQ);
      ballRig.scale.set(1 + squash * SQUASH, 1 - squash * SQUASH * 1.2, 1 + squash * SQUASH);

      // Paddle
      qTmp.copy(cur.pose!.q).slerp(nxt.pose!.q, smooth(s));
      const theta = -cur.beta * Math.sin(Math.PI * s) * (1 - 0.35 * s);
      qSwing.setFromAxisAngle(X_AXIS, theta);
      paddle.quaternion.copy(qTmp).multiply(qSwing);
      posTmp.copy(cur.pose!.pos).lerp(nxt.pose!.pos, smooth(s));
      posTmp.y -= Math.sin(Math.PI * s) * 0.08;
      paddle.position.copy(posTmp);

      // Overlap guard
      qInv.copy(paddle.quaternion).invert();
      local.copy(ballRig.position).sub(paddle.position).applyQuaternion(qInv);
      if (
        Math.abs(local.x) < 0.5 + BALL_R * 0.6 &&
        Math.abs(local.y - HEAD_Y) < 0.78 &&
        local.z < FACE_OFFSET &&
        local.z > -0.25
      ) {
        nWorld.set(0, 0, 1).applyQuaternion(paddle.quaternion);
        paddle.position.addScaledVector(nWorld, -(FACE_OFFSET - local.z));
      }

      // Drop shadows
      const bh = Math.max(ballRig.position.y, 0);
      const bs = (BALL_D * 1.6) / (1 + bh * 0.22);
      ballShadow.position.set(
        ballRig.position.x + SHADOW_OFFSET.x * (1 + bh * 0.25),
        0.01,
        ballRig.position.z + SHADOW_OFFSET.z * (1 + bh * 0.25),
      );
      ballShadow.scale.set(bs, bs, 1);
      (ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.34 - bh * 0.06);

      headW.set(0, HEAD_Y, 0).applyQuaternion(paddle.quaternion).add(paddle.position);
      const ph = Math.max(headW.y, 0);
      const ps = 1.7 / (1 + ph * 0.12);
      paddleShadow.position.set(headW.x + SHADOW_OFFSET.x * 1.2, 0.01, headW.z + SHADOW_OFFSET.z * 1.2);
      paddleShadow.scale.set(ps, ps * 0.7, 1);
      (paddleShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.3 - ph * 0.05);

      // Camera
      const k = 1 - Math.exp(-dt * 0.9);
      cam.az += (camTarget.az - cam.az) * k;
      cam.el += (camTarget.el - cam.el) * k;
      cam.dist += (camTarget.dist - cam.dist) * k;
      cam.roll += (camTarget.roll - cam.roll) * k;
      placeCamera(t);
      renderer.render(scene, camera);
    };

    const loop = () => {
      if (!visible) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      tau += dt;
      squash = Math.max(0, squash - dt * 7);
      while (tau >= hits[0].T) {
        tau -= hits[0].T;
        onHit();
      }
      draw(now / 1000, dt);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onVis = () => {
      visible = !document.hidden;
      last = performance.now();
      if (visible && !reduced) loop();
    };
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && !document.hidden;
      last = performance.now();
      if (visible && !was && !reduced) loop();
    });
    io.observe(container);

    if (reduced) {
      tau = hits[0].T * 0.88;
      draw(1.2);
    } else {
      loop();
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      shadowTex.dispose();
      gradientMap.dispose();
      envRT.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = (m.material ?? null) as THREE.Material | null;
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
      });
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        aria-hidden
        role="presentation"
      />
    </div>
  );
}