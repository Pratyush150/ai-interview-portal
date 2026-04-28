/* =========================================================================
   3D Interviewer Avatar — Three.js + local Ready-Player-Me-style GLB
   The GLB is served from the same origin (/static/avatar.glb), so no
   external DNS is needed. Morph-target lip sync is driven by the same
   amplitude signal (window.avatar.setAmp, 0..1) that our audio pipeline
   already feeds. Idle state has natural blinks, breathing, gaze shifts.
   ========================================================================= */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const AVATAR_URL = "/static/avatar.glb";

const state = {
    ready: false,
    loading: false,
    failed: false,
    container: null,
    renderer: null,
    scene: null,
    camera: null,
    avatar: null,
    heads: [],
    morphDicts: [],
    rafId: null,
    clock: new THREE.Clock(),
    targetAmp: 0,
    currentAmp: 0,
    nextBlinkAt: 0,
    blinkPhase: 0,
    visemeIndex: 0,
    visemeHoldUntil: 0,
    headTargetYaw: 0,
    headTargetPitch: 0,
    headYaw: 0,
    headPitch: 0,
    lastGazeShift: 0,
};

async function init(container) {
    if (state.ready || state.loading) return;
    state.loading = true;
    state.container = container;
    console.log('[avatar] init start');
    try {
        setupScene();
        await loadAvatar();
        state.ready = true;
        state.loading = false;
        state.container.classList.add('avatar-loaded');
        console.log('[avatar] ready ✓');
        animate();
    } catch (err) {
        console.error('[avatar] failed to load, keeping fallback', err);
        state.failed = true;
        state.loading = false;
        if (state.container) state.container.classList.add('avatar-failed');
    }
}

function setAmp(amp) { state.targetAmp = Math.max(0, Math.min(1, amp)); }

function teardown() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    if (state.renderer) {
        state.renderer.dispose();
        if (state.renderer.domElement.parentNode) {
            state.renderer.domElement.parentNode.removeChild(state.renderer.domElement);
        }
    }
    if (state.scene) {
        state.scene.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m) => {
                    Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
                    m.dispose();
                });
            }
        });
    }
    Object.assign(state, {
        ready: false, loading: false, renderer: null, scene: null,
        camera: null, avatar: null, heads: [], morphDicts: [],
    });
}

function setupScene() {
    const c = state.container;
    const w = c.clientWidth, h = c.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    c.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();

    // Warm studio lighting — golden-hour key, cream fill, amber rim.
    // Deliberately NOT cold purple/blue, which made the earlier avatar feel
    // clinical and unsettling. Warm tones read as "in a room, with people".
    const ambient = new THREE.AmbientLight(0xfff5e5, 0.45);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffe4b8, 1.55);     // warm amber
    key.position.set(1.2, 2.2, 2.2);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xfff0dd, 0.7);     // soft cream
    fill.position.set(-2, 1.2, 1.8);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffb98a, 0.85);     // warm back-rim
    rim.position.set(-0.5, 2.5, -2.5);
    scene.add(rim);

    // Subtle hemisphere for overall warmth from environment
    const hemi = new THREE.HemisphereLight(0xfff1de, 0.35);
    scene.add(hemi);

    // Camera — framed on head + chest, slight upward angle for presence
    const camera = new THREE.PerspectiveCamera(24, w / h, 0.01, 20);
    camera.position.set(0, 1.62, 0.85);
    camera.lookAt(0, 1.58, 0);

    state.renderer = renderer;
    state.scene = scene;
    state.camera = camera;

    window.addEventListener('resize', onResize);
}

function onResize() {
    if (!state.container || !state.renderer || !state.camera) return;
    const w = state.container.clientWidth, h = state.container.clientHeight;
    state.renderer.setSize(w, h);
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
}

async function loadAvatar() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(AVATAR_URL);
    const root = gltf.scene;
    state.scene.add(root);
    state.avatar = root;

    let morphCount = 0;
    root.traverse((obj) => {
        if ((obj.isSkinnedMesh || obj.isMesh) && obj.morphTargetDictionary && obj.morphTargetInfluences) {
            state.heads.push(obj);
            state.morphDicts.push(obj.morphTargetDictionary);
            obj.frustumCulled = false;
            morphCount += Object.keys(obj.morphTargetDictionary).length;
        }
    });
    console.log(`[avatar] ${state.heads.length} meshes, ${morphCount} morph targets`);

    // Auto-frame: RPM avatars are ~1.7m tall, head around y=1.6. Measure
    // and position camera so head+shoulders are centered in the tile.
    const box = new THREE.Box3().setFromObject(root);
    const headY = box.max.y - (box.max.y - box.min.y) * 0.08;   // ~ eye level
    state.camera.position.set(0, headY - 0.02, 0.72);
    state.camera.lookAt(0, headY - 0.08, 0);

    // Baseline relaxed smile — reads as warm, not neutral
    setMorph('mouthSmileLeft', 0.16);
    setMorph('mouthSmileRight', 0.16);

    state.nextBlinkAt = performance.now() + 1800 + Math.random() * 2500;
}

function animate() {
    const t = state.clock.elapsedTime;
    const now = performance.now();

    state.currentAmp += (state.targetAmp - state.currentAmp) * 0.28;

    driveMouth(state.currentAmp, now, t);
    driveBlink(now);
    driveHead(t, now);

    state.renderer.render(state.scene, state.camera);
    state.rafId = requestAnimationFrame(animate);
}

// ARKit blendshapes used for speech — each a different mouth shape.
// Cycling across them while speaking reads as real articulation.
const VISEMES = ['jawOpen', 'mouthFunnel', 'mouthPucker',
                 'mouthStretchLeft', 'mouthStretchRight',
                 'mouthClose', 'mouthRollLower'];

function setMorph(name, value) {
    for (let i = 0; i < state.heads.length; i++) {
        const idx = state.morphDicts[i][name];
        if (idx !== undefined) state.heads[i].morphTargetInfluences[idx] = value;
    }
}

function driveMouth(amp, now, t) {
    const jaw = Math.max(0, Math.min(0.55, amp * 0.6));
    setMorph('jawOpen', jaw);
    setMorph('mouthShrugUpper', amp * 0.1);

    if (amp > 0.15) {
        if (now > state.visemeHoldUntil) {
            VISEMES.forEach((v) => setMorph(v, 0));
            state.visemeIndex = (state.visemeIndex + 1) % VISEMES.length;
            state.visemeHoldUntil = now + 95 + Math.random() * 110;
        }
        setMorph(VISEMES[state.visemeIndex], Math.min(1, amp * 0.85));
        // Dampen the baseline smile while actively articulating
        setMorph('mouthSmileLeft', Math.max(0.04, 0.16 - amp * 0.15));
        setMorph('mouthSmileRight', Math.max(0.04, 0.16 - amp * 0.15));
    } else {
        VISEMES.forEach((vs) => setMorph(vs, 0));
        // Restore baseline warm smile when idle
        setMorph('mouthSmileLeft', 0.16);
        setMorph('mouthSmileRight', 0.16);
    }

    // Very subtle brow drift for aliveness
    setMorph('browInnerUp', 0.05 + 0.025 * Math.sin(t * 0.7));
}

function driveBlink(now) {
    if (state.blinkPhase === 0 && now > state.nextBlinkAt) {
        state.blinkPhase = now;
    }
    if (state.blinkPhase > 0) {
        const elapsed = now - state.blinkPhase;
        const DUR = 140;
        let v = 0;
        if (elapsed < DUR / 2) v = elapsed / (DUR / 2);
        else if (elapsed < DUR) v = 1 - (elapsed - DUR / 2) / (DUR / 2);
        else {
            v = 0;
            state.blinkPhase = 0;
            state.nextBlinkAt = now + 2600 + Math.random() * 3400;
        }
        setMorph('eyeBlinkLeft', v);
        setMorph('eyeBlinkRight', v);
    }
}

function driveHead(t, now) {
    const swayY = Math.sin(t * 0.42) * 0.028 + Math.sin(t * 0.91) * 0.013;
    const swayX = Math.sin(t * 0.33) * 0.010;

    if (now - state.lastGazeShift > 4500 + Math.random() * 4000) {
        state.headTargetYaw = (Math.random() - 0.5) * 0.08;
        state.headTargetPitch = (Math.random() - 0.5) * 0.04;
        state.lastGazeShift = now;
    }
    state.headYaw += (state.headTargetYaw - state.headYaw) * 0.04;
    state.headPitch += (state.headTargetPitch - state.headPitch) * 0.04;

    if (state.avatar) {
        state.avatar.rotation.y = swayY + state.headYaw;
        state.avatar.rotation.x = swayX + state.headPitch;
    }
}

window.avatar = { init, setAmp, teardown,
    isReady: () => state.ready,
    hasFailed: () => state.failed,
};
