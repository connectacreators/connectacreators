import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';

const triggerLabels: Record<string, string> = {
  facebook_lead: 'Facebook Lead',
  manual: 'Manual Trigger',
  new_lead: 'New Lead',
};

export function TriggerNode({ data, selected }: NodeProps) {
  const label = (data as any).label || 'Trigger';
  const triggerType = (data as any).trigger_type || 'facebook_lead';

  return (
    <div
      className={`min-w-[160px] rounded-lg border-2 bg-purple-950/80 backdrop-blur-sm shadow-lg transition-all ${
        selected ? 'border-purple-400 shadow-purple-400/30' : 'border-purple-600/60'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-600/30">
        <Zap size={12} className="text-purple-300 flex-shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-purple-300">Trigger</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-white leading-tight">{label}</p>
        <p className="text-xs text-purple-300 mt-0.5">{triggerLabels[triggerType] || triggerType}</p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-purple-700"
      />
    </div>
  );
}
