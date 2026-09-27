import React, { useState, useEffect } from 'react';
import { ProjectPartition } from '../types';
import { Folder, HardDrive, Check, X, FolderKanban, Sparkles, Database, Shield, Code, FileCode2 } from 'lucide-react';

interface AssignFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectPartition;
  onAssignFolder: (projectId: string, folderPath: string) => Promise<void>;
}

export const AssignFolderModal: React.FC<AssignFolderModalProps> = ({
  isOpen,
  onClose,
  project,
  onAssignFolder,
}) => {
  const [folderPath, setFolderPath] = useState(
    project.folder_path || `/workspace/${project.id}`
  );
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setFolderPath(project.folder_path || `/workspace/${project.id}`);
    }
  }, [project]);

  if (!isOpen) return null;

  const presets = [
    {
      label: 'Modding Workspace',
      path: `/workspace/${project.id}`,
      desc: 'Target mod development directory containing scripts, plugins, and assets',
    },
    {
      label: 'Python Modding Scripts Suite',
      path: `~/workspace/mod-tools/${project.id}`,
      desc: 'Condensed Python scripts, automation routines, and game hook definitions',
    },
    {
      label: 'Game Mod Install Folder',
      path: `/games/mods/${project.id}`,
      desc: 'Game-specific mod folder (Papyrus scripts, Redscripts, ESM/ESP files, plugins)',
    },
    {
      label: 'Local Codebase Repo',
      path: `./src/mods/${project.id}`,
      desc: 'Project-relative repository directory inside current workspace',
    },
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) {
      setErrorMessage('Please enter a valid directory path for the project.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onAssignFolder(project.id, folderPath.trim());
      setSuccessMessage('Target project directory updated successfully!');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1300);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update target project folder');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl border border-[#272e42] bg-[#10131e] p-6 shadow-2xl text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f2538] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Target Project Codebase Directory
              </h2>
              <p className="text-xs font-mono text-slate-400">
                Partition: <span className="text-cyan-300 font-semibold">{project.id}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#191e2e] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <Check className="h-4 w-4 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Clarifying info banner */}
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3 text-xs text-slate-300 flex items-start gap-2.5">
            <Code className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-cyan-300">What is this folder?</span>
              <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                This is the <strong>source codebase or project folder that the memories are about</strong> (e.g. your scripts, tools, or repository files). The LanceDB vector database runs separately as the storage engine indexing these memories.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Project Codebase / Modding Workspace Folder:
            </label>
            <div className="relative">
              <Folder className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/path/to/your/mod_project_or_scripts"
                className="w-full rounded-lg border border-[#2a3248] bg-[#141826] py-2 pl-9 pr-3 text-xs font-mono text-cyan-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              All memories, categories, verified API signatures, and ongoing blueprints in partition <span className="font-mono text-cyan-400">{project.id}</span> document this directory.
            </p>
          </div>

          {/* Preset Buttons */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
              Common Project Folder Locations:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.path}
                  type="button"
                  onClick={() => setFolderPath(preset.path)}
                  className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-all ${
                    folderPath === preset.path
                      ? 'border-cyan-500 bg-cyan-500/10 text-white'
                      : 'border-[#22273a] bg-[#131724] text-slate-300 hover:border-slate-600 hover:bg-[#181d2c]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-cyan-300">
                    <FileCode2 className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{preset.label}</span>
                  </div>
                  <span className="mt-1 font-mono text-[10px] text-slate-400 truncate max-w-full">
                    {preset.path}
                  </span>
                  <span className="mt-0.5 text-[10px] text-slate-400">
                    {preset.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Partition Metadata */}
          <div className="rounded-xl border border-[#1f2537] bg-[#0c0e15] p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px]">Memories Documenting This Folder:</span>
              <span className="font-mono text-cyan-300 font-semibold">{project.total_records} records</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px]">Underlying Storage Engine:</span>
              <span className="font-mono text-slate-200">LanceDB Native v0.17 (Arrow + Tantivy)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px]">Semantic Vector Probe:</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                768-dim Nomic Embedding
              </span>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#1f2538]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#272e42] bg-[#141824] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1a2030] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSaving ? (
                <span>Saving Directory...</span>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Assign Project Folder</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
