import React, { useState } from 'react';
import { X, FolderPlus, Info, Check, AlertCircle, Layers } from 'lucide-react';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (name: string, description: string, folderPath?: string) => Promise<void>;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!description.trim()) {
      setError('Project description is required so entities, agents, and maintenance workflows have context.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreateProject(name.trim(), description.trim(), folderPath.trim() || undefined);
      setName('');
      setDescription('');
      setFolderPath('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to provision project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#2b334a] bg-[#121520] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#222736] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <FolderPlus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-sans">
                Provision New Project Partition
              </h3>
              <span className="text-[11px] text-slate-400">
                Initializes isolated LanceDB dataset, Tantivy FTS index & standard categories
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#1f2434] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Project Partition Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CoreBackend, MobileApp, KnowledgeBase"
              className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500 font-mono">
              Partition ID: {name.trim().replace(/[^a-zA-Z0-9_-]/g, '') || '<id>'}
            </span>
          </div>

          {/* Project Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Project Description (Contextual Purpose) <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail the operational domain, target codebases, APIs, and goals for this partition so agents have context."
              className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Target Project Codebase / Mod Directory */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Target Project Codebase Directory <span className="text-slate-500 font-normal">(Optional)</span></span>
              <span className="text-[10px] font-mono text-cyan-400">Where project code lives</span>
            </label>
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="e.g. /workspace/my-project or /workspace/scripts"
              className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400">
              The codebase or project directory that these memories document (not the LanceDB database directory).
            </span>
          </div>

          {/* Baseline Categories Card */}
          <div className="rounded-xl border border-[#242a3c] bg-[#141825] p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span>Standard Baseline Categories Included:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
              <div className="rounded border border-[#1f2434] bg-[#161b29] p-1.5">
                <span className="text-emerald-400 font-bold">key_facts</span> (fact)
                <p className="text-[10px] font-sans text-slate-400">Ratified facts & verified stable APIs</p>
              </div>
              <div className="rounded border border-[#1f2434] bg-[#161b29] p-1.5">
                <span className="text-violet-400 font-bold">architectural_decisions</span> (decision)
                <p className="text-[10px] font-sans text-slate-400">System design choices & invariants</p>
              </div>
              <div className="rounded border border-[#1f2434] bg-[#161b29] p-1.5">
                <span className="text-amber-400 font-bold">ongoing_tasks</span> (state)
                <p className="text-[10px] font-sans text-slate-400">WIP blueprints & draft hypotheses</p>
              </div>
              <div className="rounded border border-[#1f2434] bg-[#161b29] p-1.5">
                <span className="text-amber-400 font-bold">session_handoff</span> (state)
                <p className="text-[10px] font-sans text-slate-400">Milestones & next action items</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#222736]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#282e42] bg-[#161926] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-[#1c2030]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>{isSubmitting ? 'Provisioning...' : 'Provision Partition'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
