const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.join(__dirname, "..");
const counts = {
  apple: [637389, 3824298],
  cube: [9994, 60000],
  milk: [237639, 1425828],
};
for (const [name, expected] of Object.entries(counts)) {
  test(`${name}: the shipped loader decodes the compressed GLB with original mesh counts`, async () => {
    const { GLTFLoader, MeshoptDecoder, Box3 } = await import(
      pathToFileURL(path.join(root, "assets/vendor/hoi-three.js"))
    );
    const data = await fs.readFile(
      path.join(root, `assets/hoi/${name}/scene.glb`),
    );
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        "",
      );
    const meshes = [];
    gltf.scene.traverse((node) => {
      if (node.isMesh) meshes.push(node);
    });
    assert.equal(meshes.length, 2);
    const object = meshes.find((mesh) => mesh.name.endsWith("_object"));
    const hand = meshes.find((mesh) => mesh.name.endsWith("_hand"));
    assert.equal(object.geometry.attributes.position.count, expected[0]);
    assert.equal(object.geometry.index.count, expected[1]);
    assert.equal(hand.geometry.attributes.position.count, 778);
    assert.equal(hand.geometry.index.count, 4656);
    assert.equal(new Box3().setFromObject(gltf.scene).isEmpty(), false);
    for (const mesh of meshes) {
      assert.equal(
        mesh.geometry.attributes.color.count,
        mesh.geometry.attributes.position.count,
      );
      mesh.geometry.computeVertexNormals();
      assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  });
}
