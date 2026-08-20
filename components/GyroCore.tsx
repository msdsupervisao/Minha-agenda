'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AssistantState } from '@/lib/assistant/types';

const POLISHED_METAL_MATCAP = 'https://framerusercontent.com/images/Wkm2ineJ1Md7Xb1oyjF6dqbAw.png';
const PERSPECTIVE = 0.15;
const PX_PER_UNIT = 100;
const AXES: Array<'x' | 'y' | 'z'> = ['y', 'x', 'z'];
const RING_ORIENTATION: Record<'x' | 'y' | 'z', [number, number, number]> = {
  y: [0, 0, 0],
  x: [Math.PI / 2, 0, 0],
  z: [0, Math.PI / 2, 0],
};

const CORE_BLUE = new THREE.Color('#14b4ef');
const WHITE = new THREE.Color('#ffffff');
const CORE_BLUE_GLOW = new THREE.Color('#0a7cb6');
const CORE_WHITE_GLOW = new THREE.Color('#cfd8dc');

const DEFAULTS = {
  rings: 6,
  finish: 'metal' as const,
  tint: '#D8D8D8',
  color: '#FF9F1C',
  thickness: 5,
  innerRadius: 40,
  gap: 0,
  spin: 2,
  hoverBoost: 10,
  dragSensitivity: 3,
  sizePercent: 104,
};

type Config = {
  rings: number;
  finish: 'metal' | 'solid';
  tint: string;
  color: string;
  thickness: number;
  innerRadius: number;
  gap: number;
  spin: number;
  hoverBoost: number;
  dragSensitivity: number;
  sizePercent: number;
};

type Props = Partial<Config> & {
  state: AssistantState;
  onPress: () => void;
  style?: CSSProperties;
};

type Ring = { pivot: THREE.Group; mesh: THREE.Mesh; axis: 'x' | 'y' | 'z'; rate: number };

function clamp(value: number, min: number, max: number, fallback: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

function ringRadii(config: Config) {
  const count = clamp(config.rings, 1, 6, DEFAULTS.rings);
  const inner = clamp(config.innerRadius, 20, 200, DEFAULTS.innerRadius) / PX_PER_UNIT;
  const gap = clamp(config.gap, 0, 50, DEFAULTS.gap) / PX_PER_UNIT;
  const tube = (clamp(config.thickness, 1, 20, DEFAULTS.thickness) / 100) * 0.6;
  return Array.from({ length: count }, (_, index) => inner + (count - 1 - index) * (gap + tube * 2));
}

function framingRadius(config: Config) {
  const count = clamp(config.rings, 1, 6, DEFAULTS.rings);
  const inner = clamp(config.innerRadius, 20, 200, DEFAULTS.innerRadius) / PX_PER_UNIT;
  const tube = (clamp(config.thickness, 1, 20, DEFAULTS.thickness) / 100) * 0.6;
  return inner + (count - 1) * tube * 2 + tube;
}

let cachedMatcap: THREE.Texture | null = null;
let pendingMatcap: Promise<THREE.Texture | null> | null = null;

function loadMatcap() {
  if (cachedMatcap) return Promise.resolve(cachedMatcap);
  if (pendingMatcap) return pendingMatcap;
  pendingMatcap = new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(POLISHED_METAL_MATCAP, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      cachedMatcap = texture;
      resolve(texture);
    }, undefined, () => resolve(null));
  });
  return pendingMatcap;
}

class GyroScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
  private root = new THREE.Group();
  private ringList: Ring[] = [];
  private matcapMaterial: THREE.MeshMatcapMaterial;
  private solidMaterial: THREE.MeshLambertMaterial;
  private ambient = new THREE.AmbientLight(0xffffff, 0.65);
  private key = new THREE.DirectionalLight(0xffffff, 0.9);
  private core!: THREE.Mesh;
  private coreMaterial!: THREE.MeshStandardMaterial;
  private config: Config;
  private state: AssistantState;
  private width = 0;
  private height = 0;
  private ax = 0.5;
  private ay = 0.4;
  private vx = 0;
  private vy = 0;
  private dragging = false;
  private hovered = false;
  private lastX = 0;
  private lastY = 0;
  private boost = 0;
  private frame = 0;
  private lastTime = 0;
  private disposed = false;
  private unbind = () => {};

  constructor(private container: HTMLElement, config: Config, state: AssistantState) {
    this.config = config;
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none';
    container.appendChild(this.renderer.domElement);

    this.matcapMaterial = new THREE.MeshMatcapMaterial({ color: new THREE.Color(config.tint) });
    this.solidMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(config.color) });
    this.key.position.set(0.4, 0.7, 1);
    this.camera.add(this.key);
    this.scene.add(this.ambient, this.camera, this.root);
    this.coreMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14b4ef'), emissive: new THREE.Color('#0a7cb6'), emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.1 });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 48), this.coreMaterial);
    this.scene.add(this.core);
    this.build();
    this.bindEvents();
    if (config.finish === 'metal') void this.ensureMatcap();
  }

  private async ensureMatcap() {
    if (this.matcapMaterial.matcap) return;
    const texture = await loadMatcap();
    if (!this.disposed && texture) {
      this.matcapMaterial.matcap = texture;
      this.matcapMaterial.needsUpdate = true;
    }
  }

  private material() {
    return this.config.finish === 'metal' ? this.matcapMaterial : this.solidMaterial;
  }

  private build() {
    this.clear();
    const tube = (clamp(this.config.thickness, 1, 20, DEFAULTS.thickness) / 100) * 0.6;
    let parent: THREE.Object3D = this.root;
    ringRadii(this.config).forEach((radius, index) => {
      const axis = AXES[index % AXES.length];
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 14, 96), this.material());
      mesh.rotation.set(...RING_ORIENTATION[axis]);
      const pivot = new THREE.Group();
      pivot.add(mesh);
      parent.add(pivot);
      parent = pivot;
      this.ringList.push({ pivot, mesh, axis, rate: (index + 1) * (index % 2 ? -1 : 1) });
    });
  }

  private clear() {
    this.ringList.forEach(({ mesh, pivot }) => {
      mesh.geometry.dispose();
      pivot.removeFromParent();
    });
    this.ringList = [];
    this.root.clear();
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;
    const down = (event: PointerEvent) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.vx = 0;
      this.vy = 0;
      canvas.style.cursor = 'grabbing';
    };
    const move = (event: PointerEvent) => {
      if (!this.dragging) return;
      const sensitivity = clamp(this.config.dragSensitivity, 0, 10, DEFAULTS.dragSensitivity) * 0.007;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.ay += dx * sensitivity;
      this.ax += dy * sensitivity;
      this.vy = dx * sensitivity;
      this.vx = dy * sensitivity;
    };
    const up = () => { this.dragging = false; canvas.style.cursor = 'grab'; };
    const enter = () => { this.hovered = true; };
    const leave = () => { this.hovered = false; up(); };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerenter', enter);
    canvas.addEventListener('pointerleave', leave);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.unbind = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerenter', enter);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  setSize(width: number, height: number) {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.updateCamera();
  }

  setState(state: AssistantState) { this.state = state; }

  updateConfig(config: Config) {
    const previous = this.config;
    this.config = config;
    this.matcapMaterial.color.set(config.tint);
    this.solidMaterial.color.set(config.color);
    if (config.finish === 'metal') void this.ensureMatcap();
    if (config.rings !== previous.rings || config.thickness !== previous.thickness || config.innerRadius !== previous.innerRadius || config.gap !== previous.gap) {
      this.build();
    } else if (config.finish !== previous.finish) {
      this.ringList.forEach(({ mesh }) => { mesh.material = this.material(); });
    }
    this.updateCamera();
  }

  private updateCamera() {
    const aspect = Math.max(1, this.width) / Math.max(1, this.height);
    const distance = 1 / PERSPECTIVE;
    const sizePercent = clamp(this.config.sizePercent, 20, 200, DEFAULTS.sizePercent);
    const span = framingRadius(this.config) * 2.9 * (100 / sizePercent);
    const visibleHeight = aspect < 1 ? span / aspect : span;
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0, distance);
    this.camera.lookAt(0, 0, 0);
    this.camera.fov = 2 * Math.atan(visibleHeight / 2 / distance) * (180 / Math.PI);
    this.camera.near = Math.max(0.1, distance - 20);
    this.camera.far = distance + 20;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.lastTime = performance.now();
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      const now = performance.now();
      let delta = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.05);
      this.lastTime = now;
      if (!Number.isFinite(delta)) delta = 0;
      if (!this.dragging) {
        const decay = Math.exp(-delta * 2.6);
        this.ay += this.vy;
        this.ax += this.vx;
        this.vx *= decay;
        this.vy *= decay;
      }
      this.root.rotation.x = this.ax;
      this.root.rotation.y = this.ay;
      const hoverTarget = this.hovered ? clamp(this.config.hoverBoost, 0, 10, DEFAULTS.hoverBoost) / 5 : 0;
      this.boost += (hoverTarget - this.boost) * (1 - Math.exp(-delta * 4));
      const stateMultiplier = this.state === 'listening' ? 2.5 : this.state === 'processing' ? 0.45 : this.state === 'action' ? 1.8 : this.state === 'success' ? 3.4 : 1;
      const base = clamp(this.config.spin, 1, 20, DEFAULTS.spin) * 0.09 * (1 + this.boost) * stateMultiplier;
      this.ringList.forEach((ring) => { ring.pivot.rotation[ring.axis] += base * ring.rate * delta; });
      const bright = this.state === 'processing' || this.state === 'success';
      this.coreMaterial.color.lerp(bright ? WHITE : CORE_BLUE, 1 - Math.exp(-delta * 6));
      this.coreMaterial.emissive.lerp(bright ? CORE_WHITE_GLOW : CORE_BLUE_GLOW, 1 - Math.exp(-delta * 6));
      const pulse = this.state === 'listening' ? 1 + 0.09 * Math.sin(now * 0.008) : this.state === 'success' ? 1.14 : 1;
      const scale = this.core.scale.x + (pulse - this.core.scale.x) * (1 - Math.exp(-delta * 6));
      this.core.scale.setScalar(scale);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.unbind();
    this.clear();
    this.core.geometry.dispose();
    this.coreMaterial.dispose();
    this.matcapMaterial.dispose();
    this.solidMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export default function GyroCore({
  state,
  onPress,
  style,
  rings = DEFAULTS.rings,
  finish = DEFAULTS.finish,
  tint = DEFAULTS.tint,
  color = DEFAULTS.color,
  thickness = DEFAULTS.thickness,
  innerRadius = DEFAULTS.innerRadius,
  gap = DEFAULTS.gap,
  spin = DEFAULTS.spin,
  hoverBoost = DEFAULTS.hoverBoost,
  dragSensitivity = DEFAULTS.dragSensitivity,
  sizePercent = DEFAULTS.sizePercent,
}: Props) {
  const container = useRef<HTMLButtonElement>(null);
  const scene = useRef<GyroScene | null>(null);
  const config: Config = { rings, finish, tint, color, thickness, innerRadius, gap, spin, hoverBoost, dragSensitivity, sizePercent };
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!container.current) return;
    const instance = new GyroScene(container.current, configRef.current, state);
    scene.current = instance;
    instance.setSize(container.current.clientWidth, container.current.clientHeight);
    instance.start();
    const observer = new ResizeObserver(() => {
      if (container.current) instance.setSize(container.current.clientWidth, container.current.clientHeight);
    });
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { scene.current?.setState(state); }, [state]);
  useEffect(() => { scene.current?.updateConfig(configRef.current); }, [rings, finish, tint, color, thickness, innerRadius, gap, spin, hoverBoost, dragSensitivity, sizePercent]);

  return <button ref={container} type="button" onClick={onPress} aria-label="Iniciar comando por voz" style={{ position: 'relative', width: '100%', height: '100%', minWidth: 180, minHeight: 250, overflow: 'hidden', border: 0, padding: 0, background: 'transparent', cursor: 'pointer', touchAction: 'manipulation', ...style }} />;
}
