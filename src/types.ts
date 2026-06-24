export type ChartType = 'line' | 'bar' | 'scatter' | 'candlestick' | 'heatmap' | 'area' | 'pie';

export interface Widget {
  id: string;
  title: string;
  chartType: ChartType;
  xAxisKey: string;
  yAxisKeys: string[]; // For series or special keys (Open, High, Low, Close for Candlestick)
  secondaryAxisKey?: string; // For scatter (Y axis) or heatmap
  csvFilename: string;
  size: 'sm' | 'md' | 'lg' | 'full';
  colorPalette?: string[];
  aggregation?: 'none' | 'sum' | 'avg' | 'count';
  filters?: {
    column: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt';
    value: string;
  }[];
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: Widget[];
  createdAt: string;
  updatedAt: string;
  isCustom?: boolean;
}

export interface CsvFile {
  name: string;
  size: number;
  rowCount: number;
  columns: string[];
  sampleData: Record<string, any>[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  chartSuggestion?: {
    title: string;
    chartType: ChartType;
    xAxisKey: string;
    yAxisKeys: string[];
    secondaryAxisKey?: string;
    explanation: string;
    recommendedSize: 'sm' | 'md' | 'lg' | 'full';
  };
}
