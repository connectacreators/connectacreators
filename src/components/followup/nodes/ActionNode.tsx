import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Mail, MessageSquare, Clock, Tag, Bot, CheckSquare } from 'lucide-react';

const actionIcons: Record<string, React.ReactNode> = {
  send_email: <Mail size={12} />,
  send_sms: <MessageSquare size={12} />,
  send_confirmation_email: <Mail size={12} />,
  send_confirmation_sms: <MessageSquare size={12} />,
  send_reminder_sms: <MessageSquare size={12} />,
  send_reminder_email: <Mail size={12} />,
  wait: <Clock size={12} />,
  update_lead_status: <Tag size={12} />,
  create_lead_record: <CheckSquare size={12} />,
  mark_as_ghosted: <CheckSquare size={12} />,
};

const actionColors: Record<string, string> = {
  send_email: 'border-blue-600/60 bg-blue-950/80',
  send_sms: 'border-green-600/60 bg-green-950/80',
  send_confirmation_email: 'border-blue-600/60 bg-blue-950/80',
  send_confirmation_sms: 'border-green-600/60 bg-green-950/80',
  send_reminder_sms: 'border-green-600/60 bg-green-950/80',
  send_reminder_email: 'border-blue-600/60 bg-blue-950/80',
  wait: 'border-amber-600/60 bg-amber-950/80',
  update_lead_status: 'border-cyan-600/60 bg-cyan-950/80',
  create_lead_record: 'border-indigo-600/60 bg-indigo-950/80',
  mark_as_ghosted: 'border-gray-600/60 bg-gray-950/80',
};

const selectedColors: Record<string, string> = {
  send_email: 'border-blue-400 shadow-blue-400/30',
  send_sms: 'border-green-400 shadow-green-400/30',
  send_confirmation_email: 'border-blue-400 shadow-blue-400/30',
  send_confirmation_sms: 'border-green-400 shadow-green-400/30',
  send_reminder_sms: 'border-green-400 shadow-green-400/30',
  send_reminder_email: 'border-blue-400 shadow-blue-400/30',
  wait: 'border-amber-400 shadow-amber-400/30',
  update_lead_status: 'border-cyan-400 shadow-cyan-400/30',
  create_lead_record: 'border-indigo-400 shadow-indigo-400/30',
  mark_as_ghosted: 'border-gray-400 shadow-gray-400/30',
};

export function ActionNode({ data, selected }: NodeProps) {
  const label = (data as any).label || 'Action';
  const actionType: string = (data as any).action_type || 'send_email';
  const useAi = (data as any).use_ai;
  const waitUnit = (data as any).wait_unit;
  const waitAmount = (data as any).wait_amount;

  const baseColor = actionColors[actionType] || 'border-gray-600/60 bg-gray-950/80';
  const selColor = selectedColors[actionType] || 'border-gray-400 shadow-gray-400/30';
  const icon = actionIcons[actionType] || <CheckSquare size={12} />;

  return (
    <div
      className={`min-w-[150px] rounded-lg border-2 backdrop-blur-sm shadow-lg transition-all ${baseColor} ${
        selected ? `${selColor} shadow-md` : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-700"
      />
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-gray-300 mb-1">
          {icon}
          {useAi && <Bot size={10} className="text-indigo-300" />}
        </div>
        <p className="text-sm font-medium text-white leading-tight">{label}</p>
        {waitUnit && waitAmount && (
          <p className="text-xs text-amber-300 mt-0.5">{waitAmount} {waitUnit}</p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-700"
      />
    </div>
  );
}
