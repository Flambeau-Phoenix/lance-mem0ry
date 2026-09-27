import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectPartition, LanceMemoryRecord, TelemetryMetrics, DatabaseAuditReport, SemanticBucket, EntityType } from './types';
import { Header, ActiveNavTab } from './components/Header';
import { LanceDBTable } from './components/LanceDBTable';
import { AIMaintenancePanel } from './components/AIMaintenancePanel';
import { RecentMemoriesView } from './components/RecentMemoriesView';
import { MemoryModal } from './components/MemoryModal';
import { MemoryDetailsModal } from './components/MemoryDetailsModal';
import { ProjectModal } from './components/ProjectModal';
import { SplashHomePage } from './components/SplashHomePage';
import { DatabaseAlertBanner } from './components/DatabaseAlertBanner';
import { DatabaseAuditModal } from './components/DatabaseAuditModal';
import { auditDatabaseRequirements } from './utils/databaseAuditor';
import { FastMCPInfoPage } from './components/FastMCPInfoPage';
import { RulesDirectivesView } from './components/RulesDirectivesView';
import { MaintenanceLab } from './components/MaintenanceLab';
import {
  fetchProjects,
  fetchTelemetry,
  fetchAudit,
  fetchMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  archiveMemory,
  promoteMemory,
  searchMemories,
  createProject,
  updateProjectFolder,
  addCategory,
  updateCategory,
  migrateCategory,
  quickFix,
  fetchRecentMemories,
} from './api/client';

export default function App() {
  const [projects, setProjects] = useState<ProjectPartition[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectPartition | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('home');
  const [memories, setMemories] = useState<LanceMemoryRecord[]>([]);
  const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Requirements Audit
  const [auditReport, setAuditReport] = useState<DatabaseAuditReport | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Latest projects/memories kept in refs so fetchAudit can stay referentially
  // stable. Without this, fetchAudit is recreated on every projects/memories
  // change, which re-triggers the boot effect, which re-fetches projects,
  // which recreates fetchAudit again — an infinite request loop that hammers
  // the API and makes the warnings banner flicker.
  const projectsRef = useRef<ProjectPartition[]>([]);
  const memoriesRef = useRef<LanceMemoryRecord[]>([]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  // Modals
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<LanceMemoryRecord | null>(null);
  const [detailsMemory, setDetailsMemory] = useState<LanceMemoryRecord | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  // 1. Fetch Projects & Telemetry with auto-retry and safe fallback
  const fetchProjects = useCallback(async () => {
    try {
      const data = await fetchProjects();
      if (data && Array.isArray(data) && data.length > 0) {
        setProjects(data);

        setActiveProject((prev) => {
          if (!prev) return data[0];
          const found = data.find((p) => p.id === prev.id);
          return found || data[0];
        });
      }
    } catch (err) {
      console.warn('Network sync for projects deferred (using local cache):', err);
      setProjects((prev) => prev);
    }
  }, []);

  const fetchTelemetry = useCallback(async () => {
    try {
      const data = await fetchTelemetry();
      if (data && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.warn('Network sync for telemetry deferred:', err);
    }
  }, []);

  // 2. Fetch Audit Report
  const fetchAudit = useCallback(async () => {
    try {
      const data = await fetchAudit();
      if (data) {
        setAuditReport(data);
        return;
      }
    } catch (err) {
      console.warn('Backend audit API fallback to local calculation:', err);
    }
    if (projectsRef.current.length > 0) {
      const localReport = auditDatabaseRequirements(projectsRef.current, memoriesRef.current);
      setAuditReport(localReport);
    }
  }, []);

  // 3. Fetch Memories for Active Project
  const fetchMemories = useCallback(async (projectId: string) => {
    try {
      const data = await fetchMemories(projectId);
      const records: LanceMemoryRecord[] = data?.records ?? [];
      if (records.length > 0 || data) {
        setMemories(records);
      }
    } catch (err) {
      console.warn(`Network sync for memories (${projectId}) deferred:`, err);
      setMemories((prev) => prev);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial Boot
  useEffect(() => {
    const init = async () => {
      await fetchProjects();
      await fetchTelemetry();
      await fetchAudit();
    };
    init();
  }, [fetchProjects, fetchTelemetry, fetchAudit]);

  // Re-run audit when projects or memories change
  useEffect(() => {
    if (projects.length > 0) {
      fetchAudit();
    }
  }, [projects, memories.length, fetchAudit]);

  // Load memories when activeProject changes
  useEffect(() => {
    if (activeProject) {
      fetchMemories(activeProject.id);
    }
  }, [activeProject, fetchMemories]);

  // Search
  const handleSearch = async (query: string, mode: 'hybrid' | 'vector' | 'fts') => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const data = await searchMemories(activeProject.id, query, mode, 30);
      const results = Array.isArray(data.results) ? data.results : [];
      setMemories(results);
      fetchTelemetry();
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Promote Blueprint to Verified Fact
  const handlePromote = async (recordId: string) => {
    if (!activeProject) return;
    try {
      const updated = await promoteMemory(activeProject.id, recordId);
      setMemories(prev => prev.map(m => (m.record_id === recordId ? updated : m)));
      fetchProjects();
    } catch (err) {
      console.error('Failed to promote record:', err);
    }
  };

  // Archive
  const handleArchive = async (recordId: string) => {
    if (!activeProject) return;
    try {
      await archiveMemory(activeProject.id, recordId);
      setMemories(prev => prev.filter(m => m.record_id !== recordId));
      fetchProjects();
    } catch (err) {
      console.error('Failed to archive record:', err);
    }
  };

  // Delete
  const handleDelete = async (recordId: string) => {
    if (!activeProject) return;
    try {
      await deleteMemory(activeProject.id, recordId);
      setMemories(prev => prev.filter(m => m.record_id !== recordId));
      fetchProjects();
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  };

  // Save / Update Memory
  const handleSaveMemory = async (memoryData: Partial<LanceMemoryRecord>) => {
    if (!activeProject) return;
    try {
      if (editingMemory) {
        const updated = await updateMemory(activeProject.id, editingMemory.record_id, memoryData);
        setMemories(prev => prev.map(m => (m.record_id === updated.record_id ? updated : m)));
      } else {
        const created = await createMemory(activeProject.id, memoryData);
        setMemories(prev => [created, ...prev]);
      }
      setIsMemoryModalOpen(false);
      setEditingMemory(null);
      fetchProjects();
      fetchTelemetry();
    } catch (err) {
      console.error('Failed to save memory record:', err);
    }
  };

  // Add Rule / Directive
  const handleAddRule = async (data: { title: string; type: EntityType; category: string; content: string; verified: boolean }) => {
    if (!activeProject) return;
    const composedText = `[RULE: ${data.title}] ${data.content}`;
    const created = await createMemory(activeProject.id, {
      text: composedText,
      category: data.category,
      symbol: data.title,
      entity_type: data.type,
      verified: data.verified,
      tags: ['rule', data.type.toLowerCase()],
    });
    setMemories(prev => [created, ...prev]);
    fetchProjects();
  };

  // Assign Project Folder
  const handleAssignFolder = async (projectId: string, folderPath: string) => {
    const data = await updateProjectFolder(projectId, folderPath);
    if (data.project) {
      setActiveProject(data.project);
      setProjects(prev => prev.map(p => p.id === projectId ? data.project : p));
    } else {
      await fetchProjects();
    }
  };

  // Add Category
  const handleAddCategory = async (catData: { name: string; description: string; bucket: SemanticBucket }) => {
    if (!activeProject) return;
    const updatedProj = await addCategory(activeProject.id, catData);
    setActiveProject(updatedProj);
    setProjects(prev => prev.map(p => (p.id === updatedProj.id ? updatedProj : p)));
    await fetchAudit();
  };

  // Edit Category
  const handleEditCategory = async (name: string, catData: { newName?: string; description?: string; bucket?: SemanticBucket }) => {
    if (!activeProject) return;
    const updatedProj = await updateCategory(activeProject.id, name, catData);
    setActiveProject(updatedProj);
    setProjects(prev => prev.map(p => (p.id === updatedProj.id ? updatedProj : p)));
    fetchMemories(activeProject.id);
    await fetchAudit();
  };

  // Migrate Category
  const handleMigrateCategory = async (data: { target_project_id: string; category: string; mode: 'copy' | 'move' }) => {
    if (!activeProject) return;
    await migrateCategory(activeProject.id, data.category, data.target_project_id, data.mode);
    await fetchProjects();
    fetchMemories(activeProject.id);
    await fetchAudit();
  };

  // Create Project
  const handleCreateProject = async (name: string, description: string, folderPath?: string) => {
    const newProj = await createProject(name, description, folderPath);
    await fetchProjects();
    setActiveProject(newProj);
    setActiveTab('table');
    await fetchAudit();
  };

  // Quick Fix for Database Requirements
  const handleQuickFix = async (params: {
    entityType: 'project' | 'category';
    projectId: string;
    categoryKey?: string;
    description?: string;
    bucket?: string;
  }) => {
    await quickFix(params);
    await fetchProjects();
    if (activeProject) {
      await fetchMemories(activeProject.id);
    }
    await fetchAudit();
  };

  // Simulate missing requirements for testing the alert system
  const handleSimulateRequirementFailure = async (type: 'missing_category_desc' | 'missing_project_desc') => {
    await simulateMissingRequirement(type, activeProject?.id);
    await fetchProjects();
    await fetchAudit();
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] text-slate-100 selection:bg-cyan-500 selection:text-slate-950 font-sans antialiased">
      {/* Top Header with Database-Wide Navigation & Unified Health/Telemetry Status */}
      <Header
        projects={projects}
        activeProject={activeProject}
        onSelectProject={(p) => {
          setActiveProject(p);
          setActiveTab('table');
        }}
        onOpenNewProject={() => setIsProjectModalOpen(true)}
        activeTab={activeTab}
        onSelectTab={(t) => setActiveTab(t)}
        auditReport={auditReport}
        metrics={metrics}
        onOpenAudit={() => setIsAuditModalOpen(true)}
      />

      {/* Database Requirements Warning Alert Banner */}
      <DatabaseAlertBanner
        auditReport={auditReport}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="pb-16">
        {/* 0. Splash Page & Homepage Guide */}
        {activeTab === 'home' && (
          <SplashHomePage
            activeProject={activeProject}
            projects={projects}
            auditReport={auditReport}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenAudit={() => setIsAuditModalOpen(true)}
            onOpenNewMemory={() => {
              setEditingMemory(null);
              setIsMemoryModalOpen(true);
            }}
          />
        )}

        {isLoading && activeTab !== 'home' ? (
          <div className="flex h-64 items-center justify-center font-mono text-xs text-slate-500">
            Connecting to LanceDB vector table...
          </div>
        ) : !activeProject && activeTab !== 'home' && activeTab !== 'recent' && activeTab !== 'fastmcp' ? (
          <div className="mx-auto max-w-md p-12 text-center">
            <h2 className="text-base font-bold text-white">No active project partition selected</h2>
            <button
              onClick={() => setIsProjectModalOpen(true)}
              className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
            >
              + Create First Project Partition
            </button>
          </div>
        ) : (
          <>
            {/* 1. LanceDB Database Table View (Includes Project Categories & Folder Assignment & Add Record) */}
            {activeTab === 'table' && activeProject && (
              <LanceDBTable
                project={activeProject}
                projects={projects}
                memories={memories}
                onSearch={handleSearch}
                onPromote={handlePromote}
                onEdit={(m) => {
                  setEditingMemory(m);
                  setIsMemoryModalOpen(true);
                }}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onViewDetails={(m) => setDetailsMemory(m)}
                onOpenNewMemory={() => {
                  setEditingMemory(null);
                  setIsMemoryModalOpen(true);
                }}
                onAssignFolder={handleAssignFolder}
                onNavigateToRecent={() => setActiveTab('recent')}
                onAddCategory={handleAddCategory}
                onEditCategory={handleEditCategory}
                onMigrateCategory={handleMigrateCategory}
              />
            )}

            {/* 2. AI Maintenance Worker Panel (Deduplication & Fact Auditing - Database-wide) */}
            {activeTab === 'maintenance' && activeProject && (
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    AI Maintenance Worker: <span className="font-mono text-amber-400">{activeProject.id}</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Autonomous vector maintenance loops: scan for semantic duplicates via cosine distance, resolve conflicts, and audit draft blueprints.
                  </p>
                </div>
                <AIMaintenancePanel
                  project={activeProject}
                  onRefreshProject={() => {
                    fetchProjects();
                    fetchMemories(activeProject.id);
                  }}
                />
              </div>
            )}

            {/* 2.5 Rules & Directives Hub */}
            {activeTab === 'rules' && activeProject && (
              <RulesDirectivesView
                project={activeProject}
                memories={memories}
                onAddRule={handleAddRule}
                onDeleteRule={handleDelete}
                onEditRule={(m) => {
                  setEditingMemory(m);
                  setIsMemoryModalOpen(true);
                }}
                onViewDetails={(m) => setDetailsMemory(m)}
              />
            )}

            {/* 2.6 Quality Control & Maintenance Lab */}
            {activeTab === 'lab' && activeProject && (
              <MaintenanceLab
                project={activeProject}
                onRefreshProject={() => {
                  fetchProjects();
                  fetchMemories(activeProject.id);
                }}
              />
            )}

            {/* 3. Recently Added Memories (Database-wide) */}
            {activeTab === 'recent' && (
              <RecentMemoriesView
                projects={projects}
                onSelectProject={(p) => setActiveProject(p)}
                onNavigateToTable={(projId) => {
                  const p = projects.find(pr => pr.id === projId);
                  if (p) setActiveProject(p);
                  setActiveTab('table');
                }}
                onViewDetails={(m) => setDetailsMemory(m)}
                onEditMemory={(m) => {
                  const p = projects.find(pr => pr.id === m.project_id);
                  if (p) setActiveProject(p);
                  setEditingMemory(m);
                  setIsMemoryModalOpen(true);
                }}
              />
            )}

            {/* 4. FastMCP Server Info & Tools Playground (Database-wide) */}
            {activeTab === 'fastmcp' && (
              <FastMCPInfoPage
                projects={projects}
                activeProject={activeProject}
                onSelectProject={(p) => setActiveProject(p)}
                onNavigateToTable={(projId) => {
                  const p = projects.find(pr => pr.id === projId);
                  if (p) setActiveProject(p);
                  setActiveTab('table');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Insert / Edit Memory Modal */}
      {isMemoryModalOpen && activeProject && (
        <MemoryModal
          isOpen={isMemoryModalOpen}
          onClose={() => {
            setIsMemoryModalOpen(false);
            setEditingMemory(null);
          }}
          project={activeProject}
          initialMemory={editingMemory}
          onSave={handleSaveMemory}
        />
      )}

      {/* Memory Details Inspector Modal */}
      {detailsMemory && activeProject && (
        <MemoryDetailsModal
          memory={detailsMemory}
          project={activeProject}
          onClose={() => setDetailsMemory(null)}
          onPromote={handlePromote}
          onEdit={(m) => {
            setDetailsMemory(null);
            setEditingMemory(m);
            setIsMemoryModalOpen(true);
          }}
        />
      )}

      {/* New Project Partition Modal */}
      {isProjectModalOpen && (
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          onCreateProject={handleCreateProject}
        />
      )}

      {/* Unified Database Health, Requirements & Telemetry Modal */}
      <DatabaseAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        auditReport={auditReport}
        projects={projects}
        activeProject={activeProject}
        metrics={metrics}
        onRefreshAudit={fetchAudit}
        onQuickFix={handleQuickFix}
        onSimulateRequirementFailure={handleSimulateRequirementFailure}
        onSimulateQuery={async (q, mode) => {
          await handleSearch(q, mode);
        }}
      />
    </div>
  );
}
