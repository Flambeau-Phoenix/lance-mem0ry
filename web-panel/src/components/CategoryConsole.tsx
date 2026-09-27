import React, { useState } from 'react';
import { ProjectPartition, SemanticBucket } from '../types';
import { Layers, Plus, ArrowRightLeft, Sparkles, Edit2, AlertCircle, Check, Info } from 'lucide-react';

interface CategoryConsoleProps {
  project: ProjectPartition;
  projects: ProjectPartition[];
  onAddCategory: (data: { name: string; description: string; bucket: SemanticBucket }) => Promise<void>;
  onEditCategory: (name: string, data: { newName?: string; description?: string; bucket?: SemanticBucket }) => Promise<void>;
  onMigrateCategory: (data: { target_project_id: string; category: string; mode: 'copy' | 'move' }) => Promise<void>;
}

export const CategoryConsole: React.FC<CategoryConsoleProps> = ({
  project,
  projects,
  onAddCategory,
  onEditCategory,
  onMigrateCategory,
}) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isMigrateOpen, setIsMigrateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  // Form states
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catBucket, setCatBucket] = useState<SemanticBucket>('fact');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Migration states
  const [migrateCategory, setMigrateCategory] = useState('');
  const [migrateTarget, setMigrateTarget] = useState(projects.find(p => p.id !== project.id)?.id || '');
  const [migrateMode, setMigrateMode] = useState<'copy' | 'move'>('copy');

  const categories = Object.entries(project.categories);

  const handleOpenAdd = () => {
    setCatName('');
    setCatDesc('');
    setCatBucket('fact');
    setEditingCategory(null);
    setErrorMessage(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (name: string, desc: string, bucket: SemanticBucket) => {
    setCatName(name);
    setCatDesc(desc);
    setCatBucket(bucket);
    setEditingCategory(name);
    setErrorMessage(null);
    setIsAddOpen(true);
  };

  const handleAiEnhance = async () => {
    if (!catName.trim()) {
      setErrorMessage('Please enter a category name first.');
      return;
    }
    setIsAiGenerating(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/ai/enhance-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_name: catName,
          current_description: catDesc,
        }),
      });
      const data = await res.json();
      if (data.suggestion) {
        setCatDesc(data.suggestion);
      }
    } catch {
      setCatDesc(`Authoritative registry for ${catName.replace(/_/g, ' ')}: verified patterns, API specs, and invariants.`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      setErrorMessage('Category name is required.');
      return;
    }
    if (!catDesc.trim()) {
      setErrorMessage('A clear category description is mandatory so AI agents and users understand the context of what belongs here.');
      return;
    }

    try {
      if (editingCategory) {
        await onEditCategory(editingCategory, {
          newName: catName.trim(),
          description: catDesc.trim(),
          bucket: catBucket,
        });
        setSuccessMessage(`Category "${catName}" updated successfully.`);
      } else {
        await onAddCategory({
          name: catName.trim(),
          description: catDesc.trim(),
          bucket: catBucket,
        });
        setSuccessMessage(`New category "${catName}" registered successfully.`);
      }
      setIsAddOpen(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save category');
    }
  };

  const handleExecuteMigrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!migrateCategory || !migrateTarget) {
      setErrorMessage('Select category and target project.');
      return;
    }

    try {
      await onMigrateCategory({
        category: migrateCategory,
        target_project_id: migrateTarget,
        mode: migrateMode,
      });
      setIsMigrateOpen(false);
      setSuccessMessage(`Category "${migrateCategory}" successfully ${migrateMode === 'copy' ? 'replicated' : 'moved'} to project "${migrateTarget}".`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Migration failed');
    }
  };

  const getBucketBadge = (bucket: string) => {
    switch (bucket) {
      case 'fact':
        return 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300';
      case 'decision':
        return 'border-violet-500/40 bg-violet-950/60 text-violet-300';
      case 'state':
        return 'border-amber-500/40 bg-amber-950/60 text-amber-300';
      default:
        return 'border-slate-700 bg-slate-800 text-slate-300';
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 space-y-6">
      {/* Category Console Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232839] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-bold text-white font-sans">Category Governance Registry</h2>
            <span className="rounded bg-[#1c202e] px-2 py-0.5 text-xs font-mono text-violet-300 border border-violet-500/30">
              {categories.length} Categories in {project.name}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed max-w-2xl">
            Every category must maintain an authoritative description. When agents call FastMCP tools, they inspect these descriptions to autonomously resolve which category a memory maps to.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Cross-Project Migration Button */}
          <button
            onClick={() => {
              setMigrateCategory(categories[0]?.[0] || '');
              setIsMigrateOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-[#2b334a] bg-[#161a27] px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:bg-[#1a2030] transition-colors"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-cyan-400" />
            <span>Cross-Project Migration</span>
          </button>

          {/* Add Category Button */}
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Category</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300 animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Categories Catalog Table */}
      <div className="overflow-hidden rounded-xl border border-[#232839] bg-[#111420] shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#212638] bg-[#141824] text-[11px] font-mono uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Category Name</th>
              <th className="px-4 py-3">Semantic Bucket</th>
              <th className="px-4 py-3">Contextual Description (Required)</th>
              <th className="px-4 py-3 text-right">Records</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2334]">
            {categories.map(([name, catDef]) => (
              <tr key={name} className="hover:bg-[#161a27] transition-colors">
                {/* Category Name */}
                <td className="px-4 py-3.5 font-mono font-bold text-cyan-300">
                  <div className="flex items-center gap-2">
                    <span>{name}</span>
                    {catDef.unregistered && (
                      <span
                        className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                        title="Records use this category but it is not in categories.json. Edit to register it."
                      >
                        <AlertCircle className="h-3 w-3" />
                        unregistered
                      </span>
                    )}
                  </div>
                </td>

                {/* Semantic Bucket */}
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${getBucketBadge(catDef.bucket)}`}>
                    {catDef.bucket}
                  </span>
                </td>

                {/* Description */}
                <td className="px-4 py-3.5 text-slate-300 font-sans leading-relaxed max-w-xl">
                  {catDef.description}
                </td>

                {/* Live Record Count */}
                <td className="px-4 py-3.5 text-right font-mono text-slate-300">
                  <span className="rounded bg-[#1a1f2e] px-2 py-0.5 text-xs text-cyan-400 font-bold border border-[#262c3e]">
                    {catDef.record_count ?? 0}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => handleOpenEdit(name, catDef.description, catDef.bucket)}
                    className="inline-flex items-center gap-1 rounded p-1.5 text-slate-400 hover:bg-[#202638] hover:text-cyan-300 transition-colors"
                    title="Edit category description or rename"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span className="text-[11px]">Edit</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Category Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#2b334a] bg-[#121520] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white font-sans">
              {editingCategory ? `Edit Category: ${editingCategory}` : 'Register New Category'}
            </h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Every category requires an informative description so agents and maintenance workflows know the exact criteria for grouping memories here.
            </p>

            {errorMessage && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Category Identifier <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. verified_imgui_ui_elements"
                  className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Semantic Bucket <span className="text-rose-400">*</span>
                </label>
                <select
                  value={catBucket}
                  onChange={(e) => setCatBucket(e.target.value as SemanticBucket)}
                  className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs font-mono text-slate-200 focus:border-violet-500 focus:outline-none"
                >
                  <option value="fact">fact (Ratified truths, verified code patterns, static APIs)</option>
                  <option value="decision">decision (Architectural choices, invariants, patterns, layouts)</option>
                  <option value="constraint">constraint (Hard invariants, boundaries, prohibitions)</option>
                  <option value="preference">preference (Config choices, style guidelines)</option>
                  <option value="procedure">procedure (Step-by-step workflows, how-to recipes)</option>
                  <option value="state">state (WIP blueprints, hypotheses, session handoffs)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Authoritative Description <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAiEnhance}
                    disabled={isAiGenerating}
                    className="flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>{isAiGenerating ? 'Drafting...' : '✨ AI Generate Description'}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Explain exactly what belongs here to provide clear context for autonomous agents."
                  className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="rounded-lg border border-[#282e42] bg-[#161926] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-[#1c2030]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  {editingCategory ? 'Update Category' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cross-Project Migration Workbench Modal */}
      {isMigrateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#2b334a] bg-[#121520] p-6 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[#222736] pb-3">
              <ArrowRightLeft className="h-5 w-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white font-sans">
                Cross-Project Category Migration & Copy Tool
              </h3>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Replicate or move an entire category and all its vector embeddings from <span className="font-mono text-cyan-400 font-semibold">{project.name}</span> to another partition. LanceDB FTS indices and category definitions will be synchronized automatically.
            </p>

            <form onSubmit={handleExecuteMigrate} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Source Category
                  </label>
                  <select
                    value={migrateCategory}
                    onChange={(e) => setMigrateCategory(e.target.value)}
                    className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {categories.map(([c]) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Target Project Partition
                  </label>
                  <select
                    value={migrateTarget}
                    onChange={(e) => setMigrateTarget(e.target.value)}
                    className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {projects
                      .filter(p => p.id !== project.id)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.total_records} rec)
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Mode: Copy vs Move */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Operation Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer ${migrateMode === 'copy' ? 'border-cyan-500/60 bg-cyan-950/20 text-cyan-300' : 'border-[#262b3c] bg-[#141824] text-slate-400'}`}>
                    <input
                      type="radio"
                      name="migratemode"
                      value="copy"
                      checked={migrateMode === 'copy'}
                      onChange={() => setMigrateMode('copy')}
                      className="mt-0.5 text-cyan-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-white">Copy & Replicate</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">Keeps original records in {project.name} and copies them with new IDs to target.</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer ${migrateMode === 'move' ? 'border-amber-500/60 bg-amber-950/20 text-amber-300' : 'border-[#262b3c] bg-[#141824] text-slate-400'}`}>
                    <input
                      type="radio"
                      name="migratemode"
                      value="move"
                      checked={migrateMode === 'move'}
                      onChange={() => setMigrateMode('move')}
                      className="mt-0.5 text-amber-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-white">Migrate / Move</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">Re-partitions records into target project and unlinks from {project.name}.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222736]">
                <button
                  type="button"
                  onClick={() => setIsMigrateOpen(false)}
                  className="rounded-lg border border-[#282e42] bg-[#161926] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-[#1c2030]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
                >
                  Execute Migration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
