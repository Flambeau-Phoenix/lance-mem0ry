import React, { useState, useEffect } from 'react';
import { LanceMemoryRecord, ProjectPartition, EntityType } from '../types';
import { X, Sparkles, Shield, Cpu, Tag, AlertCircle } from 'lucide-react';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<LanceMemoryRecord>) => void;
  project: ProjectPartition | null;
  initialMemory?: LanceMemoryRecord | null;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  project,
  initialMemory,
}) => {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [symbol, setSymbol] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('General');
  const [verified, setVerified] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMemory) {
      setText(initialMemory.text);
      setCategory(initialMemory.category);
      setSymbol(initialMemory.symbol || '');
      setEntityType(initialMemory.entity_type || 'General');
      setVerified(initialMemory.verified);
      setTagsInput(initialMemory.tags?.join(', ') || '');
    } else {
      setText('');
      setCategory(project ? Object.keys(project.categories)[0] || 'key_facts' : 'key_facts');
      setSymbol('');
      setEntityType('General');
      setVerified(false);
      setTagsInput('');
    }
    setError(null);
  }, [initialMemory, project, isOpen]);

  if (!isOpen || !project) return null;

  const categories = Object.entries(project.categories);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Memory content is required.');
      return;
    }
    if (!category) {
      setError('Please select an authorized category.');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    onSave({
      text: text.trim(),
      category,
      symbol: symbol.trim(),
      entity_type: entityType,
      verified,
      tags,
    });
    onClose();
  };

  const selectedCat = project.categories[category];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#2b3248] bg-[#121520] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#222736] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                {initialMemory ? 'Edit Memory Record' : 'Add Memory to Partition'}
              </h2>
              <span className="font-mono text-xs text-cyan-400">
                Partition: {project.name}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#1f2434] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Memory Text */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Memory Content / Fact / Blueprint <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe the verified behavior, decision, or working-state update."
              className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-3 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <span className="text-[11px] text-slate-500">
              This content will be vectorized into 768 dimensions using nomic-embed-text upon save.
            </span>
          </div>

          {/* Category Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category <span className="text-rose-400">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                {categories.map(([catName, catDef]) => (
                  <option key={catName} value={catName}>
                    {catName} ({catDef.bucket})
                  </option>
                ))}
              </select>
              {selectedCat && (
                <p className="mt-1 text-[11px] text-slate-400 italic">
                  "{selectedCat.description}"
                </p>
              )}
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Entity Type
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="General">General</option>
                <option value="Rule">Rule (Governance / Constraint)</option>
                <option value="Directive">Directive (Instruction / Blueprint)</option>
                <option value="Hook">Hook (API Event / Packet Binding)</option>
                <option value="UI Element">UI Element (UI Framework Widget / Docking)</option>
                <option value="Protocol">Protocol (System Invariant)</option>
                <option value="Preference">Preference (User / Agent Tuning)</option>
              </select>
            </div>
          </div>

          {/* Code Symbol & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Symbol / Function / API (Optional)
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. EventHandler, UI.pushID"
                className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. imgui, docking, layout"
                className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Verification Guardrail (Fact vs Blueprint) */}
          <div className="rounded-xl border border-[#272e42] bg-[#141824] p-3.5">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="verifiedCheck"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
              />
              <div>
                <label htmlFor="verifiedCheck" className="text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer">
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Mark as Ratified & Verified Fact</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Leave unchecked if this is an unproven WIP draft or ongoing hypothesis (will be stored as a blueprint under <span className="font-mono text-amber-400">state</span> bucket). Check once code has been verified and tested.
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222736]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#2b3248] bg-[#161926] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1d2232] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{initialMemory ? 'Update Memory' : 'Save & Vectorize'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
