import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FlowNode } from "../api/contract";
import { useTheme } from "../theme/ThemeProvider";
import { stateColor, STATUS_KEY } from "./statusKeys";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;

export type FlowCardData = { flowNode: FlowNode; foreign: boolean };

function flowNodeKey(node: FlowNode): string {
  return `${node.queueName}:${node.id}`;
}

function FlowCard({ data }: NodeProps<Node<FlowCardData>>) {
  const { t } = useTranslation();
  const { flowNode, foreign } = data;
  const modifier = stateColor(flowNode.state);
  const canonicalModifier = modifier && modifier !== flowNode.state ? ` flow-node--${modifier}` : "";

  return (
    <div className={`flow-node flow-node--${flowNode.state}${canonicalModifier}`}>
      <span className="flow-node__name">{flowNode.name || t("FLOW.UNNAMED")}</span>
      <span className="flow-node__id">#{flowNode.id}</span>
      <span className={`dash-chip${modifier ? ` dash-chip--${modifier}` : ""}`}>
        {t(STATUS_KEY[flowNode.state])}
      </span>
      {foreign && (
        <span className="flow-node__queue">{flowNode.queueName}</span>
      )}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { flow: FlowCard };

/**
 * Arranges the flow forest with dagre (top-to-bottom, like a pipeline) and
 * hands the positioned tree to xyflow. Node ids are scoped by queue so
 * cross-queue children never collide.
 */
function layoutGraph(
  roots: FlowNode[],
  sourceQueueName: string,
): { nodes: Node<FlowCardData>[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 48 });
  graph.setDefaultEdgeLabel(() => ({}));

  const byKey = new Map<string, FlowCardData>();

  const walk = (node: FlowNode, parentKey?: string) => {
    const key = flowNodeKey(node);
    byKey.set(key, {
      flowNode: node,
      foreign: node.queueName !== sourceQueueName,
    });
    graph.setNode(key, { width: NODE_WIDTH, height: NODE_HEIGHT });
    if (parentKey) {
      graph.setEdge(parentKey, key);
    }
    for (const child of node.children) {
      walk(child, key);
    }
  };

  for (const root of roots) {
    walk(root);
  }

  dagre.layout(graph);

  const nodes = graph.nodes().map((key) => {
    const position = graph.node(key);
    return {
      id: key,
      type: "flow",
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
      data: byKey.get(key)!,
    } satisfies Node<FlowCardData>;
  });

  const edges = graph.edges().map((edge) => ({
    id: `${edge.v}->${edge.w}`,
    source: edge.v,
    target: edge.w,
    type: "smoothstep",
  })) satisfies Edge[];

  return { nodes, edges };
}

type FlowGraphProps = {
  roots: FlowNode[];
  /** The queue the graph was opened from — nodes in other queues get labeled. */
  sourceQueueName: string;
  onSelectNode: (node: FlowNode) => void;
};

export function FlowGraph({
  roots,
  sourceQueueName,
  onSelectNode,
}: FlowGraphProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { nodes, edges } = useMemo(
    () => layoutGraph(roots, sourceQueueName),
    [roots, sourceQueueName],
  );

  return (
    <ReactFlow
      className="dash-flow__canvas"
      colorMode={theme}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_event, node) =>
        onSelectNode((node.data as FlowCardData).flowNode)
      }
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        const nodeId = (event.target as HTMLElement).closest<HTMLElement>(
          ".react-flow__node",
        )?.dataset.id;
        const node = nodeId ? nodes.find((entry) => entry.id === nodeId) : undefined;
        if (node) {
          event.preventDefault();
          onSelectNode((node.data as FlowCardData).flowNode);
        }
      }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.2}
      maxZoom={2.5}
      fitView
      fitViewOptions={{ padding: 0.1, minZoom: 0.7 }}
      proOptions={{ hideAttribution: true }}
      aria-label={t("FLOW.GRAPH_ARIA")}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
