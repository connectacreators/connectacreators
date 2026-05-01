import React, { useState, useEffect } from 'react';
import { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';

interface NodeConfigPanelProps {
  node: Node;
  onUpdate: (data: any) => void;
  onDelete: () => void;
  clientId: string;
}

export function NodeConfigPanel({ node, onUpdate, onDelete }: NodeConfigPanelProps) {
  const [localData, setLocalData] = useState<any>(node.data || {});

  useEffect(() => {
    setLocalData(node.data || {});
  }, [node.id]);

  const set = (key: string, value: any) => {
    const next = { ...localData, [key]: value };
    setLocalData(next);
    onUpdate(next);
  };

  const nodeType = node.type;

  return (
    <div className="text-sm text-white space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-200">Configure Node</h3>
        <button
          onClick={onDelete}
          className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition-colors"
          title="Delete node"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Label — common to all types */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Label</label>
        <input
          type="text"
          value={localData.label || ''}
          onChange={(e) => set('label', e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      {/* TriggerNode config */}
      {nodeType === 'triggerNode' && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Trigger Type</label>
          <select
            value={localData.trigger_type || 'facebook_lead'}
            onChange={(e) => set('trigger_type', e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="facebook_lead">Facebook Lead</option>
            <option value="new_lead">Any New Lead</option>
            <option value="manual">Manual Trigger</option>
          </select>
        </div>
      )}

      {/* ActionNode config */}
      {nodeType === 'actionNode' && (
        <>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Action Type</label>
            <select
              value={localData.action_type || 'send_email'}
              onChange={(e) => set('action_type', e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="send_email">Send Email</option>
              <option value="send_sms">Send SMS</option>
              <option value="wait">Wait</option>
              <option value="update_lead_status">Update Lead Status</option>
              <option value="create_lead_record">Create Lead Record</option>
              <option value="mark_as_ghosted">Mark as Ghosted</option>
            </select>
          </div>

          {(localData.action_type === 'send_email' || localData.action_type === 'send_sms') && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use_ai"
                checked={!!localData.use_ai}
                onChange={(e) => set('use_ai', e.target.checked)}
                className="rounded"
              />
              <label htmlFor="use_ai" className="text-xs text-gray-300 cursor-pointer">
                AI-generated message
              </label>
            </div>
          )}

          {localData.action_type === 'wait' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Amount</label>
                <input
                  type="number"
                  min={1}
                  value={localData.wait_amount || 1}
                  onChange={(e) => set('wait_amount', parseInt(e.target.value, 10))}
                  className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Unit</label>
                <select
                  value={localData.wait_unit || 'minutes'}
                  onChange={(e) => set('wait_unit', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>
          )}

          {localData.action_type === 'update_lead_status' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">New Status</label>
              <select
                value={localData.new_status || 'contacted'}
                onChange={(e) => set('new_status', e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="New Lead">New Lead</option>
                <option value="contacted">Contacted</option>
                <option value="Interested">Interested</option>
                <option value="Booked">Booked</option>
                <option value="Not Interested">Not Interested</option>
              </select>
            </div>
          )}
        </>
      )}

      {/* ConditionNode config */}
      {nodeType === 'conditionNode' && (
        <>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Condition Field</label>
            <select
              value={localData.condition_field || 'lead.booked'}
              onChange={(e) => set('condition_field', e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="lead.booked">Lead Booked</option>
              <option value="lead.replied">Lead Replied</option>
              <option value="lead.stopped">Lead Stopped</option>
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-green-400 mb-1">Yes Label</label>
              <input
                type="text"
                value={localData.yes_label || 'Yes'}
                onChange={(e) => set('yes_label', e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-red-400 mb-1">No Label</label>
              <input
                type="text"
                value={localData.no_label || 'No'}
                onChange={(e) => set('no_label', e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
          </div>
        </>
      )}

      <div className="pt-2 border-t border-white/10">
        <p className="text-xs text-gray-500">Node ID: {node.id}</p>
      </div>
    </div>
  );
}
