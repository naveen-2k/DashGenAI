import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure saved_dashboards.json exists
const DASHBOARDS_FILE = path.join(DATA_DIR, 'saved_dashboards.json');
if (!fs.existsSync(DASHBOARDS_FILE)) {
  fs.writeFileSync(DASHBOARDS_FILE, JSON.stringify([], null, 2));
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to parse CSV robustly
function parseCSV(rawText: string): Record<string, any>[] {
  const lines = rawText.split(/\r?\n/);
  if (lines.length === 0 || !lines[0]) return [];

  // Parse header line handling potential quotes
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const data: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    
    const row: Record<string, any> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const val = values[index] !== undefined ? values[index] : '';
      
      // Auto convert numbers and boolean values
      if (val === '') {
        row[header] = null;
      } else if (val.toLowerCase() === 'true') {
        row[header] = true;
      } else if (val.toLowerCase() === 'false') {
        row[header] = false;
      } else if (!isNaN(Number(val)) && val.trim() !== '') {
        row[header] = Number(val);
      } else {
        row[header] = val;
      }
    });
    data.push(row);
  }
  return data;
}

// API Routes

// 1. Get all CSV files
app.get('/api/csv-files', async (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR);
    const csvFiles = [];

    for (const file of files) {
      if (file.endsWith('.csv')) {
        const filePath = path.join(DATA_DIR, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseCSV(content);
        const columns = parsed.length > 0 ? Object.keys(parsed[0]) : [];

        csvFiles.push({
          name: file,
          size: stats.size,
          rowCount: parsed.length,
          columns,
          sampleData: parsed.slice(0, 5)
        });
      }
    }

    res.json(csvFiles);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve CSV files', details: error.message });
  }
});

// 2. Get data for a single CSV file
app.get('/api/csv-data/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // Simple path traversal check
    if (filename.includes('..') || path.isAbsolute(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseCSV(content);

    res.json({
      name: filename,
      rowCount: parsed.length,
      columns: parsed.length > 0 ? Object.keys(parsed[0]) : [],
      data: parsed
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read CSV data', details: error.message });
  }
});

// 3. Upload a new CSV file
app.post('/api/upload-csv', (req, res) => {
  try {
    const { name, content } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: 'Filename and content are required' });
    }

    let safeName = name.endsWith('.csv') ? name : `${name}.csv`;
    safeName = safeName.replace(/[^a-zA-Z0-9_.-]/g, '_');

    const filePath = path.join(DATA_DIR, safeName);
    fs.writeFileSync(filePath, content, 'utf-8');

    const parsed = parseCSV(content);

    res.json({
      success: true,
      file: {
        name: safeName,
        size: content.length,
        rowCount: parsed.length,
        columns: parsed.length > 0 ? Object.keys(parsed[0]) : [],
        sampleData: parsed.slice(0, 5)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to upload CSV', details: error.message });
  }
});

// 4. Cloud Sync - Get saved dashboards
app.get('/api/dashboards', (req, res) => {
  try {
    const dashboards = JSON.parse(fs.readFileSync(DASHBOARDS_FILE, 'utf-8'));
    res.json(dashboards);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load dashboards', details: error.message });
  }
});

// 5. Cloud Sync - Save dashboards
app.post('/api/dashboards', (req, res) => {
  try {
    const dashboards = req.body;
    if (!Array.isArray(dashboards)) {
      return res.status(400).json({ error: 'Expected an array of dashboards' });
    }

    fs.writeFileSync(DASHBOARDS_FILE, JSON.stringify(dashboards, null, 2), 'utf-8');
    res.json({ success: true, message: 'Dashboards synchronized successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to synchronize dashboards', details: error.message });
  }
});

// 6. Agent AI Visualizer
app.post('/api/agent/visualize', async (req, res) => {
  try {
    const { userQuery, csvFilename, columns, sampleData } = req.body;

    if (!userQuery || !csvFilename || !columns) {
      return res.status(400).json({ error: 'userQuery, csvFilename, and columns are required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server. Please add it via the Settings menu.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstructions = `
      You are an expert data visualization consultant and AI agent.
      Your task is to analyze the user's instructions and the available CSV columns to select the perfect chart type and axis configuration.

      Available chart types:
      - 'line': for continuous trends or metrics over time.
      - 'bar': for discrete category comparisons, sums, or distributions.
      - 'pie': for absolute proportions or category shares.
      - 'area': for cumulative growth or stacked volumes.
      - 'scatter': for analyzing correlations/clusters between two numerical variables.
      - 'candlestick': strictly for financial price trends. Requires 'Open', 'High', 'Low', 'Close' values.
      - 'heatmap': for high-density matrix patterns of two numeric values or spatial grid-like indices.

      Guidelines:
      1. Choose the chart type that BEST answers the user query and makes sense for the dataset.
         - If the user query is about stock pricing, or mentions open/high/low/close, prefer 'candlestick'.
         - If the user query is about correlation or scatter or plot variables against each other, prefer 'scatter'.
         - If the query mentions heat, density, or matrices, prefer 'heatmap'.
      2. Set xAxisKey: The column that represents the X-Axis. (e.g. 'Date', 'Timestamp', 'Category', etc.)
      3. Set yAxisKeys: An array of columns that represent the metrics. For 'candlestick', this MUST be exactly an array of ['Open', 'High', 'Low', 'Close'] or similar capitalizations found in the available columns.
      4. For 'scatter' or 'heatmap', set secondaryAxisKey to the second variable (the Y-Axis variable).
      5. Formulate a friendly, direct explanation explaining why you chose this layout and how it solves their question.
    `;

    const prompt = `
      Analyze the CSV file "${csvFilename}".
      Columns: ${JSON.stringify(columns)}
      Sample Data: ${JSON.stringify(sampleData)}

      User's instructions: "${userQuery}"

      Respond strictly with a JSON object containing the properties:
      {
        "title": "Short descriptive title of the chart",
        "chartType": "line" | "bar" | "scatter" | "candlestick" | "heatmap" | "area" | "pie",
        "xAxisKey": "name of column to use for X axis (must be exact column name)",
        "yAxisKeys": ["array of exact column names for Y axis metrics"],
        "secondaryAxisKey": "exact column name for secondary comparison (Y-value for scatter, etc) - optional",
        "explanation": "Brief 1-2 sentence friendly explanation of the visualization",
        "recommendedSize": "sm" | "md" | "lg" | "full"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [systemInstructions, prompt],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const resultText = response.text || '{}';
    const config = JSON.parse(resultText);

    res.json(config);
  } catch (error: any) {
    console.error('AI Agent visualization error:', error);
    res.status(500).json({ error: 'AI visualization compilation failed', details: error.message });
  }
});

// Setup Vite Dev server or production static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
