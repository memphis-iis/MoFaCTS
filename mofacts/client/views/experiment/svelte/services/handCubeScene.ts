import * as THREE from 'three';
import type { HandRotationResult } from '../../../../../../learning-components/units/skeleton-demo/handRotation';

// This module is imported only by the mounted demo overlay. Render on accepted
// observations/resize/theme changes; there is no independent spin or inertia.
export function createHandCubeScene(host: HTMLElement, labels: readonly HTMLElement[], onError: () => void) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(4, 3, 8);
  camera.lookAt(0, 0, 0);
  const coordinateFrame = new THREE.Group();
  scene.add(coordinateFrame);
  const cube = new THREE.Group();
  cube.position.set(2.25, 1.75, 0);
  // Fit the whole swept volume, including the cube corners, at every orientation.
  const radius = cube.position.length() + Math.sqrt(3) * 0.95 / 2;
  camera.position.setLength(radius * 1.12 / Math.sin(18 * Math.PI / 180));
  const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0 });
  const edges = new THREE.EdgesGeometry(geometry);
  const outline = new THREE.LineBasicMaterial();
  cube.add(new THREE.Mesh(geometry, material), new THREE.LineSegments(edges, outline));
  const axes = new THREE.AxesHelper(1.25);
  coordinateFrame.add(cube, axes);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(2, 4, 6); scene.add(light);
  const endpoints = [new THREE.Vector3(1.4, 0, 0), new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 0, 1.4)];
  let disposed = false;
  let failed = false;
  function render(): void {
    if (disposed || failed || !host.clientWidth || !host.clientHeight) return;
    try {
      renderer.render(scene, camera);
      endpoints.forEach((point, i) => {
        const projected = coordinateFrame.localToWorld(point.clone()).project(camera);
        const label = labels[i]!;
        label.style.left = `${(projected.x + 1) * 50}%`;
        label.style.top = `${(1 - projected.y) * 50}%`;
      });
    } catch { fail(); }
  }
  function fail(): void {
    if (disposed || failed) return;
    failed = true; onError();
  }
  function resize(): void {
    if (disposed || failed || !host.clientWidth || !host.clientHeight) return;
    const aspect = host.clientWidth / host.clientHeight;
    camera.aspect = aspect;
    // Keep the same complete scene visible in portrait and landscape previews.
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(18 * Math.PI / 180) / Math.min(aspect, 1)));
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    render();
  }
  function theme(): void {
    if (disposed) return;
    const styles = getComputedStyle(host);
    material.color.set(styles.getPropertyValue('--app-accent-color').trim());
    outline.color.set(styles.color);
    axes.setColors(styles.color, styles.color, styles.color);
    render();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const themeObserver = new MutationObserver(theme);
  // Theme classes and variables can live on any app-shell ancestor.
  for (let element: HTMLElement | null = host.parentElement; element; element = element.parentElement) {
    themeObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  renderer.domElement.addEventListener('webglcontextlost', fail);
  theme(); resize();
  return {
    rotate(rotation: HandRotationResult['rotation']): void {
      if (!rotation || disposed || failed) return;
      // Gesture axes are in camera coordinates, independent of the fixed view angle.
      const axis = new THREE.Vector3(...rotation.axis).applyQuaternion(camera.quaternion);
      coordinateFrame.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, rotation.angle)).normalize();
      render();
    },
    dispose(): void {
      disposed = true;
      resizeObserver.disconnect(); themeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', fail);
      geometry.dispose(); edges.dispose(); material.dispose(); outline.dispose(); axes.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
