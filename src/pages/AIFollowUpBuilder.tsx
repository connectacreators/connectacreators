import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  useReactFlow,
  useOnSelectionChange,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronLeft, Save, Play } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { TriggerNode } from '../components/followup/nodes/TriggerNode';
import { ActionNode } from '../components/followup/nodes/ActionNode';
import { ConditionNode } from '../components/followup/nodes/ConditionNode';
import { NodeConfigPanel } from '../components/followup/panels/NodeConfigPanel';
import { NodeToolbar } from '../components/followup/panels/NodeToolbar';
import { toast } from 'sonner';
import PageTransition from "@/components/PageTransition";

const DEFAULT_NODES: Node[] = [
  { id: 'trigger_1', type: 'triggerNode', position: { x: 50, y: 300 }, data: { label: 'New Facebook Lead', trigger_type: 'facebook_lead' } },
  { id: 'action_create', type: 'actionNode', position: { x: 280, y: 300 }, data: { label: 'Create Lead Record', action_type: 'create_lead_record' } },
  { id: 'action_status', type: 'actionNode', position: { x: 510, y: 300 }, data: { label: 'Update Lead Status', action_type: 'update_lead_status', new_status: 'contacted' } },
  { id: 'action_email1', type: 'actionNode', position: { x: 740, y: 300 }, data: { label: 'Send Email', action_type: 'send_email', use_ai: true } },
  { id: 'action_sms1', type: 'actionNode', position: { x: 970, y: 300 }, data: { label: 'Send SMS', action_type: 'send_sms', use_ai: true } },
  { id: 'action_wait1', type: 'actionNode', position: { x: 1200, y: 300 }, data: { label: 'Wait 5 Min', action_type: 'wait', wait_unit: 'minutes', wait_amount: 5 } },
  { id: 'cond_1', type: 'conditionNode', position: { x: 1430, y: 300 }, data: { label: 'Lead Booked?', condition_field: 'lead.booked', operator: 'is_true', yes_label: 'Booked', no_label: 'Not Booked' } },
  { id: 'action_conf_email', type: 'actionNode', position: { x: 1660, y: 100 }, data: { label: 'Confirmation Email', action_type: 'send_confirmation_email' } },
  { id: 'action_conf_sms', type: 'actionNode', position: { x: 1900, y: 100 }, data: { label: 'Confirmation SMS', action_type: 'send_confirmation_sms' } },
  { id: 'action_wait_1hr', type: 'actionNode', position: { x: 2140, y: 100 }, data: { label: '1 HR Before Event', action_type: 'wait', wait_unit: 'hours', wait_amount: 1 } },
  { id: 'action_reminder_sms', type: 'actionNode', position: { x: 2380, y: 100 }, data: { label: 'Reminder SMS', action_type: 'send_reminder_sms' } },
  { id: 'action_reminder_email', type: 'actionNode', position: { x: 2620, y: 100 }, data: { label: 'Reminder Email', action_type: 'send_reminder_email' } },
  { id: 'action_fu_sms_1', type: 'actionNode', position: { x: 1660, y: 480 }, data: { label: 'Follow Up SMS', action_type: 'send_sms', use_ai: true } },
  { id: 'action_fu_email_1', type: 'actionNode', position: { x: 1900, y: 480 }, data: { label: 'Follow Up Email', action_type: 'send_email', use_ai: true } },
  { id: 'action_wait_2hr', type: 'actionNode', position: { x: 2140, y: 480 }, data: { label: 'Wait 2 Hrs', action_type: 'wait', wait_unit: 'hours', wait_amount: 2 } },
  { id: 'cond_2', type: 'conditionNode', position: { x: 2380, y: 480 }, data: { label: 'Lead Booked?', condition_field: 'lead.booked', operator: 'is_true', yes_label: 'Booked', no_label: 'Still No' } },
  { id: 'action_fu_sms_2', type: 'actionNode', position: { x: 2620, y: 640 }, data: { label: 'Follow Up SMS', action_type: 'send_sms', use_ai: true } },
  { id: 'action_fu_email_2', type: 'actionNode', position: { x: 2860, y: 640 }, data: { label: 'Follow Up Email', action_type: 'send_email', use_ai: true } },
  { id: 'action_wait_12hr', type: 'actionNode', position: { x: 3100, y: 640 }, data: { label: 'Wait 12 Hrs', action_type: 'wait', wait_unit: 'hours', wait_amount: 12 } },
  { id: 'cond_3', type: 'conditionNode', position: { x: 3340, y: 640 }, data: { label: 'Lead Booked?', condition_field: 'lead.booked', operator: 'is_true', yes_label: 'Booked', no_label: 'Still No' } },
  { id: 'action_fu_sms_3', type: 'actionNode', position: { x: 3580, y: 800 }, data: { label: 'Follow Up SMS', action_type: 'send_sms', use_ai: true } },
  { id: 'action_fu_email_3', type: 'actionNode', position: { x: 3820, y: 800 }, data: { label: 'Follow Up Email', action_type: 'send_email', use_ai: true } },
  { id: 'action_wait_24hr', type: 'actionNode', position: { x: 4060, y: 800 }, data: { label: 'Wait 24 Hrs', action_type: 'wait', wait_unit: 'hours', wait_amount: 24 } },
  { id: 'cond_4', type: 'conditionNode', position: { x: 4300, y: 800 }, data: { label: 'Lead Booked?', condition_field: 'lead.booked', operator: 'is_true', yes_label: 'Booked', no_label: 'Still No' } },
  { id: 'action_fu_sms_4', type: 'actionNode', position: { x: 4540, y: 960 }, data: { label: 'Follow Up SMS', action_type: 'send_sms', use_ai: true } },
  { id: 'action_fu_email_4', type: 'actionNode', position: { x: 4780, y: 960 }, data: { label: 'Follow Up Email', action_type: 'send_email', use_ai: true } },
  { id: 'action_ghosted', type: 'actionNode', position: { x: 5020, y: 960 }, data: { label: 'Mark as Ghosted', action_type: 'mark_as_ghosted' } },
];

const DEFAULT_EDGES: Edge[] = [
  { id: 'e1', source: 'trigger_1', target: 'action_create', animated: true },
  { id: 'e2', source: 'action_create', target: 'action_status' },
  { id: 'e3', source: 'action_status', target: 'action_email1' },
  { id: 'e4', source: 'action_email1', target: 'action_sms1' },
  { id: 'e5', source: 'action_sms1', target: 'action_wait1' },
  { id: 'e6', source: 'action_wait1', target: 'cond_1' },
  { id: 'e7', source: 'cond_1', sourceHandle: 'yes', target: 'action_conf_email' },
  { id: 'e8', source: 'action_conf_email', target: 'action_conf_sms' },
  { id: 'e9', source: 'action_conf_sms', target: 'action_wait_1hr' },
  { id: 'e10', source: 'action_wait_1hr', target: 'action_reminder_sms' },
  { id: 'e11', source: 'action_reminder_sms', target: 'action_reminder_email' },
  { id: 'e12', source: 'cond_1', sourceHandle: 'no', target: 'action_fu_sms_1' },
  { id: 'e13', source: 'action_fu_sms_1', target: 'action_fu_email_1' },
  { id: 'e14', source: 'action_fu_email_1', target: 'action_wait_2hr' },
  { id: 'e15', source: 'action_wait_2hr', target: 'cond_2' },
  { id: 'e16', source: 'cond_2', sourceHandle: 'no', target: 'action_fu_sms_2' },
  { id: 'e17', source: 'action_fu_sms_2', target: 'action_fu_email_2' },
  { id: 'e18', source: 'action_fu_email_2', target: 'action_wait_12hr' },
  { id: 'e19', source: 'action_wait_12hr', target: 'cond_3' },
  { id: 'e20', source: 'cond_3', sourceHandle: 'no', target: 'action_fu_sms_3' },
  { id: 'e21', source: 'action_fu_sms_3', target: 'action_fu_email_3' },
  { id: 'e22', source: 'action_fu_email_3', target: 'action_wait_24hr' },
  { id: 'e23', source: 'action_wait_24hr', target: 'cond_4' },
  { id: 'e24', source: 'cond_4', sourceHandle: 'no', target: 'action_fu_sms_4' },
  { id: 'e25', source: 'action_fu_sms_4', target: 'action_fu_email_4' },
  { id: 'e26', source: 'action_fu_email_4', target: 'action_ghosted' },
];

const nodeTypes = {
  triggerNode: TriggerNode,
  actionNode: ActionNode,
  conditionNode: ConditionNode,
};

// All logic lives here — inside ReactFlowProvider context
function FollowUpCanvas({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState('Follow-Up Workflow');
  const [isActive, setIsActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWorkflow();
  }, [clientId]);

  const loadWorkflow = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('followup_workflows')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setWorkflowName(data.name);
        setNodes((data.nodes as Node[]) || DEFAULT_NODES);
        setEdges((data.edges as Edge[]) || DEFAULT_EDGES);
        setIsActive(data.is_active || false);
      } else {
        setNodes(DEFAULT_NODES);
        setEdges(DEFAULT_EDGES);
      }
    } catch (err) {
      console.error('Failed to load workflow:', err);
      toast.error('Failed to load workflow');
      setNodes(DEFAULT_NODES);
      setEdges(DEFAULT_EDGES);
    } finally {
      setIsLoading(false);
    }
  };

  const saveWorkflow = async () => {
    setIsSaving(true);
    try {
      const viewport = reactFlowInstance.getViewport();
      const cleanNodes = nodes.map(({ selected, dragging, ...node }) => node);

      const { error } = await supabase
        .from('followup_workflows')
        .upsert(
          { client_id: clientId, name: workflowName, nodes: cleanNodes, edges, viewport, is_active: isActive },
          { onConflict: 'client_id' }
        );

      if (error) throw error;
      toast.success('Workflow saved!');
    } catch (err) {
      console.error('Failed to save workflow:', err);
      toast.error('Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, id: `e-${Date.now()}`, animated: true }, eds));
    },
    [setEdges]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow-nodetype');
      const label = event.dataTransfer.getData('node-label') || 'New Node';
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: {
          label,
          action_type: type === 'actionNode' ? 'send_email' : undefined,
          trigger_type: type === 'triggerNode' ? 'facebook_lead' : undefined,
          condition_field: type === 'conditionNode' ? 'lead.booked' : undefined,
        },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  useOnSelectionChange({
    onChange: ({ nodes: sel }) => {
      setSelectedNode(sel.length === 1 ? sel[0] : null);
    },
  });

  const handleUpdateNode = (newData: any) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: newData } : n)));
    setSelectedNode((prev) => (prev ? { ...prev, data: newData } : null));
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-white/10 bg-white/5 flex-shrink-0">
        <button
          onClick={() => navigate(`/clients/${clientId}`)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ChevronLeft size={18} />
          Back
        </button>

        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="bg-white/10 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-56"
          placeholder="Workflow name"
        />

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <div
              className={`w-9 h-5 rounded-full transition-colors relative ${isActive ? 'bg-green-500' : 'bg-white/20'}`}
              onClick={() => setIsActive((v) => !v)}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className={isActive ? 'text-green-400' : 'text-gray-400'}>{isActive ? 'Active' : 'Inactive'}</span>
          </label>

          <button
            onClick={saveWorkflow}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/80 hover:bg-green-600 rounded text-sm font-medium transition-colors">
            <Play size={14} />
            Test Run
          </button>
        </div>
      </div>

      {/* Canvas + config panel */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 animate-pulse">Loading workflow...</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="rgba(255,255,255,0.08)" />
              <Controls />
              <MiniMap position="bottom-right" nodeColor="#1e293b" maskColor="rgba(0,0,0,0.6)" />
            </ReactFlow>
          </div>

          {selectedNode && (
            <div className="w-80 flex-shrink-0 overflow-y-auto border-l border-white/10 bg-white/5 p-4">
              <NodeConfigPanel node={selectedNode} onUpdate={handleUpdateNode} onDelete={handleDeleteNode} clientId={clientId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Outer wrapper — provides ReactFlowProvider context, then renders FollowUpCanvas
export default function AIFollowUpBuilder() {
  const { clientId } = useParams<{ clientId: string }>();
  if (!clientId) return null;

  return (
    <PageTransition className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <NodeToolbar onDragStart={(e, type) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/reactflow-nodetype', type);
      }} />
      <ReactFlowProvider>
        <div className="flex-1 overflow-hidden">
          <FollowUpCanvas clientId={clientId} />
        </div>
      </ReactFlowProvider>
    </PageTransition>
  );
}
