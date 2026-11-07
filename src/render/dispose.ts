import * as THREE from 'three';

/**
 * Frees everything under `root` on the GPU: geometries, materials and instance buffers.
 * Anything with a geometry counts (meshes, lines, points), and materials shared between
 * objects are fine to free twice. Objects not attached to `root` are not reached, so an
 * owner frees what it keeps detached (a debug overlay turned off) itself.
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const item = o as Partial<THREE.Mesh>;
    item.geometry?.dispose();
    const m = item.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) for (const x of m) x.dispose();
    else m?.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
}
