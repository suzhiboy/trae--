import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function HeroScene() {
  const host = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.2, 8);
    const group = new THREE.Group();
    scene.add(group);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.65, 1),
      new THREE.MeshBasicMaterial({ color: 0xfafafa, wireframe: true, transparent: true, opacity: 0.1 }),
    );
    shell.rotation.set(0.3, 0.2, -0.15);
    group.add(shell);

    // 移动端节点数减半；视差插值固定为 0.05。
    const count = mobile ? 10 : 20;
    const positions = Array.from({ length: count }, (_, index) =>
      new THREE.Vector3().setFromSphericalCoords(2.45, Math.acos(2 * ((index + 0.5) / count) - 1), index * 2.399963),
    );
    const nodeGeometry = new THREE.IcosahedronGeometry(0.055, 0);
    const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xd1d1d1 });
    const redMaterial = new THREE.MeshBasicMaterial({ color: 0xea384c });
    positions.forEach((position, index) => {
      const node = new THREE.Mesh(nodeGeometry, index % 7 === 0 ? redMaterial : whiteMaterial);
      node.position.copy(position);
      group.add(node);
    });

    const linePoints: THREE.Vector3[] = [];
    positions.forEach((position, index) => {
      linePoints.push(position, positions[(index + 3) % count]);
      if (index % 2 === 0) linePoints.push(position, positions[(index + 7) % count]);
    });
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(linePoints),
      new THREE.LineBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.28 }),
    );
    group.add(lines);

    const controls = !mobile && !reducedMotion ? new OrbitControls(camera, renderer.domElement) : null;
    if (controls) {
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
    }

    const timer = new THREE.Timer();
    timer.connect(document);
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reducedMotion) window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    let resizeFrame = 0;
    const onResize = () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
    };
    resize();
    window.addEventListener('resize', onResize, { passive: true });

    const animate = () => {
      timer.update();
      group.rotation.y += (0.35 + pointer.x * 0.22 - group.rotation.y) * 0.05;
      group.rotation.x += (-0.12 + pointer.y * 0.12 - group.rotation.x) * 0.05;
      controls?.update(timer.getDelta());
      renderer.render(scene, camera);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (reducedMotion) {
        renderer.render(scene, camera);
      } else {
        renderer.setAnimationLoop(entry.isIntersecting ? animate : null);
      }
    }, { threshold: 0.02 });
    observer.observe(container);

    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      controls?.dispose();
      timer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [reducedMotion]);

  return <div className="hero-scene" ref={host} aria-hidden="true" />;
}
