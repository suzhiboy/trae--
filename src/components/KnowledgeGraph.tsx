import { useCallback, useEffect, useId, useMemo, useState } from 'react';
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
import { BookOpen, ChevronDown, ListOrdered, Network, Sparkles, X } from 'lucide-react';
import type { DiagnosisResult, KnowledgeNode, SessionReport } from '../types';
import { knowledgeNodes, knowledgeEdges } from '../data/knowledge';
import { nodeExtras } from '../data/highSchool';
import { MathTex } from './MathTex';

type NodeStatus = 'default' | 'weak' | 'priority' | 'dim';
type KDNodeData = { label: string; group: string; status: NodeStatus };
type KDNode = Node<KDNodeData, 'kd'>;

const prereqMap = new Map<string, string[]>();
for (const edge of knowledgeEdges) {
  prereqMap.set(edge.target, [...(prereqMap.get(edge.target) ?? []), edge.source]);
}

function KDNodeCard({ data, selected }: NodeProps<KDNode>) {
  return (
    <div className={`practice-graph-node is-${data.status}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="practice-graph-handle" />
      <strong>{data.label}</strong>
      <div>
        <span>{data.group}</span>
        {data.status === 'weak' && <b>疑似薄弱</b>}
        {data.status === 'priority' && <b>建议复习</b>}
      </div>
      <Handle type="source" position={Position.Right} className="practice-graph-handle" />
    </div>
  );
}

const nodeTypes = { kd: KDNodeCard };

function computeLayout() {
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  knowledgeEdges.forEach((edge) => {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  });
  const resolve = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => resolve(parent, seen))) + 1;
    depth.set(id, value);
    return value;
  };
  knowledgeNodes.forEach((node) => resolve(node.id, new Set()));

  const perLevel = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  const levelCounts = new Map<number, number>();
  knowledgeNodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  });
  knowledgeNodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    const index = perLevel.get(level) ?? 0;
    perLevel.set(level, index + 1);
    const total = levelCounts.get(level) ?? 1;
    positions.set(node.id, { x: level * 230, y: index * 112 - ((total - 1) * 112) / 2 });
  });
  return positions;
}

const positions = computeLayout();

function GraphViewport({ focusKey, active }: { focusKey: string; active: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fitView({
        nodes: active && focusKey ? focusKey.split('|').map((id) => ({ id })) : undefined,
        padding: active && focusKey ? 0.42 : 0.16,
        maxZoom: active && focusKey ? 1.05 : 0.95,
        duration: 240,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, fitView, focusKey]);
  return null;
}

export default function KnowledgeGraph({
  result,
  weakNodeIds,
  learningPathIds,
  highlighted,
  analyzing = false,
  full = false,
  collapsible = true,
}: {
  result?: DiagnosisResult | SessionReport | null;
  weakNodeIds?: string[];
  learningPathIds?: string[];
  highlighted?: boolean;
  analyzing?: boolean;
  full?: boolean;
  collapsible?: boolean;
}) {
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [collapsed, setCollapsed] = useState(() => collapsible && window.matchMedia('(max-width: 767px)').matches);
  const headingId = useId();
  const weak = useMemo(() => new Set(weakNodeIds ?? result?.weakNodeIds ?? []), [result?.weakNodeIds, weakNodeIds]);
  const path = useMemo(() => new Set(learningPathIds ?? result?.learningPathIds ?? []), [learningPathIds, result?.learningPathIds]);
  const hasHighlight = highlighted ?? (result && 'isCorrect' in result
    ? !result.isCorrect
    : weak.size > 0 || path.size > 0);
  const focusKey = [...new Set([...path, ...weak])].join('|');

  const { nodes, edges } = useMemo(() => {
    const rfNodes: KDNode[] = knowledgeNodes.map((node) => {
      let status: NodeStatus = 'default';
      if (hasHighlight) {
        if (weak.has(node.id)) status = 'weak';
        else if (path.has(node.id)) status = 'priority';
        else status = 'dim';
      }
      return {
        id: node.id,
        type: 'kd' as const,
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        data: { label: node.label, group: node.group, status },
      };
    });

    const rfEdges: Edge[] = knowledgeEdges.map((edge) => {
      const inPath = hasHighlight && path.has(edge.source) && path.has(edge.target);
      const intoWeak = inPath && weak.has(edge.target);
      const color = intoWeak ? '#ea384c' : inPath ? '#fafafa' : '#d1d1d1';
      return {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        style: {
          stroke: color,
          strokeWidth: inPath ? 2.4 : 1.2,
          opacity: hasHighlight && !inPath ? 0.16 : inPath ? 0.95 : 0.28,
          transition: 'stroke 200ms ease, opacity 200ms ease',
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [hasHighlight, path, weak]);

  useEffect(() => setSelectedNode(null), [focusKey]);

  const onNodeClick = useCallback((_: unknown, node: KDNode) => {
    const found = knowledgeNodes.find((item) => item.id === node.id) ?? null;
    setSelectedNode((current) => current?.id === found?.id ? null : found);
  }, []);

  const selectedExtra = selectedNode ? nodeExtras[selectedNode.id] : undefined;
  const selectedPrereqs = selectedNode ? prereqMap.get(selectedNode.id) ?? [] : [];
  const selectedTips = selectedExtra?.tips ?? ['重做 3 道同类题并总结易错点', '把解题步骤讲给同学听，确认真正理解'];

  return (
    <section className={`practice-graph${collapsed ? ' is-collapsed' : ''}`} aria-labelledby={headingId}>
      <div className="practice-subheading">
        <div>
          <h2 id={headingId}><Network aria-hidden="true" />知识依赖图谱</h2>
          <p>18 个引擎知识点 · 点击节点查看详情，拖动或缩放画布</p>
        </div>
        <div className="practice-graph__tools">
          <span>{analyzing ? '正在更新…' : `${weak.size} 个薄弱点`}</span>
          {collapsible && (
            <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
              {collapsed ? '展开图谱' : '收起图谱'}<ChevronDown aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="practice-graph__viewport" data-lenis-prevent>
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
            <Background color="#1f1f1f" gap={24} size={1.1} />
            <Controls position="bottom-right" showInteractive={false} />
            <GraphViewport focusKey={focusKey} active={hasHighlight} />
            {full && (
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                style={{ background: '#101010' }}
                nodeColor={(node) => {
                  const status = (node.data as KDNodeData).status;
                  return status === 'weak' ? '#ea384c' : status === 'priority' ? '#fafafa' : '#1f1f1f';
                }}
              />
            )}
          </ReactFlow>

          <div className="practice-graph__legend" aria-label="图例">
            <span><i />其他知识点</span>
            <span className="is-weak"><i />疑似薄弱</span>
            <span className="is-path"><i />建议复习</span>
          </div>

          {selectedNode && (
            <aside className="practice-graph-detail" data-lenis-prevent aria-label={`${selectedNode.label}节点详情`}>
              <button type="button" onClick={() => setSelectedNode(null)} aria-label="关闭节点详情"><X aria-hidden="true" /></button>
              <span>{selectedNode.group}</span>
              <h3>{selectedNode.label}</h3>
              {weak.has(selectedNode.id) && <b className="is-weak">疑似薄弱</b>}
              {!weak.has(selectedNode.id) && path.has(selectedNode.id) && <b className="is-path">建议复习</b>}
              <div>
                <h4><BookOpen aria-hidden="true" />知识点解释</h4>
                <p>{selectedNode.description}</p>
                {selectedExtra?.latex && <div className="practice-graph-detail__formula"><MathTex tex={selectedExtra.latex} /></div>}
              </div>
              <div>
                <h4><ListOrdered aria-hidden="true" />前置知识</h4>
                {selectedPrereqs.length > 0 ? (
                  <div className="practice-graph-detail__prereqs">
                    {selectedPrereqs.map((id) => <span key={id}>{knowledgeNodes.find((node) => node.id === id)?.label ?? id}</span>)}
                  </div>
                ) : <p>无前置依赖，属于起点知识。</p>}
              </div>
              <div>
                <h4><Sparkles aria-hidden="true" />复习建议</h4>
                <ul>{selectedTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
              </div>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
