import React, { useState } from 'react';
import { LanceMemoryRecord, ProjectPartition } from '../types';
import { X, Copy, Check, ShieldCheck, Clock, Tag, Cpu, Sparkles, Terminal, FileText } from 'lucide-react';

interface MemoryDetailsModalProps {
  memory: LanceMemoryRecord | null;
  project: ProjectPartition | null;
  onClose: () => void;
  onPromote: (recordId: string) => void;
  onEdit: (memory: LanceMemoryRecord) => void;
}

export const MemoryDetailsModal: React.FC<MemoryDetailsModalProps> = ({
  memory,
  project,
  onClose,
  onPromote,
  onEdit,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!memory || !project) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const estimatedTokens = Math.ceil(memory.text.length / 3.8);

  // Agent Context Injection simulation string
  const agentContextString = `## LanceMemory Recall [${memory.category}]
- Symbol: ${memory.symbol || 'N/A'}
- EntityType: ${memory.entity_type || 'General'}
- Status: ${memory.verified ? 'RATIFIED FACT (Proven)' : 'WIP BLUEPRINT (Pending Verification)'}
- Provenance: ${memory.source_ref} (${memory.agent_id})
- Content:
${memory.text}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-[#2d344d] bg-[#111420] p-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#212638] pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono text-xs font-bold">
              768
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-cyan-300">
                  {memory.symbol || memory.category}
                </span>
                {memory.verified ? (
                  <span className="flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono text-emerald-300 font-bold">
                    <ShieldCheck className="h-3 w-3" /> Ratified Fact
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono text-amber-300 font-bold">
                    <Clock className="h-3 w-3" /> WIP Blueprint
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Record ID: {memory.record_id}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1c2130] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto space-y-5 py-4 pr-1 text-xs">
          {/* Main Memory Text Card */}
          <div className="rounded-xl border border-[#242b3d] bg-[#141825] p-4">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-2 border-b border-[#1f2434]">
              <span className="font-bold text-white font-sans">Primary Memory Payload</span>
              <button
                onClick={() => copyToClipboard(memory.text, 'text')}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
              >
                {copiedField === 'text' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>Copy Content</span>
              </button>
            </div>
            <p className="mt-2.5 text-sm font-sans text-slate-100 leading-relaxed select-text">
              {memory.text}
            </p>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-[#202638] bg-[#141824] p-2.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Category</span>
              <div className="mt-1 font-mono font-bold text-cyan-400 truncate">{memory.category}</div>
            </div>
            <div className="rounded-lg border border-[#202638] bg-[#141824] p-2.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Bucket</span>
              <div className="mt-1 font-mono font-bold text-violet-400 uppercase">{memory.bucket}</div>
            </div>
            <div className="rounded-lg border border-[#202638] bg-[#141824] p-2.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Entity Type</span>
              <div className="mt-1 font-mono font-bold text-slate-200">{memory.entity_type || 'General'}</div>
            </div>
            <div className="rounded-lg border border-[#202638] bg-[#141824] p-2.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Est. Tokens</span>
              <div className="mt-1 font-mono font-bold text-emerald-400">~{estimatedTokens} tok</div>
            </div>
          </div>

          {/* Category Description Context Box */}
          {project.categories[memory.category] && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3">
              <span className="text-[11px] font-mono font-semibold text-violet-300">
                Authoritative Category Context ({memory.category}):
              </span>
              <p className="mt-1 text-xs text-slate-300 font-sans leading-relaxed">
                {project.categories[memory.category].description}
              </p>
            </div>
          )}

          {/* "What Does the Agent See?" Context Window Simulator */}
          <div className="rounded-xl border border-[#242b3d] bg-[#0c0e15] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
                <Terminal className="h-3.5 w-3.5" />
                <span>Agent Prompt Injection Simulator (Exact Recall Text)</span>
              </span>
              <button
                onClick={() => copyToClipboard(agentContextString, 'agentContext')}
                className="flex items-center gap-1 text-slate-400 hover:text-white"
              >
                {copiedField === 'agentContext' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>Copy Markdown</span>
              </button>
            </div>
            <pre className="overflow-x-auto rounded bg-[#131620] p-3 text-[11px] font-mono text-slate-300 border border-[#1f2434] leading-relaxed">
              {agentContextString}
            </pre>
          </div>

          {/* Vector Embedding Preview (Numpy/PyArrow 768-dim) */}
          <div className="rounded-xl border border-[#242b3d] bg-[#141825] p-3.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-1.5 border-b border-[#1f2434]">
              <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                <span>768-Dimensional nomic-embed-text Vector Preview</span>
              </span>
              <span className="text-[10px] text-cyan-400">
                Float32 Unit Vector (Norm = 1.0)
              </span>
            </div>
            <p className="mt-2 text-[11px] font-mono text-slate-400 break-all leading-relaxed bg-[#0e1017] p-2.5 rounded border border-[#1c202e]">
              [
              {memory.vector ? memory.vector.slice(0, 8).map(v => v.toFixed(6)).join(', ') : '-0.059673, 0.011686, 0.039323, -0.008609, 0.033466, 0.017536, ...'}
              , ... 760 more float32 dimensions]
            </p>
          </div>

          {/* System Provenance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] font-mono text-slate-400 bg-[#0d101a] p-3 rounded-lg border border-[#1d2232]">
            <div>
              <span className="text-slate-500">Agent Persona:</span> {memory.agent_id}
            </div>
            <div>
              <span className="text-slate-500">Session Run ID:</span> {memory.run_id}
            </div>
            <div>
              <span className="text-slate-500">Created:</span> {new Date(memory.created_at).toLocaleString()}
            </div>
            <div>
              <span className="text-slate-500">Source Ref:</span> {memory.source_ref}
            </div>
            <div className="sm:col-span-2 flex items-center gap-1.5 pt-1 border-t border-[#1a1f2e]">
              <span className="text-slate-500">Target Codebase Folder:</span>
              <span className="text-cyan-300 font-semibold truncate">{project.folder_path || `/workspace/${project.id}`}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#212638] pt-4 shrink-0">
          <div>
            {!memory.verified && (
              <button
                onClick={() => {
                  onPromote(memory.record_id);
                  onClose();
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Promote Blueprint to Verified Fact</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onEdit(memory);
                onClose();
              }}
              className="rounded-lg border border-[#2b334a] bg-[#161a27] px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-[#1d2234]"
            >
              Edit Details
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
