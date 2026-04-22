import React, { useState, useRef } from 'react';
import { 
  FileUp, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileText, 
  Table,
  Download,
  Zap,
  ArrowRight,
  Plus,
  BrainCircuit,
  LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';
import { 
  parseExcel, 
  parsePDFFields, 
  fillPDF, 
  generateOutputName, 
  ExcelData, 
  PDFMetadata 
} from './services/fileUtils';

// State Management
type AppState = 'UPLOAD' | 'MAPPING' | 'PROCESSING' | 'FINISHED';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  // State
  const [state, setState] = useState<AppState>('UPLOAD');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pdfMetadata, setPdfMetadata] = useState<PDFMetadata | null>(null);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  
  const [filenamePattern, setFilenamePattern] = useState('Document_[RowID]');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isAiMapping, setIsAiMapping] = useState(false);
  
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // File Inputs
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Handle PDF Upload
  const handlePdfUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }
    try {
      const meta = await parsePDFFields(file);
      setPdfFile(file);
      setPdfMetadata(meta);
      setError(null);
    } catch (err) {
      setError('Failed to parse PDF form fields.');
      console.error(err);
    }
  };

  // Handle Excel Upload
  const handleExcelUpload = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      setError('Please upload a valid Excel file (.xlsx or .xls).');
      return;
    }
    try {
      const data = await parseExcel(file);
      setExcelFile(file);
      setExcelData(data);
      setError(null);
    } catch (err) {
      setError('Failed to parse Excel data.');
      console.error(err);
    }
  };

  // AI Smart Mapping
  const runAiMapping = async () => {
    if (!pdfMetadata || !excelData) return;
    setIsAiMapping(true);
    setError(null);

    try {
      const response = await (genAI as any).models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
          You are a data mapping assistant. I have a PDF form with these field names:
          ${pdfMetadata.fields.join(', ')}
          
          And an Excel file with these column headers:
          ${excelData.headers.join(', ')}
          
          Task: Analyze the semantic similarity and return a JSON array of objects mapping PDF fields to Excel headers.
          Format: [{ "pdfField": "string", "excelHeader": "string" }]
          Do not return any other text, only the JSON array.
          If you are unsure or there is no good match, set excelHeader to null.
        `
      });

      const text = response.text?.trim() || '[]';
      // Basic cleaning
      const cleanedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const aiMappings = JSON.parse(cleanedJson);

      const newMapping = { ...mapping };
      let missingFields: string[] = [];

      aiMappings.forEach((m: { pdfField: string, excelHeader: string }) => {
        if (m.pdfField && m.excelHeader) {
          newMapping[m.pdfField] = m.excelHeader;
        } else if (m.pdfField) {
           missingFields.push(m.pdfField);
        }
      });

      setMapping(newMapping);
      if (missingFields.length > 0) {
        setError(`AI could not find matches for ${missingFields.length} fields. Please map them manually.`);
      }
    } catch (err) {
      console.error(err);
      setError('AI mapping failed. Please try manual mapping.');
    } finally {
      setIsAiMapping(false);
    }
  };

  // Process Batch
  const processBatch = async () => {
    if (!pdfMetadata || !excelData) return;
    
    setState('PROCESSING');
    setProgress({ current: 0, total: excelData.rows.length });
    setError(null);

    const zip = new JSZip();

    try {
      for (let i = 0; i < excelData.rows.length; i++) {
        const row = excelData.rows[i];
        const fileName = generateOutputName(filenamePattern, row);
        
        const filledPdfBytes = await fillPDF(
          pdfMetadata.originalBuffer,
          mapping,
          row
        );
        
        zip.file(`${fileName}.pdf`, filledPdfBytes);
        setProgress(prev => ({ ...prev, current: i + 1 }));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      setZipBlob(content);
      setState('FINISHED');
    } catch (err) {
      setError('An error occurred during processing. Please check your data.');
      console.error(err);
      setState('MAPPING');
    }
  };

  const downloadZip = () => {
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DocuFill_Result_${new Date().getTime()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render Helpers
  const canContinueToMapping = pdfFile && excelFile;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <LayoutGrid size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DocuFill AI</h1>
              <p className="text-slate-400 text-sm">Intelligent PDF workflow automation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  (state === 'UPLOAD' && step === 1) || 
                  (state === 'MAPPING' && step === 2) ||
                  (state === 'PROCESSING' && step === 3) ||
                  (state === 'FINISHED' && step === 4)
                  ? 'bg-indigo-500 text-white ring-4 ring-indigo-500/20'
                  : step < (state === 'UPLOAD' ? 1 : state === 'MAPPING' ? 2 : state === 'PROCESSING' ? 3 : 4)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  {step < (state === 'UPLOAD' ? 1 : state === 'MAPPING' ? 2 : state === 'PROCESSING' ? 3 : 4) ? <CheckCircle2 size={16} /> : step}
                </div>
                {step < 4 && <div className="w-8 h-px bg-slate-800 mx-1" />}
              </div>
            ))}
          </div>
        </header>

        {/* Info/Error Bar */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
                <AlertCircle size={20} />
                <span className="text-sm font-medium">{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* State Renders */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {state === 'UPLOAD' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8"
              >
                <div className="space-y-6">
                  <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 hover:border-slate-700 transition-all">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-indigo-400">
                      <FileText size={20} /> Step 1: PDF Template
                    </h3>
                    <p className="text-slate-400 text-sm mb-6">Upload a fillable PDF form that we'll use as our master template.</p>
                    
                    <div 
                      className={`drop-zone ${pdfFile ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      <input 
                        type="file" 
                        ref={pdfInputRef} 
                        className="hidden" 
                        accept=".pdf" 
                        onChange={(e) => e.target.files?.[0] && handlePdfUpload(e.target.files[0])}
                      />
                      <div className="flex flex-col items-center gap-3">
                        {pdfFile ? (
                          <>
                            <CheckCircle2 className="text-emerald-500" size={32} />
                            <span className="font-medium text-slate-200">{pdfFile.name}</span>
                            <span className="text-xs text-slate-500">{pdfMetadata?.fields.length} form fields detected</span>
                          </>
                        ) : (
                          <>
                            <FileUp className="text-slate-600" size={32} />
                            <span className="text-slate-400">Click or drag & drop template PDF</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 hover:border-slate-700 transition-all">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-indigo-400">
                      <Table size={20} /> Step 2: Excel Data
                    </h3>
                    <p className="text-slate-400 text-sm mb-6">Upload the spreadsheet containing the data you want to inject into the form.</p>
                    
                    <div 
                      className={`drop-zone ${excelFile ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
                      onClick={() => excelInputRef.current?.click()}
                    >
                      <input 
                        type="file" 
                        ref={excelInputRef} 
                        className="hidden" 
                        accept=".xlsx,.xls" 
                        onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])}
                      />
                      <div className="flex flex-col items-center gap-3">
                        {excelFile ? (
                          <>
                            <CheckCircle2 className="text-emerald-500" size={32} />
                            <span className="font-medium text-slate-200">{excelFile.name}</span>
                            <span className="text-xs text-slate-500">{excelData?.rows.length} records found</span>
                          </>
                        ) : (
                          <>
                            <FileUp className="text-slate-600" size={32} />
                            <span className="text-slate-400">Click or drag & drop data file (.xlsx)</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-6">
                  <div className="bg-indigo-500/10 border border-indigo-500/20 p-8 rounded-2xl">
                    <h2 className="text-3xl font-bold mb-4">Let's get started.</h2>
                    <ul className="space-y-4 mb-8">
                      <li className="flex gap-3 text-slate-300">
                        <Zap size={20} className="text-indigo-400 shrink-0" />
                        <span>Instant field extraction from PDF forms</span>
                      </li>
                      <li className="flex gap-3 text-slate-300">
                        <Zap size={20} className="text-indigo-400 shrink-0" />
                        <span>Support for checkboxes and automated date formatting</span>
                      </li>
                      <li className="flex gap-3 text-slate-300">
                        <Zap size={20} className="text-indigo-400 shrink-0" />
                        <span>Scalable processing for hundreds of documents</span>
                      </li>
                    </ul>
                    <button
                      disabled={!canContinueToMapping}
                      onClick={() => setState('MAPPING')}
                      className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        canContinueToMapping 
                        ? 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 active:scale-[0.98]' 
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Continue to Mapping <ArrowRight size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {state === 'MAPPING' && (
              <motion.div 
                key="mapping"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {/* Filename Logic */}
                <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Settings size={20} className="text-indigo-400" /> Output File Naming
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="relative">
                      <input 
                        type="text"
                        value={filenamePattern}
                        onChange={(e) => setFilenamePattern(e.target.value)}
                        placeholder="Filename pattern e.g. Contract_[ClientName]_[Date]"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-600 uppercase tracking-widest font-bold">.pdf</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-slate-500 py-1 uppercase font-bold pr-2 self-center">Insert Tags:</span>
                      {excelData?.headers.slice(0, 8).map(header => (
                        <button 
                          key={header}
                          onClick={() => setFilenamePattern(prev => `${prev}[${header}]`)}
                          className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 py-2 px-4 rounded-full transition-all border border-slate-700"
                        >
                          +{header}
                        </button>
                      ))}
                      {excelData && excelData.headers.length > 8 && <span className="text-slate-700 text-xs self-center">+{excelData.headers.length - 8} more</span>}
                    </div>
                  </div>
                </div>

                {/* Field Mapping */}
                <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                      <h3 className="text-lg font-bold">Field Mapping</h3>
                      <p className="text-slate-400 text-sm">Align PDF fields with your spreadsheet headers</p>
                    </div>
                    <button 
                      onClick={runAiMapping}
                      disabled={isAiMapping}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
                    >
                      {isAiMapping ? <Loader2 size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
                      Smart Auto-Map
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {pdfMetadata?.fields.map(pdfField => (
                      <div key={pdfField} className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/50 flex flex-col gap-3">
                        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-slate-500">
                          <span>PDF Field</span>
                          <span>Excel Header</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 bg-slate-900 px-4 py-3 rounded-lg text-sm text-slate-300 border border-slate-800 truncate">
                            {pdfField}
                          </div>
                          <ArrowRight size={16} className="text-slate-700 shrink-0" />
                          <select 
                            value={mapping[pdfField] || ''}
                            onChange={(e) => setMapping({ ...mapping, [pdfField]: e.target.value })}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                          >
                            <option value="">- Unmapped -</option>
                            {excelData?.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-slate-800">
                  <button 
                    onClick={() => setState('UPLOAD')}
                    className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-medium"
                  >
                    <ArrowRight size={18} className="rotate-180" /> Change Files
                  </button>
                  <button 
                    onClick={processBatch}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-5 rounded-2xl font-bold flex items-center gap-3 transition-all shadow-xl shadow-emerald-900/10 active:scale-[0.98]"
                  >
                    Generate Batch Processing <Zap size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {state === 'PROCESSING' && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center min-h-[400px] text-center"
              >
                <div className="relative w-48 h-48 mb-8">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="96" cy="96" r="88" 
                      className="stroke-slate-800 fill-none" 
                      strokeWidth="8"
                    />
                    <motion.circle 
                      cx="96" cy="96" r="88" 
                      className="stroke-indigo-500 fill-none" 
                      strokeWidth="8"
                      strokeDasharray="552.92"
                      animate={{ strokeDashoffset: 552.92 * (1 - progress.current / progress.total) }}
                      transition={{ duration: 0.3 }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold">{Math.round((progress.current / progress.total) * 100)}%</span>
                    <span className="text-xs text-slate-500 uppercase tracking-tighter">COMPLETE</span>
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2">Generating your files</h2>
                <p className="text-slate-400">Processing {progress.current} of {progress.total} rows from your data...</p>
                <div className="mt-8 flex items-center gap-2 text-indigo-400 text-sm italic font-mono">
                  <Loader2 size={16} className="animate-spin" /> Working on: {generateOutputName(filenamePattern, excelData?.rows[progress.current - 1] || {})}
                </div>
              </motion.div>
            )}

            {state === 'FINISHED' && (
              <motion.div 
                key="finished"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto text-center py-12"
              >
                <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/20">
                  <CheckCircle2 size={48} className="text-emerald-500" />
                </div>
                <h2 className="text-4xl font-bold mb-4">Processing Complete!</h2>
                <p className="text-slate-400 text-lg mb-12">Batch process successful. {progress.total} forms have been generated and bundled into a secure ZIP archive.</p>
                
                <div className="flex flex-col gap-4">
                  <button 
                    onClick={downloadZip}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all shadow-2xl shadow-emerald-900/30 active:scale-[0.98]"
                  >
                    Download Compiled Archive <Download size={24} />
                  </button>
                  
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <button 
                      onClick={() => setState('MAPPING')}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                    >
                      <Settings size={18} /> Adjust Mapping
                    </button>
                    <button 
                      onClick={() => {
                        setPdfFile(null);
                        setExcelFile(null);
                        setPdfMetadata(null);
                        setExcelData(null);
                        setMapping({});
                        setState('UPLOAD');
                      }}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                    >
                      <Plus size={18} /> New Process
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Background Decor */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/5 blur-[120px] rounded-full" />
      </div>

      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-slate-900 text-slate-600 text-sm flex justify-between items-center">
        <div>DocuFill AI Framework &copy; 2026. All operations private & local.</div>
        <div className="flex items-center gap-4">
          <span className="hover:text-slate-400 cursor-pointer transition-colors underline decoration-slate-800 underline-offset-4">Security Policy</span>
          <span className="hover:text-slate-400 cursor-pointer transition-colors underline decoration-slate-800 underline-offset-4">Documentation</span>
        </div>
      </footer>
    </div>
  );
}
