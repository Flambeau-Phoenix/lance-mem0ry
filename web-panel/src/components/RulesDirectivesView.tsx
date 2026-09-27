import React, { useState, useMemo } from 'react';
import { LanceMemoryRecord, ProjectPartition, EntityType } from '../types';
import {
  ShieldCheck,
  Clock,
  Plus,
  Trash2,
  Edit3,
  X,
  Sparkles,
  AlertCircle,
  Tag,
  Cpu,
  ArrowRight,
} from 'lucide-react';

interface RulesDirectivesViewProps {
  project: ProjectPartition;
  memories: LanceMemoryRecord[];
  onAddRule: (data: { title: string; type: EntityType; category: string; content: string; verified: boolean }) => Promise<void>;
  onDeleteRule: (recordId: string) => Promise<void>;
  onEditRule: (memory: LanceMemoryRecord) => void;
  onViewDetails: (memory: LanceMemoryRecord) => void;
}

const RULE_ENTITY_TYPES: EntityType[] = ['Rule', 'Directive', 'Preference', 'Hook', 'Protocol'];

export const RulesDirectivesView: React.FC<RulesDirectivesViewProps> = ({
  project,
  memories,
  onAddRule,
  onDeleteRule,
  onEditRule,
  onViewDetails,
}) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleType, setRuleType] = useState<EntityType>('Rule');
  const [ruleCategory, setRuleCategory] = useState('key_facts');
  const [ruleContent, setRuleContent] = useState('');
  const [ruleVerified, setRuleVerified] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<EntityType | 'all'>('all');

  const ruleMemories = useMemo(() => {
    return memories.filter((m) => {
      if (!m || m.status === 'deleted') return false;
      if (!RULE_ENTITY_TYPES.includes(m.entity_type as EntityType)) return false;
      if (filterType !== 'all' && m.entity_type !== filterType) return false;
      return true;
    });
  }, [memories, filterType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleTitle.trim()) {
      setErrorMessage('Rule name is required.');
      return;
    }
    if (!ruleContent.trim()) {
      setErrorMessage('Rule content is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onAddRule({
        title: ruleTitle.trim(),
        type: ruleType,
        category: ruleCategory,
        content: ruleContent.trim(),
        verified: ruleVerified,
      });
      setRuleTitle('');
      setRuleContent('');
      setRuleType('Rule');
      setRuleVerified(true);
      setIsAddOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Rule':
        return 'border-rose-500/40 bg-rose-950/50 text-rose-300';
      case 'Directive':
        return 'border-cyan-500/40 bg-cyan-950/50 text-cyan-300';
      case 'Preference':
        return 'border-violet-500/40 bg-violet-950/50 text-violet-300';
      case 'Hook':
        return 'border-amber-500/40 bg-amber-950/50 text-amber-300';
      case 'Protocol':
        return 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300';
      default:
        return 'border-slate-700 bg-slate-800 text-slate-300';
    }
  };

  const categories = Object.keys(project.categories || {});

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white font-sans">Rules & Mem0 Directives Hub</h2>
            <span className="rounded bg-[#1c202e] px-2 py-0.5 text-xs font-mono text-cyan-300 border border-cyan-500/30">
              {ruleMemories.length} Active
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed max-w-2xl">
            Behavioral guidelines, operational rules, and directives currently enforced across agents.
            These records have entity_type in: Rule, Directive, Preference, Hook, Protocol.
          </p>
        </div>

        <button
          onClick={() => {
            setRuleTitle('');
            setRuleContent('');
            setRuleType('Rule');
            setRuleVerified(true);
            setErrorMessage(null);
            setIsAddOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Rule / Directive</span>
        </button>
      </div>

      {/* Filter by entity type */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono text-slate-500 uppercase">Filter:</span>
        <button
          onClick={() => setFilterType('all')}
          className={`rounded px-2.5 py-1 text-[11px] font-mono transition-colors ${
            filterType === 'all'
              ? 'bg-[#23293c] text-white font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All Types
        </button>
        {RULE_ENTITY_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`rounded px-2.5 py-1 text-[11px] font-mono transition-colors ${
              filterType === type
                ? 'bg-[#23293c] text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Rules List */}
      {ruleMemories.length > 0 ? (
        <div className="space-y-3">
          {ruleMemories.map((rule) => (
            <div
              key={rule.record_id}
              className="group rounded-xl border border-[#232839] bg-[#121520] p-4 transition-all hover:border-cyan-500/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider ${getTypeBadge(rule.entity_type)}`}>
                      {rule.entity_type}
                    </span>
                    <span className="rounded bg-[#161a27] px-2 py-0.5 text-[11px] font-mono text-slate-300 border border-[#242a3e]">
                      {rule.category}
                    </span>
                    {rule.verified ? (
                      <span className="flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-300">
                        <ShieldCheck className="h-3 w-3" />
                        <span>Enforced</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-300">
                        <Clock className="h-3 w-3" />
                        <span>Draft</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-white font-sans mb-1">
                    {rule.symbol || rule.entity_type}
                  </h3>

                  <p className="text-xs text-slate-300 font-sans leading-relaxed line-clamp-3">
                    {rule.text}
                  </p>

                  {rule.tags && rule.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Tag className="h-3 w-3 text-slate-500" />
                      {rule.tags.slice(0, 4).map((tag, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-[#181c2b] px-1.5 py-0.5 font-mono text-[10px] text-slate-400 border border-[#23293c]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 text-[10px] font-mono text-slate-500">
                    ID: {rule.record_id.slice(0, 12)}... · Updated: {new Date(rule.updated_at || rule.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => onViewDetails(rule)}
                    className="rounded p-1.5 text-slate-400 hover:bg-[#202536] hover:text-white transition-colors"
                    title="View details"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onEditRule(rule)}
                    className="rounded p-1.5 text-slate-400 hover:bg-[#202536] hover:text-cyan-300 transition-colors"
                    title="Edit rule"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteRule(rule.record_id)}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#232839] bg-[#111420] p-12 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-300">No rules or directives found</p>
          <p className="mt-1 text-xs text-slate-500">
            Records with entity_type Rule, Directive, Preference, Hook, or Protocol will appear here.
          </p>
          <button
            onClick={() => setIsAddOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add First Rule</span>
          </button>
        </div>
      )}

      {/* Add Rule Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#2b334a] bg-[#121520] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222736] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-sans">Add Rule / Directive</h3>
                  <span className="text-[11px] text-slate-400">Enforce behavioral guidelines across agents</span>
                </div>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-[#1f2434] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Rule Name / Invariant <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder="e.g. NEVER_COMMIT_SECRETS"
                  className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Rule Classification</label>
                  <select
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value as EntityType)}
                    className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {RULE_ENTITY_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={ruleCategory}
                    onChange={(e) => setRuleCategory(e.target.value)}
                    className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Rule Description / Directive <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={ruleContent}
                  onChange={(e) => setRuleContent(e.target.value)}
                  placeholder="Define the strict behavior or persistent rule for your agent..."
                  className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-[#272e42] bg-[#141824] p-3.5">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="ruleVerifiedCheck"
                    checked={ruleVerified}
                    onChange={(e) => setRuleVerified(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div>
                    <label htmlFor="ruleVerifiedCheck" className="text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      <span>High Priority / Enforced</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Check if this rule is currently enforced and should be treated as a hard constraint by agents.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#222736]">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="rounded-lg border border-[#282e42] bg-[#161926] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-[#1c2030]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? 'Saving...' : 'Enforce & Save Rule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
