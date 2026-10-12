const TARGETS = ['head', 'cheek', 'shoulder', 'hand'];

/** Classifies pointer ray hits on a VRM, preferring anatomical names when present. */
export class AvatarHitboxManager {
  constructor(THREE, { canvas, camera, getRoot, getHeight, getHumanoid, onHit } = {}) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.camera = camera;
    this.getRoot = getRoot || (() => null);
    this.getHeight = getHeight || (() => 1.7);
    this.getHumanoid = getHumanoid || (() => null);
    this.onHit = onHit || (() => {});
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.disposed = false;
  }

  bonePoint(name) {
    const node = this.getHumanoid()?.getNormalizedBoneNode?.(name);
    return node ? node.getWorldPosition(new this.THREE.Vector3()) : null;
  }

  classify(hit, root) {
    const height = Math.max(0.5, Number(this.getHeight()) || 1.7);
    let named = '';
    for (let node = hit.object; node && node !== root; node = node.parent) {
      const label = `${node.name || ''} ${node.parent?.name || ''}`.toLowerCase();
      if (/cheek/.test(label)) { named = 'cheek'; break; }
      if (/head|face/.test(label)) { named = 'head'; break; }
      if (/shoulder|clavicle/.test(label)) { named = 'shoulder'; break; }
      if (/hand|wrist/.test(label)) { named = 'hand'; break; }
    }
    if (named) return named;

    const point = hit.point;
    const head = this.bonePoint('head');
    if (head && point.distanceTo(head) < height * 0.12) {
      const dx = Math.abs(point.x - head.x);
      return dx > height * 0.025 ? 'cheek' : 'head';
    }
    const shoulderL = this.bonePoint('leftShoulder') || this.bonePoint('leftUpperArm');
    const shoulderR = this.bonePoint('rightShoulder') || this.bonePoint('rightUpperArm');
    if ([shoulderL, shoulderR].some((bone) => bone && point.distanceTo(bone) < height * 0.14)) return 'shoulder';
    const handL = this.bonePoint('leftHand');
    const handR = this.bonePoint('rightHand');
    if ([handL, handR].some((bone) => bone && point.distanceTo(bone) < height * 0.14)) return 'hand';

    const rootPosition = root.getWorldPosition(new this.THREE.Vector3());
    const normalizedY = (point.y - rootPosition.y) / height;
    if (normalizedY > 0.79) return Math.abs(point.x - rootPosition.x) > height * 0.045 ? 'cheek' : 'head';
    if (normalizedY > 0.48) return 'shoulder';
    return 'hand';
  }

  hit(clientX, clientY) {
    if (this.disposed || !this.canvas || !this.camera) return null;
    const root = this.getRoot();
    if (!root) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(root, true).find((entry) => !entry.object.userData?.vesperOutline);
    if (!hit) return null;
    const target = this.classify(hit, root);
    const detail = { target: TARGETS.includes(target) ? target : 'head', point: hit.point.clone(), object: hit.object };
    this.onHit(detail);
    return detail;
  }

  dispose() { this.disposed = true; }
}
