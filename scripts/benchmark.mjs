import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const core = await import(resolve(root, "dist/core.js"));
const editor = await import(resolve(root, "dist/editor.js"));
const {
  applyMindMapPatches,
  createMarkdownStream,
  createMindMapController,
  diffMindMapDocuments,
  layoutMindMap,
  parseMindMap,
  walkNodes,
} = core;
const { cullMindMapLayout } = editor;

if (typeof cullMindMapLayout !== "function") {
  throw new Error("dist/editor.js does not export the production cullMindMapLayout helper.");
}

const SAMPLE_COUNT = 30;
const WARMUP_COUNT = 5;
const LARGE_MAP = { branches: 100, leavesPerBranch: 9 };
const LOCAL_LEAF_SCALING_MAPS = [
  { name: "small", branches: 10, leavesPerBranch: 9 },
  { name: "medium", branches: 50, leavesPerBranch: 9 },
  { name: "large", branches: 100, leavesPerBranch: 9 },
];

function makeMarkdown({ branches, leavesPerBranch }) {
  const lines = ["Benchmark map"];
  for (let branch = 0; branch < branches; branch += 1) {
    lines.push(`- Branch ${branch}`);
    for (let leaf = 0; leaf < leavesPerBranch; leaf += 1) lines.push(`  - Leaf ${branch}.${leaf}`);
  }
  return lines.join("\n");
}

function countNodes(document) {
  let count = 0;
  walkNodes(document, () => { count += 1; });
  return count;
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return {
    samples: sorted.length,
    minMs: Number(sorted[0].toFixed(3)),
    medianMs: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
    maxMs: Number(sorted.at(-1).toFixed(3)),
  };
}

async function measure(name, fixture, operation) {
  for (let index = 0; index < WARMUP_COUNT; index += 1) await operation();
  const durations = [];
  let details;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    details = await operation();
    durations.push(performance.now() - start);
  }
  return { name, fixture, timing: summarize(durations), details };
}

function runLocalLeafProjection(initialDocument, leafId) {
  const next = applyMindMapPatches(initialDocument, [{ type: "update", nodeId: leafId, text: "Updated leaf" }]);
  const patches = diffMindMapDocuments(initialDocument, next);
  const layout = layoutMindMap(next);
  const controller = createMindMapController(initialDocument);
  const initialSnapshot = controller.getSnapshot();
  controller.selectNode(leafId);
  const selectionSnapshot = controller.getSnapshot();
  controller.updateNode(leafId, { text: "Updated leaf" });
  const updateSnapshot = controller.getSnapshot();
  controller.dispose();
  return {
    patches: patches.length,
    patchTypes: patches.map((patch) => patch.type),
    structuralSharing: next.roots[0] !== initialDocument.roots[0],
    unchangedBranchShared: next.roots[0].children?.[0] === initialDocument.roots[0].children?.[0],
    laidOutNodes: layout.nodes.length,
    selectionProjectionReused: selectionSnapshot.layout === initialSnapshot.layout,
    leafUpdateProjectionReused: updateSnapshot.layout === selectionSnapshot.layout,
  };
}

const markdown = makeMarkdown(LARGE_MAP);
const expectedNodes = 1 + LARGE_MAP.branches + LARGE_MAP.branches * LARGE_MAP.leavesPerBranch;
const leafId = `mm-0-${LARGE_MAP.branches - 1}-${LARGE_MAP.leavesPerBranch - 1}`;
const initialDocument = parseMindMap(markdown);
const initialLayout = layoutMindMap(initialDocument);

const fullLayout = await measure(
  "full-parse-layout",
  { ...LARGE_MAP, expectedNodes, markdownCharacters: markdown.length },
  () => {
    const document = parseMindMap(markdown);
    const layout = layoutMindMap(document);
    return { parsedNodes: countNodes(document), laidOutNodes: layout.nodes.length, edges: layout.edges.length };
  },
);

const localLeaf = await measure(
  "local-leaf-update-diff-projection",
  { ...LARGE_MAP, leafId, markdownCharacters: markdown.length },
  () => runLocalLeafProjection(initialDocument, leafId),
);

const localLeafScalingResults = [];
for (const map of LOCAL_LEAF_SCALING_MAPS) {
  const scalingMarkdown = makeMarkdown(map);
  const scalingDocument = parseMindMap(scalingMarkdown);
  const scalingLeafId = `mm-0-${map.branches - 1}-${map.leavesPerBranch - 1}`;
  const expectedNodesForMap = 1 + map.branches + map.branches * map.leavesPerBranch;
  localLeafScalingResults.push(await measure(
    `local-leaf-scaling-${map.name}`,
    {
      implementation: "production core diff/projection path",
      ...map,
      expectedNodes: expectedNodesForMap,
      leafId: scalingLeafId,
      markdownCharacters: scalingMarkdown.length,
    },
    () => runLocalLeafProjection(scalingDocument, scalingLeafId),
  ));
}

const scalingBaseline = localLeafScalingResults[0]?.timing.medianMs ?? null;
const localLeafScalingObservation = {
  note: "Descriptive scaling observations only; no performance threshold or budget gate is applied.",
  fixtures: localLeafScalingResults.map((result) => result.fixture),
  normalized: localLeafScalingResults.map((result) => {
    const expectedNodesForMap = result.fixture.expectedNodes;
    return {
      name: result.fixture.name,
      expectedNodes: expectedNodesForMap,
      medianMs: result.timing.medianMs,
      p95Ms: result.timing.p95Ms,
      medianMsPer100Nodes: Number(((result.timing.medianMs * 100) / expectedNodesForMap).toFixed(3)),
      p95MsPer100Nodes: Number(((result.timing.p95Ms * 100) / expectedNodesForMap).toFixed(3)),
      medianScaleVsSmallest: scalingBaseline
        ? Number((result.timing.medianMs / scalingBaseline).toFixed(3))
        : null,
    };
  }),
};

const streamChunks = Array.from({ length: 20 }, (_, index) => markdown.slice(
  Math.floor((markdown.length * index) / 20),
  Math.floor((markdown.length * (index + 1)) / 20),
));
let streamDetails = { chunks: streamChunks.length, scheduledCallbacks: 0, updates: 0, documentNodes: 0 };
const streamBurst = await measure(
  "stream-burst-coalescing",
  { chunks: streamChunks.length, characters: markdown.length, scheduler: "manual flush" },
  async () => {
    let scheduledCallbacks = 0;
    let updates = 0;
    const pending = new Set();
    const stream = createMarkdownStream({ schedule(callback) {
      scheduledCallbacks += 1;
      pending.add(callback);
      return () => pending.delete(callback);
    }});
    const unsubscribe = stream.subscribe(() => { updates += 1; });
    streamChunks.forEach((chunk) => stream.append(chunk));
    const update = await stream.flush();
    unsubscribe();
    stream.dispose();
    streamDetails = {
      chunks: streamChunks.length,
      scheduledCallbacks,
      updates,
      documentNodes: update ? countNodes(update.document) : 0,
    };
    return streamDetails;
  },
);

const cullingViewport = { x: 0, y: 0, zoom: 1, width: 960, height: 640 };
const culling = await measure(
  "culling-element-counts",
  {
    implementation: "production runtime cullMindMapLayout from dist/editor.js",
    nodes: initialLayout.nodes.length,
    edges: initialLayout.edges.length,
    viewport: cullingViewport,
    threshold: 200,
    overscan: 160,
    pinnedIds: [leafId],
  },
  () => {
    const visible = cullMindMapLayout(initialLayout, {
      viewport: { x: cullingViewport.x, y: cullingViewport.y, zoom: cullingViewport.zoom },
      width: cullingViewport.width,
      height: cullingViewport.height,
      options: { threshold: 200, overscan: 160 },
      pinnedNodeIds: [leafId],
    });
    return {
      totalNodes: initialLayout.nodes.length,
      visibleNodes: visible.nodes.length,
      totalEdges: initialLayout.edges.length,
      visibleEdges: visible.edges.length,
      pinnedNodeRetained: visible.nodes.some((node) => node.id === leafId),
      culled: visible !== initialLayout,
      implementation: "production runtime cullMindMapLayout",
    };
  },
);

const report = {
  generatedAt: new Date().toISOString(),
  command: process.argv.join(" "),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: cpus().length,
    cwd: process.cwd(),
  },
  sampling: { warmups: WARMUP_COUNT, samples: SAMPLE_COUNT, timer: "performance.now()" },
  fixtures: {
    largeMap: { ...LARGE_MAP, expectedNodes, markdownCharacters: markdown.length },
    localLeafScaling: localLeafScalingObservation.fixtures,
    streamBurst: { chunks: streamChunks.length, characters: markdown.length },
    culling: {
      implementation: "production runtime cullMindMapLayout from dist/editor.js",
      nodes: initialLayout.nodes.length,
      edges: initialLayout.edges.length,
      viewport: cullingViewport,
      threshold: 200,
      overscan: 160,
      pinnedIds: [leafId],
    },
  },
  scenarios: { fullLayout, localLeaf, localLeafScaling: { results: localLeafScalingResults, observation: localLeafScalingObservation }, streamBurst, culling },
  observations: {
    note: "Measurements are descriptive. This report defines no performance or bundle-size pass threshold.",
    initialLayoutNodes: initialLayout.nodes.length,
    streamDetails,
    localLeafScaling: localLeafScalingObservation,
  },
};

const artifacts = resolve(root, "artifacts");
mkdirSync(artifacts, { recursive: true });
writeFileSync(resolve(artifacts, "benchmark.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
