import * as THREE from 'three';

// Apply the footer turn after each service's own pose. Restore before the next
// update so services that do not rewrite their root rotation cannot accumulate it.
export function createOverviewFacing() {
  const poses = new WeakMap();
  const center = new THREE.Vector3(), offset = new THREE.Vector3();
  const yaw = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  function restore(root) {
    const pose = poses.get(root);
    if (!pose?.applied) return;
    root.position.copy(pose.position);
    root.quaternion.copy(pose.rotation);
    pose.applied = false;
    root.updateMatrixWorld(true);
  }
  function apply(root, localCenter, referenceCamera, overviewCamera, amount) {
    restore(root);
    if (amount <= 0) return;
    let pose = poses.get(root);
    if (!pose) {
      pose = { position: new THREE.Vector3(), rotation: new THREE.Quaternion(), applied: false };
      poses.set(root, pose);
    }
    pose.position.copy(root.position); pose.rotation.copy(root.quaternion);
    offset.fromArray(localCenter).multiply(root.scale).applyQuaternion(root.quaternion);
    center.copy(root.position).add(offset);
    const from = Math.atan2(referenceCamera.x - center.x, referenceCamera.z - center.z);
    const to = Math.atan2(overviewCamera.x - center.x, overviewCamera.z - center.z);
    const angle = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    yaw.setFromAxisAngle(up, angle * Math.min(1, amount));
    root.quaternion.premultiply(yaw);
    offset.fromArray(localCenter).multiply(root.scale).applyQuaternion(root.quaternion);
    root.position.copy(center).sub(offset);
    pose.applied = true;
    root.updateMatrixWorld(true);
  }
  return { restore, apply };
}
