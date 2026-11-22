import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
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

const allNodes: KnowledgeNode[] = [...knowledgeNodes, ...hsNodes];
const allEdges = [...knowledgeEdges, ...hsEdges];

const prereqMap = new Map<string, string[]>();
for (const edge of allEdges) {
  prereqMap.set(edge.target, [...(prereqMap.get(edge.target) ?? []), edge.source]);
}

function KDNodeCard({ data, selected }: NodeProps<KDNode>) {
  const styleMap: Record<NodeStatus, string> = {
    default: 'border-[#C9C5BB] bg-[#F7F6F2] text-ink',
    weak: 'border-vermilion bg-[#F8E8E1] text-ink',
    priority: 'border-ink bg-[#EEECE6] text-ink',
    dim: 'border-line bg-[#F7F6F2]/80 text-[#9A958C] opacity-55',
  };

  return (
    <div
      className={`min-h-[64px] w-[174px] cursor-pointer rounded-md border px-3 py-2.5 transition-colors duration-200 ${styleMap[data.status]} ${
        selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-canvas' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-[#AAA69D]" />
      <div className="text-[15px] font-bold leading-snug">{data.label}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] leading-tight">
        <span className="opacity-65">{data.group}</span>
        {data.status === 'weak' && <span className="shrink-0 font-semibold text-vermilion">疑似薄弱</span>}
        {data.status === 'priority' && <span className="shrink-0 font-semibold">建议复习</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-[#AAA69D]" />
    </div>
  );
}

const nodeTypes = { kd: KDNodeCard };

function computeLayout(nodes: KnowledgeNode[], edges: { source: string; target: string }[]) {
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  edges.forEach((edge) => {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  });
  const resolve = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((p) => resolve(p, seen))) + 1;
    depth.set(id, value);
    return value;
  };
  nodes.forEach((node) => resolve(node.id, new Set()));

  const perLevel = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  const levelCounts = new Map<number, number>();
  nodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  });
  nodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    const index = perLevel.get(level) ?? 0;
    perLevel.set(level, index + 1);
    const total = levelCounts.get(level) ?? 1;
    positions.set(node.id, {
      x: level * 230,
      y: index * 112 - ((total - 1) * 112) / 2,
    });
  });
  return positions;
}

const mergedPos = (() => {
  const legacyPos = computeLayout(knowledgeNodes, knowledgeEdges);
  const hsPos = computeLayout(hsNodes, hsEdges);
  const half = (positions: Map<string, { y: number }>) =>
    positions.size === 0 ? 0 : Math.max(...[...positions.values()].map((position) => Math.abs(position.y)));
  const offset = half(legacyPos) + half(hsPos) + 170;
  const positions = new Map<string, { x: number; y: number }>();
  legacyPos.forEach((position, id) => positions.set(id, position));
  hsPos.forEach((position, id) => positions.set(id, { x: position.x, y: position.y + offset }));
  return positions;
})();

function GraphViewport({ result }: { result: DiagnosisResult | null }) {
  const { fitView } = useReactFlow();
  const focusKey = result && !result.isCorrect
    ? [...new Set([...result.learningPathIds, ...result.weakNodeIds])].join('|')
    : '';

  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      void fitView({
        nodes: focusKey ? focusKey.split('|').map((id) => ({ id })) : undefined,
        padding: focusKey ? 0.42 : 0.16,
        maxZoom: focusKey ? 1.05 : 0.95,
        duration: 240,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, focusKey, result]);

  return null;
}

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

    const rfNodes: KDNode[] = allNodes.map((node) => {
      let status: NodeStatus = 'default';
      if (hasResult) {
        if (weak.has(node.id)) status = 'weak';
        else if (path.has(node.id)) status = 'priority';
        else status = 'dim';
      }
      return {
        id: node.id,
        type: 'kd' as const,
        position: mergedPos.get(node.id) ?? { x: 0, y: 0 },
        data: { label: node.label, group: node.group, status },
      };
    });

    const rfEdges: Edge[] = allEdges.map((edge) => {
      const inPath = hasResult && path.has(edge.source) && path.has(edge.target);
      const intoWeak = inPath && weak.has(edge.target);
      const color = intoWeak ? '#B64329' : inPath ? '#171717' : '#C9C5BB';
      return {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        style: {
          stroke: color,
          strokeWidth: inPath ? 2.4 : 1.2,
          opacity: hasResult && !inPath ? 0.32 : 0.95,
          transition: 'stroke 200ms ease, opacity 200ms ease',
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [result]);

  useEffect(() => {
    if (result) setSelectedNode(null);
  }, [result]);

  const onNodeClick = useCallback((_: unknown, node: KDNode) => {
    const found = allNodes.find((item) => item.id === node.id) ?? null;
    setSelectedNode((current) => (current?.id === found?.id ? null : found));
  }, []);

  const selectedExtra = selectedNode ? nodeExtras[selectedNode.id] : undefined;
  const selectedPrereqs = selectedNode ? (prereqMap.get(selectedNode.id) ?? []) : [];
  const selectedTips = selectedExtra?.tips ?? [
    '重做 3 道同类题并总结易错点',
    '把解题步骤讲给同学听，确认真正理解',
  ];

  return (
    <section className="panel flex h-full flex-col overflow-hidden" aria-labelledby="graph-title">
      <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 id="graph-title" className="section-title">
            <Network className="h-5 w-5" strokeWidth={1.7} />
            知识依赖图谱
          </h2>
          <p className="mt-1 text-xs text-muted">点击节点查看公式与复习建议，拖动画布或缩放查看全图</p>
        </div>
        <span className="text-xs font-medium text-muted">
          {analyzing ? '正在更新…' : `高中数学 · ${allNodes.length} 个知识点`}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 0.95 }}
          minZoom={0.18}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background color="#D5D1C8" gap={24} size={1.1} />
          <Controls position="bottom-right" showInteractive={false} />
          <GraphViewport result={result} />
          {full && (
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              style={{ background: '#F7F6F2' }}
              nodeColor={(node) => {
                const status = (node.data as KDNodeData).status;
                return status === 'weak' ? '#B64329' : status === 'priority' ? '#171717' : '#C9C5BB';
              }}
            />
          )}
        </ReactFlow>

        <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-line bg-canvas/95 px-3 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-[#C9C5BB] bg-canvas" />
            其他知识点
          </span>
          <span className="flex items-center gap-1.5 text-vermilion">
            <span className="h-2.5 w-2.5 rounded-sm bg-vermilion" />
            疑似薄弱
          </span>
          <span className="flex items-center gap-1.5 text-ink">
            <span className="h-2.5 w-2.5 rounded-sm bg-ink" />
            建议复习
          </span>
        </div>

        {selectedNode && (
          <div className="result-enter absolute right-3 top-3 z-20 max-h-[calc(100%-5.5rem)] w-[calc(100%-1.5rem)] max-w-80 overflow-y-auto rounded-md border border-ink bg-canvas p-4 shadow-[0_12px_32px_rgba(23,23,23,0.12)]">
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute right-2 top-2 rounded p-1.5 text-muted hover:bg-[#EEECE6] hover:text-ink"
              aria-label="关闭节点详情"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-1 pr-7 text-xs text-muted">{selectedNode.group}</div>
            <h3 className="mb-2 text-lg font-bold text-ink">{selectedNode.label}</h3>
            {result?.weakNodeIds.includes(selectedNode.id) && (
              <div className="mb-3 inline-flex rounded border border-vermilion px-2 py-1 text-xs font-semibold text-vermilion">
                疑似薄弱
              </div>
            )}
            {!result?.weakNodeIds.includes(selectedNode.id) && result?.learningPathIds.includes(selectedNode.id) && (
              <div className="mb-3 inline-flex rounded border border-ink px-2 py-1 text-xs font-semibold text-ink">
                建议复习
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <BookOpen className="h-4 w-4" strokeWidth={1.7} />
                  知识点解释
                </div>
                <p className="text-sm leading-relaxed text-muted">{selectedNode.description}</p>
                {selectedExtra?.latex && (
                  <div className="mt-2 overflow-x-auto border-y border-line py-3 text-base text-ink">
                    <MathTex tex={selectedExtra.latex} />
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <ListOrdered className="h-4 w-4" strokeWidth={1.7} />
                  前置知识
                </div>
                {selectedPrereqs.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPrereqs.map((id) => {
                      const prerequisite = allNodes.find((node) => node.id === id);
                      return (
                        <span key={id} className="chip border-line bg-white/60 text-ink">
                          {prerequisite?.label ?? id}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted">无前置依赖，属于起点知识</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Sparkles className="h-4 w-4" strokeWidth={1.7} />
                  复习建议
                </div>
                <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted">
                  {selectedTips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
