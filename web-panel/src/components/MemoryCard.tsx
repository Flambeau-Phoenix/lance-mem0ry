import React from 'react';
import { LanceMemoryRecord } from '../types';
import { Check, Copy, Tag, CheckCircle, Clock, ShieldCheck, Sparkles, Archive, Edit3, Trash2 } from 'lucide-react';

interface MemoryCardProps {
  memory: LanceMemoryRecord;
  onPromote: (recordId: string) => void;
  onEdit: (memory: LanceMemoryRecord) => void;
  onArchive: (recordId: string) => void;
  onDelete: (recordId: string) => void;
  onViewDetails: (memory: LanceMemoryRecord) => void;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({
  memory,
  onPromote,
  onEdit,
  onArchive,
  onDelete,
  onViewDetails,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyText = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(memory.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // High-contrast semantic bucket styling
  const getBucketStyle = (bucket: string) => {
    switch (bucket) {
      case 'fact':
        return 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300';
      case 'decision':
        return 'border-violet-500/40 bg-violet-950/50 text-violet-300';
      case 'state':
        return 'border-amber-500/40 bg-amber-950/50 text-amber-300';
      default:
        return 'border-slate-700 bg-slate-800 text-slate-300';
    }
  };

  return (
    <div
      onClick={() => onViewDetails(memory)}
      className="group relative rounded-xl border border-[#232839] bg-[#121520] p-4 transition-all duration-200 hover:border-cyan-500/50 hover:bg-[#151926] hover:shadow-xl cursor-pointer"
    >
      {/* Top row: Category, Bucket, Verification status, and Entity Type */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category pill */}
          <span className="rounded-md border border-[#2b3248] bg-[#1a1e2d] px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-200">
            {memory.category}
          </span>

          {/* Semantic Bucket */}
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider ${getBucketStyle(memory.bucket)}`}>
            {memory.bucket}
          </span>

          {/* Entity Type */}
          {memory.entity_type && (
            <span className="rounded border border-slate-700/60 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              {memory.entity_type}
            </span>
          )}
        </div>

        {/* Verification Pill */}
        <div className="flex items-center gap-1.5">
          {memory.verified ? (
            <div className="flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-300">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span>Ratified Fact</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-300">
              <Clock className="h-3 w-3 text-amber-400" />
              <span>WIP Blueprint</span>
            </div>
          )}
        </div>
      </div>

      {/* Symbol highlight if exists */}
      {memory.symbol && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded border border-cyan-500/20 bg-cyan-950/30 px-2 py-0.5 font-mono text-xs text-cyan-300">
          <span className="text-[10px] text-cyan-500 uppercase font-bold">Symbol:</span>
          <span>{memory.symbol}</span>
        </div>
      )}

      {/* Memory Text */}
      <p className="text-sm font-sans text-slate-200 leading-relaxed line-clamp-3">
        {memory.text}
      </p>

      {/* Tags */}
      {memory.tags && memory.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Tag className="h-3 w-3 text-slate-500 shrink-0" />
          {memory.tags.slice(0, 5).map((tag, idx) => (
            <span
              key={idx}
              className="rounded bg-[#181c2b] px-1.5 py-0.5 font-mono text-[10px] text-slate-400 border border-[#23293c]"
            >
              #{tag}
            </span>
          ))}
          {memory.tags.length > 5 && (
            <span className="text-[10px] text-slate-500 font-mono">+{memory.tags.length - 5}</span>
          )}
        </div>
      )}

      {/* Bottom Footer: Agent attribution, timestamp, and Quick Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between border-t border-[#1e2333] pt-2.5 text-[11px] text-slate-500 font-mono">
        <div className="flex items-center gap-3">
          <span>{new Date(memory.updated_at).toLocaleDateString()}</span>
          {memory.agent_id && (
            <span className="truncate max-w-[130px] text-slate-400">
              by @{memory.agent_id}
            </span>
          )}
          {memory.access_count !== undefined && memory.access_count > 0 && (
            <span className="text-cyan-400/80">{memory.access_count} calls</span>
          )}
        </div>

        {/* Card Actions */}
        <div className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {/* Promote Blueprint Button */}
          {!memory.verified && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPromote(memory.record_id);
              }}
              className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-colors"
              title="Promote verified blueprint to ratified fact"
            >
              <Sparkles className="h-3 w-3" />
              <span>Promote</span>
            </button>
          )}

          {/* Copy text */}
          <button
            onClick={handleCopyText}
            className="rounded p-1 text-slate-400 hover:bg-[#202536] hover:text-slate-200 transition-colors"
            title="Copy memory content"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          {/* Edit */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(memory);
            }}
            className="rounded p-1 text-slate-400 hover:bg-[#202536] hover:text-slate-200 transition-colors"
            title="Edit memory"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>

          {/* Archive */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive(memory.record_id);
            }}
            className="rounded p-1 text-slate-400 hover:bg-[#202536] hover:text-amber-400 transition-colors"
            title="Archive memory"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>

          {/* Delete */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(memory.record_id);
            }}
            className="rounded p-1 text-slate-400 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
            title="Delete memory"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
