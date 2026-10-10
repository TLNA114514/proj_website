// Usage: node scripts/prepare-hoi-meshes.mjs /path/to/good-meshes /path/to/meshoptimizer/package
// Lossless compression: preserve vertex bytes, triangle order and winding exactly.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const [source, tools] = process.argv.slice(2);
if (!source || !tools)
  throw new Error(
    "Expected source directory and meshoptimizer package directory",
  );
const { MeshoptEncoder } = await import(
  pathToFileURL(path.resolve(tools, "meshopt_encoder.js"))
);
const { MeshoptDecoder } = await import(
  pathToFileURL(path.resolve(tools, "meshopt_decoder.mjs"))
);
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const root = new URL("../assets/hoi/", import.meta.url);
for (const name of ["apple", "cube", "milk"]) {
  const input = await fs.readFile(path.join(source, `${name}_hand_object.glb`));
  assert.equal(input.readUInt32LE(0), 0x46546c67);
  assert.equal(input.readUInt32LE(8), input.length);
  const jsonSize = input.readUInt32LE(12);
  const gltf = JSON.parse(input.subarray(20, 20 + jsonSize));
  const binary = input.subarray(28 + jsonSize);
  const chunks = [];
  let offset = 0;
  const originalSize = gltf.buffers[0].byteLength;
  for (let index = 0; index < gltf.bufferViews.length; index++) {
    const view = gltf.bufferViews[index];
    const accessor = gltf.accessors.find((a) => a.bufferView === index);
    assert.ok(accessor && !accessor.byteOffset && !view.byteStride);
    const stride = view.byteLength / accessor.count;
    // INDICES preserves the original index sequence byte-for-byte (TRIANGLES may rotate triples).
    const mode = accessor.type === "SCALAR" ? "INDICES" : "ATTRIBUTES";
    const bytes = binary.subarray(
      view.byteOffset || 0,
      (view.byteOffset || 0) + view.byteLength,
    );
    const encoded = MeshoptEncoder.encodeGltfBuffer(
      bytes,
      accessor.count,
      stride,
      mode,
    );
    const decoded = new Uint8Array(bytes.length);
    MeshoptDecoder.decodeGltfBuffer(
      decoded,
      accessor.count,
      stride,
      encoded,
      mode,
    );
    assert.deepEqual(
      Buffer.from(decoded),
      bytes,
      `${name} view ${index} must round-trip exactly`,
    );
    view.buffer = 1;
    view.extensions = {
      EXT_meshopt_compression: {
        buffer: 0,
        byteOffset: offset,
        byteLength: encoded.length,
        byteStride: stride,
        count: accessor.count,
        mode,
      },
    };
    chunks.push(Buffer.from(encoded));
    const padding = (4 - (encoded.length % 4)) % 4;
    chunks.push(Buffer.alloc(padding));
    offset += encoded.length + padding;
  }
  gltf.buffers = [
    { byteLength: offset },
    {
      byteLength: originalSize,
      extensions: { EXT_meshopt_compression: { fallback: true } },
    },
  ];
  gltf.extensionsUsed = ["EXT_meshopt_compression"];
  gltf.extensionsRequired = ["EXT_meshopt_compression"];
  const rawJSON = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.concat([
    rawJSON,
    Buffer.alloc((4 - (rawJSON.length % 4)) % 4, 0x20),
  ]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + offset, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(offset, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const output = Buffer.concat([header, json, binHeader, ...chunks]);
  await fs.mkdir(new URL(`${name}/`, root), { recursive: true });
  await fs.writeFile(new URL(`${name}/scene.glb`, root), output);
  console.log(
    `${name}: ${input.length.toLocaleString()} → ${output.length.toLocaleString()} bytes; all buffers verified lossless`,
  );
}
