import React from 'react';
import { Zap, Play, GitBranch, Mail, MessageSquare, Clock, Tag } from 'lucide-react';

interface NodeToolbarProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

const nodeItems = [
  {
    category: 'Triggers',
    items: [
      { type: 'triggerNode', label: 'FB Lead Trigger', icon: <Zap size={14} />, color: 'text-purple-300 border-purple-600/50 bg-purple-950/60 hover:bg-purple-900/60' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { type: 'actionNode', label: 'Send Email', icon: <Mail size={14} />, color: 'text-blue-300 border-blue-600/50 bg-blue-950/60 hover:bg-blue-900/60' },
      { type: 'actionNode', label: 'Send SMS', icon: <MessageSquare size={14} />, color: 'text-green-300 border-green-600/50 bg-green-950/60 hover:bg-green-900/60' },
      { type: 'actionNode', label: 'Wait', icon: <Clock size={14} />, color: 'text-amber-300 border-amber-600/50 bg-amber-950/60 hover:bg-amber-900/60' },
      { type: 'actionNode', label: 'Update Status', icon: <Tag size={14} />, color: 'text-cyan-300 border-cyan-600/50 bg-cyan-950/60 hover:bg-cyan-900/60' },
    ],
  },
  {
    category: 'Logic',
    items: [
      { type: 'conditionNode', label: 'Condition', icon: <GitBranch size={14} />, color: 'text-orange-300 border-orange-600/50 bg-orange-950/60 hover:bg-orange-900/60' },
    ],
  },
];

export function NodeToolbar({ onDragStart }: NodeToolbarProps) {
  return (
    <div className="w-48 flex-shrink-0 border-r border-white/10 bg-white/3 overflow-y-auto p-3 space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 px-1">Drag to canvas</p>

      {nodeItems.map((group) => (
        <div key={group.category}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 px-1">
            {group.category}
          </p>
          <div className="space-y-1.5">
            {group.items.map((item) => (
              <div
                key={`${item.type}-${item.label}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('node-label', item.label);
                  onDragStart(e, item.type);
                }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded border cursor-grab active:cursor-grabbing select-none transition-colors ${item.color}`}
              >
                {item.icon}
                <span className="text-xs font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
