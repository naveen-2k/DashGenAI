import React, { useState, useEffect } from 'react';
import { 
  Plus, Calendar, Sparkles, LayoutGrid, Database, Cloud, 
  CloudLightning, RefreshCw, AlertCircle, Play, Info, HelpCircle
} from 'lucide-react';
import { Dashboard, CsvFile, Widget } from './types';
import LeftPanel from './components/LeftPanel';
import DashboardGrid from './components/DashboardGrid';

export default function App() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('');
  const [csvFiles, setCsvFiles] = useState<CsvFile[]>([]);
  
  // Data states
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeFileData, setActiveFileData] = useState<Record<string, any>[]>([]);
  
  // Loaders
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingDashboards, setIsLoadingDashboards] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'error'>('synced');

  // Filters
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | '90d' | 'all'>('all');

  // Initial Data Fetch
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoadingFiles(true);
    setIsLoadingDashboards(true);
    try {
      // 1. Fetch CSV file list
      const filesRes = await fetch('/api/csv-files');
      const files: CsvFile[] = await filesRes.json();
      setCsvFiles(files);
      
      if (files.length > 0) {
        // Set the first file active by default
        setActiveFile(files[0].name);
        fetchCsvData(files[0].name);
      }

      // 2. Fetch synchronized dashboards
      const dbsRes = await fetch('/api/dashboards');
      const dbs: Dashboard[] = await dbsRes.json();
      setDashboards(dbs);
      
      if (dbs.length > 0) {
        setSelectedDashboardId(dbs[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch initial full-stack data:', error);
    } finally {
      setIsLoadingFiles(false);
      setIsLoadingDashboards(false);
    }
  };

  // Fetch full CSV content for visualization
  const fetchCsvData = async (filename: string) => {
    try {
      const res = await fetch(`/api/csv-data/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const fileData = await res.json();
        setActiveFileData(fileData.data || []);
      }
    } catch (err) {
      console.error('Failed to load CSV rows:', err);
    }
  };

  // Sync state with cloud backend (Debounced/Simulated persistence)
  const syncWithCloud = async (updatedDashboards: Dashboard[]) => {
    setIsSyncing(true);
    setSyncStatus('saving');
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDashboards)
      });
      if (res.ok) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      console.error('Failed to synchronize dashboards with server:', err);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Select Dashboard handler
  const handleSelectDashboard = (id: string) => {
    setSelectedDashboardId(id);
    
    // Automatically match active CSV source to the first widget in the selected dashboard if it exists
    const db = dashboards.find(d => d.id === id);
    if (db && db.widgets.length > 0) {
      const firstWidgetCsv = db.widgets[0].csvFilename;
      if (firstWidgetCsv && firstWidgetCsv !== activeFile) {
        setActiveFile(firstWidgetCsv);
        fetchCsvData(firstWidgetCsv);
      }
    }
  };

  // Selection change of active CSV file
  const handleSelectFile = (filename: string) => {
    setActiveFile(filename);
    fetchCsvData(filename);
  };

  // Upload/create a new CSV in workspace folder
  const handleUploadFile = async (name: string, content: string) => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content })
      });
      const data = await res.json();
      if (data.success) {
        // Append to local list
        setCsvFiles(prev => {
          // Prevent duplicates
          const filtered = prev.filter(f => f.name !== data.file.name);
          return [data.file, ...filtered];
        });
        setActiveFile(data.file.name);
        setActiveFileData(data.file.sampleData || []);
        fetchCsvData(data.file.name);
      }
    } catch (err) {
      console.error('Upload CSV failed:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Create a brand new workspace dashboard
  const handleCreateDashboard = (name: string, description: string) => {
    const newDashboard: Dashboard = {
      id: `dashboard-${Date.now()}`,
      name,
      description,
      widgets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const updated = [...dashboards, newDashboard];
    setDashboards(updated);
    setSelectedDashboardId(newDashboard.id);
    syncWithCloud(updated);
  };

  // Import dashboard from local JSON config
  const handleImportDashboard = (importedDashboard: Dashboard) => {
    const cleaned: Dashboard = {
      ...importedDashboard,
      id: `dashboard-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updated = [...dashboards, cleaned];
    setDashboards(updated);
    setSelectedDashboardId(cleaned.id);
    syncWithCloud(updated);
  };

  // Update widgets inside active dashboard
  const handleUpdateDashboard = (updatedDashboard: Dashboard) => {
    const updated = dashboards.map(db => 
      db.id === updatedDashboard.id ? updatedDashboard : db
    );
    setDashboards(updated);
    syncWithCloud(updated);
  };

  // Add custom manual blank widget
  const handleAddBlankWidget = () => {
    if (!activeFile) return;
    const activeFileMetadata = csvFiles.find(f => f.name === activeFile);
    if (!activeFileMetadata) return;

    const columns = activeFileMetadata.columns;
    if (columns.length === 0) return;

    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      title: `Custom Metric (${activeFile.replace('.csv', '')})`,
      chartType: 'line',
      xAxisKey: columns[0],
      yAxisKeys: columns[1] ? [columns[1]] : [columns[0]],
      csvFilename: activeFile,
      size: 'md',
      aggregation: 'none'
    };

    const db = dashboards.find(d => d.id === selectedDashboardId);
    if (db) {
      const updatedDb: Dashboard = {
        ...db,
        widgets: [...db.widgets, newWidget],
        updatedAt: new Date().toISOString()
      };
      handleUpdateDashboard(updatedDb);
    }
  };

  // Add widget created by AI Agent Suggestion
  const handleAddWidgetToCurrentDashboard = (widget: Widget) => {
    const db = dashboards.find(d => d.id === selectedDashboardId);
    if (db) {
      const updatedDb: Dashboard = {
        ...db,
        widgets: [...db.widgets, widget],
        updatedAt: new Date().toISOString()
      };
      handleUpdateDashboard(updatedDb);
    }
  };

  const activeDashboard = dashboards.find(d => d.id === selectedDashboardId) || null;

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-slate-50 font-sans">
      {/* Cloud Synchronizer Banner */}
      <div className="lg:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between text-slate-800 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <LayoutGrid className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold tracking-tight">DashGen AI</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 font-bold">
          <Cloud className={`w-3.5 h-3.5 ${syncStatus === 'saving' ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
          <span>{syncStatus === 'synced' ? 'SYNCED' : syncStatus === 'saving' ? 'SAVING...' : 'SYNC ERROR'}</span>
        </div>
      </div>

      {/* Left panel layout with CSV list, Dashboard selections, and AI Agent chat drawer */}
      <LeftPanel
        dashboards={dashboards}
        selectedDashboardId={selectedDashboardId}
        onSelectDashboard={handleSelectDashboard}
        onCreateDashboard={handleCreateDashboard}
        onImportDashboard={handleImportDashboard}
        
        csvFiles={csvFiles}
        activeFile={activeFile}
        onSelectFile={handleSelectFile}
        onUploadFile={handleUploadFile}
        isLoadingFiles={isLoadingFiles}
        
        timeFilter={timeFilter}
        onSetTimeFilter={setTimeFilter}
        
        onAddWidgetToCurrentDashboard={handleAddWidgetToCurrentDashboard}
        isSyncing={isSyncing}
        onSyncWithCloud={() => syncWithCloud(dashboards)}
      />

      {/* Main workspace visualization area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Sync Status Floating Badge for Desktop */}
        <div className="hidden lg:flex absolute top-5 right-6 z-40 items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-sm text-[10px] font-mono text-slate-500">
          <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : syncStatus === 'saving' ? 'bg-indigo-500 animate-ping' : 'bg-rose-500'}`}></span>
          <span>{syncStatus === 'synced' ? 'Synced with Cloud' : syncStatus === 'saving' ? 'Syncing...' : 'Sync Error'}</span>
        </div>

        {isLoadingDashboards ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 bg-slate-50">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
            <p className="text-xs font-medium">Synchronizing workspace data...</p>
          </div>
        ) : (
          <DashboardGrid
            activeDashboard={activeDashboard}
            csvFiles={csvFiles}
            activeFileData={activeFileData}
            activeFile={activeFile}
            timeFilter={timeFilter}
            onUpdateDashboard={handleUpdateDashboard}
            onAddBlankWidget={handleAddBlankWidget}
            onLoadTemplate={handleSelectDashboard}
          />
        )}
      </div>
    </div>
  );
}

// Simple loader helper icon
function Loader2({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animate-spin ${className}`}
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
