import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BookOpen, ListOrdered, Network, Sparkles, X } from 'lucide-react';
import type { DiagnosisResult, KnowledgeNode } from '../types';
import { knowledgeNodes, knowledgeEdges } from '../data/knowledge';
import { hsNodes, hsEdges, nodeExtras } from '../data/highSchool';
import { MathTex } from './MathTex';

type NodeStatus = 'default' | 'weak' | 'priority' | 'dim';

type KDNodeData = {
  label: string;
  group: string;
  status: NodeStatus;
};

type KDNode = Node<KDNodeData, 'kd'>;

/* 合并：队员 B 的题库关联图谱 + 前端高中课程扩展图谱 */
const allNodes: KnowledgeNode[] = [...knowledgeNodes, ...hsNodes];
const allEdges = [...knowledgeEdges, ...hsEdges];

/* 前置知识索引：target -> sources */
const prereqMap = new Map<string, string[]>();
for (const e of allEdges) {
  prereqMap.set(e.target, [...(prereqMap.get(e.target) ?? []), e.source]);
}

/* ===== 自定义节点 ===== */
function KDNodeCard({ data, selected }: NodeProps<KDNode>) {
  const styleMap: Record<NodeStatus, string> = {
    default:
      'border-sky-400/50 bg-[#0b1730]/95 text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.25)]',
    weak:
      'border-danger/70 bg-[#2a120c]/95 text-orange-100 shadow-[0_0_26px_rgba(251,106,74,0.5)] animate-pulse',
    priority:
      'border-violet-400/70 bg-[#1b1033]/95 text-violet-100 shadow-[0_0_26px_rgba(139,92,246,0.5)]',
    dim: 'border-slate-700/60 bg-[#0c1120]/90 text-slate-500',
  };
  const dotMap: Record<NodeStatus, string> = {
    default: 'bg-sky-400',
    weak: 'bg-danger',
    priority: 'bg-violet-400',
    dim: 'bg-slate-600',
  };

  return (
    <div
      className={`w-[150px] cursor-pointer rounded-xl border px-3 py-2.5 backdrop-blur transition-transform duration-200 hover:scale-[1.04] ${styleMap[data.status]} ${
        selected ? 'ring-2 ring-cyan-300/70' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-500" />
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotMap[data.status]}`} />
        <span className="truncate text-[13px] font-semibold leading-tight">{data.label}</span>
      </div>
      <div className="mt-0.5 pl-3 text-[10px] tracking-wide opacity-60">{data.group}</div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-500" />
    </div>
  );
}

const nodeTypes = { kd: KDNodeCard };

/* ===== 拓扑分层布局：x = 深度，y = 同层序号 ===== */
function computeLayout(nodes: KnowledgeNode[], edges: { source: string; target: string }[]) {
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  edges.forEach((e) => {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  });
  const resolve = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => resolve(p, seen))) + 1;
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => resolve(n.id, new Set()));

  const perLevel = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  const levelCounts = new Map<number, number>();
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    levelCounts.set(d, (levelCounts.get(d) ?? 0) + 1);
  });
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    const idx = perLevel.get(d) ?? 0;
    perLevel.set(d, idx + 1);
    const total = levelCounts.get(d) ?? 1;
    pos.set(n.id, {
      x: d * 210,
      y: idx * 96 - ((total - 1) * 96) / 2,
    });
  });
  return pos;
}

/* 双带布局：题库关联图谱在上，高中课程图谱在下，避免互相重叠 */
const mergedPos = (() => {
  const legacyPos = computeLayout(knowledgeNodes, knowledgeEdges);
  const hsPos = computeLayout(hsNodes, hsEdges);
  const half = (m: Map<string, { y: number }>) =>
    m.size === 0 ? 0 : Math.max(...[...m.values()].map((p) => Math.abs(p.y)));
  const offset = half(legacyPos) + half(hsPos) + 150;
  const pos = new Map<string, { x: number; y: number }>();
  legacyPos.forEach((p, id) => pos.set(id, p));
  hsPos.forEach((p, id) => pos.set(id, { x: p.x, y: p.y + offset }));
  return pos;
})();

/* ===== 主组件 ===== */
export default function KnowledgeGraph({
  result,
  analyzing,
  full = false,
}: {
  result: DiagnosisResult | null;
  analyzing: boolean;
  full?: boolean;
}) {
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);

  const { nodes, edges } = useMemo(() => {
    const weak = new Set(result?.weakNodeIds ?? []);
    const path = new Set(result?.learningPathIds ?? []);
    const hasResult = !!result && !result.isCorrect;

    const rfNodes: KDNode[] = allNodes.map((n) => {
      let status: NodeStatus = 'default';
      if (hasResult) {
        if (weak.has(n.id)) status = 'weak';
        else if (path.has(n.id)) status = 'priority';
        else status = 'dim';
      }
      return {
        id: n.id,
        type: 'kd' as const,
        position: mergedPos.get(n.id) ?? { x: 0, y: 0 },
        data: { label: n.label, group: n.group, status },
      };
    });

    const weakSet = weak;
    const rfEdges: Edge[] = allEdges.map((e) => {
      const hot = hasResult && weakSet.has(e.target);
      const intoPath = hasResult && !weakSet.has(e.target) && path.has(e.target);
      const color = hot ? '#fb6a4a' : intoPath ? '#8b5cf6' : '#31517e';
      return {
        id: `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        animated: hot || intoPath,
        style: {
          stroke: color,
          strokeWidth: hot || intoPath ? 2.4 : 1.4,
          opacity: hasResult && !hot && !intoPath ? 0.35 : 0.9,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [result]);

  // 诊断变化时清除已选节点中不存在的状态
  useEffect(() => {
    if (result) setSelectedNode(null);
  }, [result]);

  const onNodeClick = useCallback((_: unknown, node: KDNode) => {
    const found = allNodes.find((n) => n.id === node.id) ?? null;
    setSelectedNode((cur) => (cur?.id === found?.id ? null : found));
  }, []);

  const selectedExtra = selectedNode ? nodeExtras[selectedNode.id] : undefined;
  const selectedPrereqs = selectedNode ? (prereqMap.get(selectedNode.id) ?? []) : [];
  const selectedTips = selectedExtra?.tips ?? [
    '重做 3 道同类题并总结易错点',
    '把解题步骤讲给同学听，确认真正理解',
  ];

  return (
    <section className="glass relative h-full overflow-hidden p-0">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

      {/* 标题栏 */}
      <div className="absolute left-4 top-3.5 z-10 flex items-center gap-2">
        <span className="section-title">
          <Network className="h-4 w-4 text-cyan-300" />
          知识依赖图谱
        </span>
        <span className="chip hidden border-slate-600/40 bg-slate-800/60 text-slate-400 sm:inline-flex">
          高中全模块 · {allNodes.length} 个知识点
        </span>
        {analyzing && (
          <span className="chip border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-cyan-300" />
            扫描中
          </span>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedNode(null)}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="rgba(99,102,241,0.14)" gap={26} size={1.2} />
        <Controls position="bottom-right" showInteractive={false} />
        {full && (
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            style={{ background: 'rgba(8,12,26,0.9)' }}
            nodeColor={(n) => {
              const s = (n.data as KDNodeData).status;
              return s === 'weak' ? '#fb6a4a' : s === 'priority' ? '#8b5cf6' : '#1e3a5f';
            }}
          />
        )}
      </ReactFlow>

      {/* 图例 */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line bg-panel/80 px-3.5 py-2 text-[11px] backdrop-blur">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
          正常掌握
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full bg-danger shadow-[0_0_8px_rgba(251,106,74,0.8)]" />
          薄弱漏洞
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
          优先补习
        </span>
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          暂不相关
        </span>
      </div>

      {/* 节点详情弹层：解释 / 前置知识 / 复习建议 */}
      {selectedNode && (
        <div className="absolute right-3 top-12 z-10 w-72 animate-fade-up rounded-xl border border-line bg-panel/90 p-4 shadow-glow backdrop-blur-xl">
          <button
            onClick={() => setSelectedNode(null)}
            className="absolute right-2 top-2 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="mb-1 text-[10px] tracking-widest text-cyan-400/80">
            {selectedNode.group} · {selectedNode.id.toUpperCase()}
          </div>
          <div className="mb-2 text-sm font-bold text-white">{selectedNode.label}</div>

          <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
            {/* 解释 */}
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                <BookOpen className="h-3 w-3 text-cyan-300" />
                知识点解释
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{selectedNode.description}</p>
              {selectedExtra?.latex && (
                <div className="mt-1.5 overflow-x-auto rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-cyan-200/90">
                  <MathTex tex={selectedExtra.latex} className="text-[13px]" />
                </div>
              )}
            </div>

            {/* 前置知识 */}
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                <ListOrdered className="h-3 w-3 text-violet-300" />
                前置知识
              </div>
              {selectedPrereqs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPrereqs.map((pid) => {
                    const pn = allNodes.find((n) => n.id === pid);
                    return (
                      <span
                        key={pid}
                        className="chip border-violet-400/30 bg-violet-400/10 text-violet-200"
                      >
                        {pn?.label ?? pid}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">无前置依赖，属于起点知识</p>
              )}
            </div>

            {/* 复习建议 */}
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                <Sparkles className="h-3 w-3 text-amber-300" />
                复习建议
              </div>
              <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-400">
                {selectedTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>

            {result && result.weakNodeIds.includes(selectedNode.id) && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-[11px] font-medium text-orange-300">
                ⚠ 已标记为薄弱知识点
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
