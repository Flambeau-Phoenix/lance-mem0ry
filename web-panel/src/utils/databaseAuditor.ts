import { ProjectPartition, LanceMemoryRecord, DatabaseAlert, DatabaseAuditReport } from '../types';

export function auditDatabaseRequirements(
  projects: ProjectPartition[],
  memories: LanceMemoryRecord[]
): DatabaseAuditReport {
  const alerts: DatabaseAlert[] = [];
  let projectsWithMissingDesc = 0;
  let categoriesWithMissingDesc = 0;
  let recordsLackingSymbolOrTags = 0;
  let totalCategories = 0;

  for (const project of projects) {
    // 1. Project-level requirement checks
    const descTrimmed = (project.description || '').trim();
    if (!descTrimmed || descTrimmed.length < 12) {
      projectsWithMissingDesc++;
      alerts.push({
        id: `alert-proj-desc-${project.id}`,
        severity: 'critical',
        entityType: 'project',
        entityId: project.id,
        entityName: project.name || project.id,
        projectId: project.id,
        title: `Project Partition "${project.name || project.id}" Missing Description`,
        message: `Project partition "${project.id}" has no descriptive summary. Autonomous agents and vector routers require partition descriptions to select relevant tables.`,
        missingRequirement: 'Project description is required (min 15 chars).',
        recommendation: `Add a clear description outlining what domain or agent context this LanceDB partition stores.`,
        autoFixable: true,
      });
    }

    const catKeys = Object.keys(project.categories || {});
    if (catKeys.length === 0) {
      alerts.push({
        id: `alert-proj-cats-${project.id}`,
        severity: 'critical',
        entityType: 'project',
        entityId: project.id,
        entityName: project.name || project.id,
        projectId: project.id,
        title: `Project "${project.id}" Has No Categories Defined`,
        message: `LanceDB tables must organize memory records into semantic categories (e.g. key_facts, architectural_decisions, ongoing_tasks).`,
        missingRequirement: 'At least one semantic category is required.',
        recommendation: 'Initialize standard categories: key_facts, architectural_decisions, and ongoing_tasks.',
        autoFixable: true,
      });
    }

    if (project.embedding_dimensions !== 768) {
      alerts.push({
        id: `alert-proj-dim-${project.id}`,
        severity: 'warning',
        entityType: 'project',
        entityId: project.id,
        entityName: project.name || project.id,
        projectId: project.id,
        title: `Non-Standard Vector Dimension (${project.embedding_dimensions || 'undefined'})`,
        message: `Expected 768-dim dense embeddings for Nomic model compatibility.`,
        missingRequirement: 'Vector dimensionality should match Nomic-embed-text (768).',
        recommendation: 'Update embedding configuration to 768 dimensions.',
        autoFixable: false,
      });
    }

    // 2. Category-level requirement checks
    for (const [catName, catDef] of Object.entries(project.categories || {})) {
      totalCategories++;
      const catDescTrimmed = (catDef.description || '').trim();
      
      if (!catDescTrimmed || catDescTrimmed.length < 8) {
        categoriesWithMissingDesc++;
        alerts.push({
          id: `alert-cat-desc-${project.id}-${catName}`,
          severity: 'critical',
          entityType: 'category',
          entityId: `${project.id}::${catName}`,
          entityName: catName,
          projectId: project.id,
          categoryKey: catName,
          title: `Category "${catName}" Missing Description`,
          message: `Category "${catName}" in project "${project.id}" is missing a description. Classification models and agents cannot route memories without a semantic category definition.`,
          missingRequirement: 'Category description is required.',
          recommendation: `Provide a description explaining what facts or state belong inside "${catName}".`,
          autoFixable: true,
        });
      }

      if (!catDef.bucket || !['fact', 'decision', 'state'].includes(catDef.bucket)) {
        alerts.push({
          id: `alert-cat-bucket-${project.id}-${catName}`,
          severity: 'warning',
          entityType: 'category',
          entityId: `${project.id}::${catName}`,
          entityName: catName,
          projectId: project.id,
          categoryKey: catName,
          title: `Category "${catName}" Missing Semantic Bucket`,
          message: `Category "${catName}" has an invalid or missing semantic bucket. Must be one of: fact, decision, state.`,
          missingRequirement: 'Semantic bucket classification (fact / decision / state) is required.',
          recommendation: 'Assign a valid semantic bucket to govern memory immutability and verification lifecycles.',
          autoFixable: true,
        });
      }
    }
  }

  // 3. Record-level requirement checks (sample scan)
  const activeMemories = memories.filter(m => m.status !== 'deleted');
  for (const mem of activeMemories) {
    const lacksSymbol = !mem.symbol || !mem.symbol.trim();
    const lacksTags = !Array.isArray(mem.tags) || mem.tags.length === 0;
    const lacksText = !mem.text || mem.text.trim().length < 5;

    if (lacksSymbol || lacksTags) {
      recordsLackingSymbolOrTags++;
    }

    if (lacksText) {
      alerts.push({
        id: `alert-rec-text-${mem.record_id}`,
        severity: 'critical',
        entityType: 'record',
        entityId: mem.record_id,
        entityName: mem.symbol || mem.record_id.slice(0, 8),
        projectId: mem.project_id,
        title: `Memory Record "${mem.symbol || mem.record_id.slice(0, 8)}" Has Empty Content`,
        message: `Record ${mem.record_id} contains less than 5 characters. Vector indexing cannot compute meaningful cosine distances for empty texts.`,
        missingRequirement: 'Memory text content cannot be blank.',
        recommendation: 'Provide substantive textual content or delete the record.',
        autoFixable: false,
      });
    }
  }

  if (recordsLackingSymbolOrTags > 0) {
    alerts.push({
      id: `alert-records-metadata`,
      severity: 'info',
      entityType: 'record',
      entityId: 'records-summary',
      entityName: `${recordsLackingSymbolOrTags} Records`,
      title: `${recordsLackingSymbolOrTags} Memory Records Lack Complete Metadata (Symbol or Tags)`,
      message: `Multiple records in the vector database are missing symbols or semantic tags, reducing filter precision in hybrid search.`,
      missingRequirement: 'High-quality tags and symbol identifiers improve retrieval accuracy.',
      recommendation: 'Run an AI enrichment pass or add descriptive tags to records.',
      autoFixable: false,
    });
  }

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  let status: DatabaseAuditReport['status'] = 'healthy';
  if (criticalCount > 0) {
    status = 'critical_issues';
  } else if (warningCount > 0) {
    status = 'has_warnings';
  }

  return {
    timestamp: new Date().toISOString(),
    status,
    totalAlerts: alerts.length,
    criticalCount,
    warningCount,
    infoCount,
    alerts,
    metrics: {
      totalProjects: projects.length,
      projectsWithMissingDesc,
      totalCategories,
      categoriesWithMissingDesc,
      totalRecords: activeMemories.length,
      recordsLackingSymbolOrTags,
    },
  };
}

export function suggestDescription(entityType: 'project' | 'category', name: string, context?: any): string {
  const clean = name.toLowerCase().replace(/[_-]/g, ' ').trim();
  
  if (entityType === 'project') {
    return `Dedicated LanceDB vector memory partition for "${name}". Stores domain knowledge, agent execution states, ratified invariants, and session histories with 768-dim dense embeddings.`;
  }

  // Category descriptions
  if (clean.includes('tool') || clean.includes('function')) {
    return `Tool definitions, execution schemas, permission boundaries, and API parameters invoked by the agent.`;
  }
  if (clean.includes('config') || clean.includes('setting') || clean.includes('env')) {
    return `Configuration directives, environment flags, runtime constraints, and system constants.`;
  }
  if (clean.includes('prompt') || clean.includes('persona') || clean.includes('instruction')) {
    return `System behavioral prompts, agent instructions, persona traits, and operational guardrails.`;
  }
  if (clean.includes('decision') || clean.includes('arch')) {
    return `Architectural invariants, structural design choices, engineering trade-offs, and permanent system rules.`;
  }
  if (clean.includes('fact') || clean.includes('key') || clean.includes('know')) {
    return `Ratified facts, verified domain truths, immutable constants, and baseline knowledge.`;
  }
  if (clean.includes('task') || clean.includes('todo') || clean.includes('step')) {
    return `Work-in-progress tasks, pending agent directives, draft blueprints, and session milestones.`;
  }
  if (clean.includes('session') || clean.includes('handoff')) {
    return `Context handoff logs, session summaries, and agent state transitions across execution runs.`;
  }

  return `Semantic memory collection for ${clean} items, storing structured vector records and contextual knowledge under the ${context?.bucket || 'fact'} bucket.`;
}
