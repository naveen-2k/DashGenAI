import React, { useState } from 'react';
import { 
  Plus, Calendar, Sparkles, FileText, LayoutGrid, Info, 
  Trash2, PlusCircle, LayoutTemplate, Settings, RefreshCw, 
  Download, ArrowUpRight, Check, AlertCircle
} from 'lucide-react';
import { Dashboard, Widget, CsvFile } from '../types';
import ChartWidget from './ChartWidget';
import { detectDateColumn, filterByDateRange } from '../utils/csvHelper';

interface DashboardGridProps {
  activeDashboard: Dashboard | null;
  csvFiles: CsvFile[];
  activeFileData: Record<string, any>[];
  activeFile: string | null;
  timeFilter: '7d' | '30d' | '90d' | 'all';
  onUpdateDashboard: (updatedDashboard: Dashboard) => void;
  onAddBlankWidget: () => void;
  onLoadTemplate: (templateName: string) => void;
}

export default function DashboardGrid({
  activeDashboard, csvFiles, activeFileData, activeFile, timeFilter,
  onUpdateDashboard, onAddBlankWidget, onLoadTemplate
}: DashboardGridProps) {
  
  const [showExporter, setShowExporter] = useState(false);

  if (!activeDashboard) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 font-sans">
        <LayoutTemplate className="w-12 h-12 text-slate-300 mb-3" />
        <h3 className="text-base font-semibold text-slate-800">No Dashboard Active</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Please select an existing dashboard template from the left panel or create a brand new one to begin.
        </p>
      </div>
    );
  }

  // Update a single widget inside the active dashboard
  const handleUpdateWidget = (updatedWidget: Widget) => {
    const updatedWidgets = activeDashboard.widgets.map(w => 
      w.id === updatedWidget.id ? updatedWidget : w
    );
    onUpdateDashboard({
      ...activeDashboard,
      widgets: updatedWidgets,
      updatedAt: new Date().toISOString()
    });
  };

  // Delete a single widget from the active dashboard
  const handleDeleteWidget = (widgetId: string) => {
    const updatedWidgets = activeDashboard.widgets.filter(w => w.id !== widgetId);
    onUpdateDashboard({
      ...activeDashboard,
      widgets: updatedWidgets,
      updatedAt: new Date().toISOString()
    });
  };

  // Export Dashboard JSON Configuration to Local Machine
  const handleExportDashboardConfig = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeDashboard, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${activeDashboard.name.replace(/\s+/g, '_')}_workspace.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setShowExporter(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 font-sans">
      
      {/* Dashboard Summary Bar */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Workspace</span>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-800 tracking-tight leading-none">
                {activeDashboard.name}
              </h2>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-md font-bold">
                {activeDashboard.widgets.length} {activeDashboard.widgets.length === 1 ? 'widget' : 'widgets'}
              </span>
            </div>
          </div>
          
          {activeFile && (
            <>
              <div className="hidden md:block h-8 w-[1px] bg-slate-200"></div>
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Selected Data Source</span>
                <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                  {activeFile}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Dashboard actions */}
        <div className="flex items-center gap-3">
          {activeFile ? (
            <button
              onClick={onAddBlankWidget}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Add a manual widget to chart"
            >
              <Plus className="w-4 h-4" />
              <span>Add Widget</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold select-none">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs">Select a CSV from folder to build widgets</span>
            </div>
          )}

          <button
            onClick={handleExportDashboardConfig}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
            title="Download full workspace dashboard JSON to your local machine"
          >
            <Download className="w-4 h-4" />
            <span>Export View</span>
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="flex-1 overflow-y-auto p-6">
        
        {/* Dynamic Widget Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 items-start">
          {activeDashboard.widgets.map(widget => {
            // Find target file's columns and full dataset rows
            const matchedFile = csvFiles.find(f => f.name === widget.csvFilename);
            const columns = matchedFile?.columns || [];
            
            // If the widget is querying the current active file, use loaded memory data.
            // Otherwise, look for sampleData or a cached version.
            let rawData = matchedFile?.sampleData || [];
            if (activeFile === widget.csvFilename) {
              rawData = activeFileData;
            }

            // Apply global date/time filter if a date column exists on this widget's CSV
            let filteredData = rawData;
            const dateCol = detectDateColumn(columns);
            if (dateCol && timeFilter !== 'all') {
              filteredData = filterByDateRange(rawData, dateCol, timeFilter);
            }

            return (
              <ChartWidget
                key={widget.id}
                widget={widget}
                data={filteredData}
                columns={columns}
                onUpdate={handleUpdateWidget}
                onDelete={() => handleDeleteWidget(widget.id)}
              />
            );
          })}
        </div>

        {/* Empty State */}
        {activeDashboard.widgets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 bg-slate-50/30 rounded-2xl max-w-xl mx-auto my-6 font-sans">
            <LayoutGrid className="w-10 h-10 text-slate-300 mb-2.5" />
            <h4 className="text-sm font-semibold text-slate-800">Dashboard is Empty</h4>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Add custom visualization cards to this workspace dashboard! Use the **AI Visualizer Agent** on the left panel or click **Add Widget** to manually map variables.
            </p>
            {activeFile && (
              <div className="flex gap-2.5 mt-5">
                <button
                  onClick={onAddBlankWidget}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                >
                  Create manual widget
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
