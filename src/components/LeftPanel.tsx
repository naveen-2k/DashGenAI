import React, { useState, useRef } from 'react';
import { 
  Plus, Calendar, Sparkles, UploadCloud, Database, RefreshCw, 
  ChevronRight, FileSpreadsheet, LayoutGrid, Download, Send, 
  HelpCircle, Check, Play, Loader2, CloudLightning, Info
} from 'lucide-react';
import { Dashboard, CsvFile, ChatMessage, Widget } from '../types';

interface LeftPanelProps {
  dashboards: Dashboard[];
  selectedDashboardId: string;
  onSelectDashboard: (id: string) => void;
  onCreateDashboard: (name: string, description: string) => void;
  onImportDashboard: (dashboardJson: Dashboard) => void;
  
  csvFiles: CsvFile[];
  activeFile: string | null;
  onSelectFile: (filename: string) => void;
  onUploadFile: (filename: string, content: string) => void;
  isLoadingFiles: boolean;
  
  timeFilter: '7d' | '30d' | '90d' | 'all';
  onSetTimeFilter: (filter: '7d' | '30d' | '90d' | 'all') => void;

  onAddWidgetToCurrentDashboard: (widget: Widget) => void;
  isSyncing: boolean;
  onSyncWithCloud: () => void;
}

export default function LeftPanel({
  dashboards, selectedDashboardId, onSelectDashboard, onCreateDashboard, onImportDashboard,
  csvFiles, activeFile, onSelectFile, onUploadFile, isLoadingFiles,
  timeFilter, onSetTimeFilter, onAddWidgetToCurrentDashboard,
  isSyncing, onSyncWithCloud
}: LeftPanelProps) {
  
  const [newDbName, setNewDbName] = useState('');
  const [newDbDesc, setNewDbDesc] = useState('');
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I am your AI Visualization Agent. Point me to any CSV file in your folder, tell me what you want to visualize, and I will compile and insert a dynamic widget for you automatically!',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [isAskingAgent, setIsAskingAgent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const parseFileAndUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      onUploadFile(file.name, content);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseFileAndUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseFileAndUpload(e.target.files[0]);
    }
  };

  // Create Dashboard Handle
  const handleCreateDbSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim()) return;
    onCreateDashboard(newDbName, newDbDesc);
    setNewDbName('');
    setNewDbDesc('');
    setShowCreateDb(false);
  };

  // Dashboard file import
  const handleImportDashboardLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const dashboard: Dashboard = JSON.parse(event.target?.result as string);
          if (dashboard && dashboard.name && Array.isArray(dashboard.widgets)) {
            onImportDashboard(dashboard);
          } else {
            alert('Invalid dashboard configuration schema.');
          }
        } catch (err) {
          alert('Failed to parse dashboard JSON file.');
        }
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  // Ask Gemini Agent to compile a widget
  const handleAskAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim() || !activeFile) return;

    const currentQuery = userQuery;
    setUserQuery('');

    // Add user message to chat
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: currentQuery,
      timestamp: new Date().toLocaleTimeString()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setIsAskingAgent(true);

    const activeCsvMetadata = csvFiles.find(f => f.name === activeFile);

    try {
      const response = await fetch('/api/agent/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userQuery: currentQuery,
          csvFilename: activeFile,
          columns: activeCsvMetadata?.columns || [],
          sampleData: activeCsvMetadata?.sampleData || []
        })
      });

      const resData = await response.json();

      if (response.ok) {
        const agentMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `${resData.explanation}\n\nI've generated a recommended **${resData.chartType.toUpperCase()}** chart layout titled **"${resData.title}"** mapping **${resData.xAxisKey}** on the X-axis and **${resData.yAxisKeys.join(', ')}** on the Y-axis.`,
          timestamp: new Date().toLocaleTimeString(),
          chartSuggestion: {
            title: resData.title,
            chartType: resData.chartType,
            xAxisKey: resData.xAxisKey,
            yAxisKeys: resData.yAxisKeys,
            secondaryAxisKey: resData.secondaryAxisKey,
            explanation: resData.explanation,
            recommendedSize: resData.recommendedSize || 'md'
          }
        };
        setChatMessages(prev => [...prev, agentMsg]);
      } else {
        throw new Error(resData.error || 'Server visualization parsing failed');
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an issue setting up that chart: ${err.message}. Please verify the columns and try asking differently.`,
        timestamp: new Date().toLocaleTimeString()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAskingAgent(false);
    }
  };

  const handleApplySuggestion = (suggestion: NonNullable<ChatMessage['chartSuggestion']>) => {
    if (!activeFile) return;
    const newWidget: Widget = {
      id: `ai-widget-${Date.now()}`,
      title: suggestion.title,
      chartType: suggestion.chartType,
      xAxisKey: suggestion.xAxisKey,
      yAxisKeys: suggestion.yAxisKeys,
      secondaryAxisKey: suggestion.secondaryAxisKey,
      csvFilename: activeFile,
      size: suggestion.recommendedSize,
      colorPalette: COLORS_PRESET
    };
    onAddWidgetToCurrentDashboard(newWidget);
  };

  const COLORS_PRESET = ['#4f46e5', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4'];

  return (
    <div className="w-full lg:w-80 bg-white text-slate-800 flex flex-col h-full border-r border-slate-200 shrink-0 select-none">
      {/* Brand & Sync Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 tracking-tight">DashGen AI</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Full-Stack Data Suite</p>
          </div>
        </div>

        <button 
          onClick={onSyncWithCloud}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isSyncing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CloudLightning className="w-3 h-3" />
          )}
          <span>Sync Cloud</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* SECTION 1: Ready-Made Dashboards */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saved Views</p>
            <div className="flex gap-1.5">
              <label className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-indigo-400 cursor-pointer transition-colors" title="Import Dashboard JSON">
                <Download className="w-3.5 h-3.5 rotate-180" />
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleImportDashboardLocal} 
                  className="hidden" 
                />
              </label>
              <button 
                onClick={() => setShowCreateDb(!showCreateDb)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-indigo-400 transition-colors cursor-pointer"
                title="Create New Dashboard"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {showCreateDb && (
            <form onSubmit={handleCreateDbSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs text-slate-700">
              <input 
                type="text" 
                placeholder="Dashboard Title"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 shadow-sm"
                required
              />
              <textarea 
                placeholder="Describe your workspace metrics..."
                value={newDbDesc}
                onChange={(e) => setNewDbDesc(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 h-16 resize-none shadow-sm"
              />
              <div className="flex justify-end gap-1.5">
                <button 
                  type="button" 
                  onClick={() => setShowCreateDb(false)}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-3 py-1 bg-indigo-600 rounded-md text-white font-semibold hover:bg-indigo-700 cursor-pointer shadow-sm shadow-indigo-100"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1">
            {dashboards.map(db => (
              <button
                key={db.id}
                onClick={() => onSelectDashboard(db.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  selectedDashboardId === db.id 
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100/50' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate pr-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${selectedDashboardId === db.id ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                  <div className="truncate">
                    <span className="block truncate font-bold">{db.name}</span>
                    <span className={`block text-[9px] truncate font-normal mt-0.5 ${selectedDashboardId === db.id ? 'text-indigo-500' : 'text-slate-400'}`}>{db.description}</span>
                  </div>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${selectedDashboardId === db.id ? 'text-indigo-600' : 'text-slate-400'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 2: Global Time-Range Filters */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Quick Filters</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'all', label: 'All Time' },
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: '90d', label: '90 Days' }
            ].map(range => (
              <button
                key={range.id}
                onClick={() => onSetTimeFilter(range.id as any)}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  timeFilter === range.id 
                    ? 'border-indigo-600 text-white bg-indigo-600 shadow-md shadow-indigo-100' 
                    : 'border-slate-200 text-slate-600 bg-white hover:border-indigo-400 hover:text-slate-800'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 3: Folder CSV Data Files */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loaded Datasets</p>
            {isLoadingFiles && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />}
          </div>

          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-1 bg-slate-50/50 space-y-1">
            {csvFiles.map(file => (
              <button
                key={file.name}
                onClick={() => onSelectFile(file.name)}
                className={`w-full text-left p-2 rounded-lg text-[11px] border transition-all flex items-center gap-2.5 cursor-pointer ${
                  activeFile === file.name 
                    ? 'bg-indigo-50/50 border-indigo-200 text-indigo-700 font-bold shadow-sm shadow-indigo-100/30' 
                    : 'bg-white border-slate-100 hover:bg-slate-50/80 text-slate-600 hover:text-slate-800 hover:border-slate-200'
                }`}
              >
                <FileSpreadsheet className={`w-4 h-4 shrink-0 ${activeFile === file.name ? 'text-indigo-600' : 'text-slate-400'}`} />
                <div className="truncate">
                  <p className="font-bold truncate text-slate-800">{file.name}</p>
                  <p className={`text-[9px] font-mono mt-0.5 ${activeFile === file.name ? 'text-indigo-500' : 'text-slate-400'}`}>{file.rowCount} rows • {file.columns.length} columns</p>
                </div>
              </button>
            ))}
            {csvFiles.length === 0 && !isLoadingFiles && (
              <p className="text-center py-4 text-xs text-slate-400 italic">No CSV datasets loaded</p>
            )}
          </div>

          {/* Drag & Drop Box */}
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all ${
              dragActive 
                ? 'border-indigo-500 bg-indigo-50/50' 
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100/50 hover:border-indigo-400'
            }`}
          >
            <UploadCloud className="w-5 h-5 mx-auto text-slate-400 mb-1.5" />
            <p className="text-[10px] text-slate-600 font-bold">Drag & Drop CSV Dataset</p>
            <p className="text-[9px] text-slate-400 mt-0.5">or click to browse local files</p>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".csv" 
              onChange={handleFileSelect} 
              className="hidden" 
            />
          </div>
        </div>

        {/* SECTION 4: AI Visualizer Agent Drawer */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ask Visualizer Agent</p>
            <span className="text-[9px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
              Gemini 2.5
            </span>
          </div>

          {/* Chat Window */}
          <div className="h-44 flex flex-col justify-between border border-slate-200 rounded-xl bg-slate-50 p-2.5 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-[11px]">
              {chatMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col gap-1 max-w-[85%] rounded-lg p-2 ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white ml-auto shadow-sm shadow-indigo-100' 
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  <p className="leading-relaxed font-medium break-words">{msg.content}</p>
                  
                  {msg.chartSuggestion && (
                    <div className="mt-2 bg-slate-50 rounded-lg p-2 border border-slate-200 text-[10px] space-y-1.5 text-slate-600">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800 truncate max-w-[120px]">{msg.chartSuggestion.title}</span>
                        <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 rounded uppercase font-bold font-mono">
                          {msg.chartSuggestion.chartType}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400">Maps: {msg.chartSuggestion.xAxisKey} ➔ {msg.chartSuggestion.yAxisKeys.join(', ')}</p>
                      
                      <button
                        onClick={() => handleApplySuggestion(msg.chartSuggestion!)}
                        className="w-full mt-1 py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] flex items-center justify-center gap-1 cursor-pointer transition-all shadow-md shadow-indigo-100"
                      >
                        <Check className="w-3 h-3" /> Apply suggested Widget
                      </button>
                    </div>
                  )}
                  
                  <span className="text-[8px] text-slate-400 text-right self-end mt-0.5">{msg.timestamp}</span>
                </div>
              ))}
              {isAskingAgent && (
                <div className="bg-white border border-slate-200 text-slate-500 rounded-lg p-2 max-w-[85%] flex items-center gap-1.5 italic text-[10px]">
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                  Agent compiles visualization...
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleAskAgent} className="mt-2 flex gap-1 items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
              <input 
                type="text" 
                placeholder={activeFile ? `Analyze ${activeFile}...` : "Select a CSV dataset first"}
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                disabled={!activeFile || isAskingAgent}
                className="flex-1 bg-transparent px-2 py-1 text-[11px] text-slate-800 placeholder-slate-400 outline-none disabled:opacity-50"
                required
              />
              <button 
                type="submit"
                disabled={!activeFile || isAskingAgent || !userQuery.trim()}
                className="p-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors cursor-pointer"
                title="Send instruction to agent"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
          {!activeFile && (
            <p className="text-[9px] text-slate-400 flex items-center gap-1 px-1">
              <Info className="w-3 h-3 text-slate-400 shrink-0" /> Select a CSV from the folder above to unlock AI agent visualization.
            </p>
          )}
        </div>
        
      </div>

      {/* Cloud Synced Footer matching Design HTML */}
      <div className="mt-auto p-5 border-t border-slate-100 bg-slate-50">
        <button 
          onClick={onSyncWithCloud}
          disabled={isSyncing}
          className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md/5 transition-all text-left disabled:opacity-75 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></div>
            <span className="text-xs font-semibold text-slate-600">{isSyncing ? 'Syncing...' : 'Cloud Synced'}</span>
          </div>
          <RefreshCw className={`w-4 h-4 text-slate-400 ${isSyncing ? 'animate-spin text-indigo-600' : 'hover:text-indigo-600'}`} />
        </button>
      </div>
    </div>
  );
}
