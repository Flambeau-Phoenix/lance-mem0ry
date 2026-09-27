import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, ArrowRight, X, Sparkles } from 'lucide-react';
import { DatabaseAuditReport } from '../types';

interface DatabaseAlertBannerProps {
  auditReport: DatabaseAuditReport | null;
  onOpenAuditModal: () => void;
}

export const DatabaseAlertBanner: React.FC<DatabaseAlertBannerProps> = ({
  auditReport,
  onOpenAuditModal,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || !auditReport || auditReport.totalAlerts === 0) {
    return null;
  }

  const criticalCount = auditReport.criticalCount;
  const topAlert = auditReport.alerts[0];

  return (
    <div className="border-b border-amber-500/30 bg-gradient-to-r from-amber-950/70 via-[#181216] to-amber-950/70 px-4 py-2.5 text-xs text-amber-200 shadow-sm animate-in fade-in">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            {criticalCount > 0 ? (
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            )}
          </div>
          <div className="truncate font-sans">
            <span className="font-bold text-white mr-1.5">
              Database Requirements Alert:
            </span>
            <span className="text-amber-300 font-medium">
              {auditReport.totalAlerts} {auditReport.totalAlerts === 1 ? 'requirement needs' : 'requirements need'} attention
            </span>
            {topAlert && (
              <span className="hidden md:inline text-slate-300 ml-2">
                — {topAlert.title}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenAuditModal}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1 font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-sm text-xs"
          >
            <span>Review & Quick-Fix</span>
            <ArrowRight className="h-3 w-3" />
          </button>
          
          <button
            onClick={() => setIsDismissed(true)}
            className="rounded p-1 text-amber-400/70 hover:text-amber-200 hover:bg-amber-500/10 transition-colors"
            title="Dismiss banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
