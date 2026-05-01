import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export function ConditionNode({ data, selected }: NodeProps) {
  const label = (data as any).label || 'Condition';
  const yesLabel = (data as any).yes_label || 'Yes';
  const noLabel = (data as any).no_label || 'No';

  return (
    <div
      className={`min-w-[160px] rounded-lg border-2 bg-orange-950/80 backdrop-blur-sm shadow-lg transition-all ${
        selected ? 'border-orange-400 shadow-orange-400/30 shadow-md' : 'border-orange-600/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-700"
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-600/30">
        <GitBranch size={12} className="text-orange-300 flex-shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-orange-300">Condition</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-white leading-tight">{label}</p>
      </div>
      {/* Yes handle — top right */}
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{ top: '30%' }}
        className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-700"
      />
      {/* No handle — bottom right */}
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        style={{ top: '70%' }}
        className="!w-3 !h-3 !bg-red-400 !border-2 !border-red-700"
      />
      {/* Labels for handles */}
      <div className="absolute right-[-30px] flex flex-col justify-between h-full top-0 pointer-events-none">
        <span className="text-[9px] text-green-400 font-medium" style={{ marginTop: '22%' }}>{yesLabel}</span>
        <span className="text-[9px] text-red-400 font-medium" style={{ marginBottom: '22%' }}>{noLabel}</span>
      </div>
    </div>
  );
}
