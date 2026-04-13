import React, { useState } from 'react';
import axios from 'axios';
import { 
  FileUp, 
  FileDown, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileText, 
  Table,
  Download,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [pdfFile, setPdfFile] = useState<{ filename: string; originalName: string } | null>(null);
  const [excelFile, setExcelFile] = useState<{ filename: string } | null>(null);
  const [extractedFields, setExtractedFields] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [excelTemplateUrl, setExcelTemplateUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadFile = async (url: string, defaultFilename: string) => {
    try {
      setError(null);
      const response = await axios.get(url, {
        responseType: 'blob',
      });
      
      // Create a local URL for the blob
      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create a temporary link and click it
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = defaultFilename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError('Download failed. The session may have expired or the browser is blocking the request.');
      console.error('Download error:', err);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      setError(null);
      const res = await axios.post('/api/upload-pdf', formData);
      setPdfFile(res.data);
      
      // Automatically extract fields
      setIsExtracting(true);
      const extractRes = await axios.post('/api/extract-fields', { filename: res.data.filename });
      setExtractedFields(extractRes.data.fields);
    } catch (err) {
      setError('Failed to upload PDF or extract fields.');
      console.error(err);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerateExcel = async () => {
    if (!pdfFile || extractedFields.length === 0) return;

    try {
      setError(null);
      const res = await axios.post('/api/generate-excel', { 
        fields: extractedFields,
        pdfName: pdfFile.originalName 
      });
      setExcelTemplateUrl(res.data.downloadUrl);
    } catch (err) {
      setError('Failed to generate Excel template.');
      console.error(err);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('excel', file);

    try {
      setError(null);
      const res = await axios.post('/api/upload-excel', formData);
      setExcelFile(res.data);
    } catch (err) {
      setError('Failed to upload Excel file.');
      console.error(err);
    }
  };

  const handleProcess = async () => {
    if (!pdfFile || !excelFile) return;

    setIsProcessing(true);
    setDownloadUrl(null);
    try {
      setError(null);
      const res = await axios.post('/api/process', {
        pdfFilename: pdfFile.filename,
        excelFilename: excelFile.filename
      });
      setDownloadUrl(res.data.zipUrl);
    } catch (err) {
      setError('Processing failed. Please check your Excel format.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-12 border-b border-black pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter uppercase">PDF Form Automator</h1>
          <p className="col-header mt-2">Precision Batch Processing System v1.0</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="data-value text-xs opacity-50">STATUS: OPERATIONAL</p>
          <p className="data-value text-xs opacity-50">SYSTEM_TIME: {new Date().toLocaleTimeString()}</p>
        </div>
      </header>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 bg-red-100 border border-red-400 text-red-700 flex items-center gap-3"
        >
          <AlertCircle size={20} />
          <span className="data-value text-sm">{error}</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Workflow */}
        <div className="space-y-8">
          {/* Step 1: PDF Upload */}
          <section className="step-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold uppercase flex items-center gap-2">
                <span className="data-value opacity-30">01</span> Upload PDF Template
              </h2>
              {pdfFile && <CheckCircle2 className="text-green-600" size={20} />}
            </div>
            
            <div className="relative group">
              <input 
                type="file" 
                accept=".pdf" 
                onChange={handlePdfUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-black p-8 text-center group-hover:bg-white transition-colors">
                <FileUp className="mx-auto mb-2 opacity-50" size={32} />
                <p className="data-value text-sm">
                  {pdfFile ? pdfFile.originalName : "Drop PDF here or click to browse"}
                </p>
              </div>
            </div>
          </section>

          {/* Step 2: Excel Template */}
          <section className={`step-card transition-opacity ${!pdfFile ? 'opacity-30 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold uppercase flex items-center gap-2">
                <span className="data-value opacity-30">02</span> Data Structure
              </h2>
              {excelTemplateUrl && <CheckCircle2 className="text-green-600" size={20} />}
            </div>
            
            <p className="text-sm mb-4 opacity-70">
              Extracted <span className="data-value font-bold">{extractedFields.length}</span> fields from PDF. 
              Generate an Excel template to fill with data.
            </p>

            <div className="flex gap-4">
              <button 
                onClick={handleGenerateExcel}
                disabled={isExtracting || extractedFields.length === 0}
                className="flex-1 border border-black p-3 flex items-center justify-center gap-2 hover:bg-black hover:text-white transition-all disabled:opacity-50"
              >
                {isExtracting ? <Loader2 className="animate-spin" size={18} /> : <Settings size={18} />}
                <span className="data-value text-sm uppercase font-bold">Generate Template</span>
              </button>
              
              {excelTemplateUrl && (
                <button 
                  onClick={() => downloadFile(excelTemplateUrl, 'template.xlsx')}
                  className="border border-black p-3 flex items-center justify-center gap-2 bg-black text-white hover:bg-opacity-80 transition-all"
                >
                  <FileDown size={18} />
                  <span className="data-value text-sm uppercase font-bold">Download</span>
                </button>
              )}
            </div>
          </section>

          {/* Step 3: Upload Data */}
          <section className={`step-card transition-opacity ${!excelTemplateUrl ? 'opacity-30 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold uppercase flex items-center gap-2">
                <span className="data-value opacity-30">03</span> Upload Filled Data
              </h2>
              {excelFile && <CheckCircle2 className="text-green-600" size={20} />}
            </div>
            
            <div className="relative group">
              <input 
                type="file" 
                accept=".xlsx" 
                onChange={handleExcelUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-black p-8 text-center group-hover:bg-white transition-colors">
                <Table className="mx-auto mb-2 opacity-50" size={32} />
                <p className="data-value text-sm">
                  {excelFile ? "Excel data uploaded" : "Upload filled Excel file"}
                </p>
              </div>
            </div>
          </section>

          {/* Step 4: Process */}
          <section className={`step-card transition-opacity ${!excelFile ? 'opacity-30 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold uppercase flex items-center gap-2">
                <span className="data-value opacity-30">04</span> Execute Automation
              </h2>
            </div>
            
            <button 
              onClick={handleProcess}
              disabled={isProcessing}
              className="w-full border-2 border-black p-4 flex items-center justify-center gap-3 bg-black text-white hover:bg-opacity-90 transition-all disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <Zap size={24} fill="currentColor" />
              )}
              <span className="data-value text-lg uppercase font-bold tracking-widest">
                {isProcessing ? "Processing Batch..." : "Run Automation"}
              </span>
            </button>

            <AnimatePresence>
              {downloadUrl && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4"
                >
                  <button 
                    onClick={() => downloadFile(downloadUrl, 'results.zip')}
                    className="w-full border border-black p-4 flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700 transition-all"
                  >
                    <Download size={20} />
                    <span className="data-value text-sm uppercase font-bold">Download All Results (ZIP)</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Right Column: Preview */}
        <div className="space-y-8">
          <section className="step-card h-full flex flex-col">
            <div className="flex items-center justify-between mb-6 border-b border-black pb-2">
              <h2 className="text-lg font-bold uppercase flex items-center gap-2">
                <FileText size={20} /> Field Preview
              </h2>
              <span className="data-value text-xs opacity-50 uppercase">Total: {extractedFields.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[600px] border border-black bg-white/20">
              {extractedFields.length > 0 ? (
                <div>
                  <div className="data-row bg-black text-white sticky top-0 z-10">
                    <span className="col-header text-white opacity-100">#</span>
                    <span className="col-header text-white opacity-100">Field Name</span>
                  </div>
                  {extractedFields.map((field, idx) => (
                    <div key={idx} className="data-row">
                      <span className="data-value text-xs opacity-40">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="data-value text-sm truncate" title={field}>{field}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-30">
                  <FileText size={48} className="mb-4" />
                  <p className="data-value text-sm uppercase">No PDF Loaded</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-black">
              <div className="flex justify-between items-center mb-2">
                <span className="col-header">System Log</span>
                <span className="data-value text-[10px] opacity-40">AUTO_REFRESH: ON</span>
              </div>
              <div className="bg-black text-green-500 p-3 font-mono text-[10px] space-y-1">
                <p>&gt; System initialized...</p>
                {pdfFile && <p>&gt; PDF "{pdfFile.originalName}" loaded.</p>}
                {isExtracting && <p className="animate-pulse">&gt; Extracting AcroForm metadata...</p>}
                {extractedFields.length > 0 && <p>&gt; {extractedFields.length} fields mapped successfully.</p>}
                {excelFile && <p>&gt; Data source "{excelFile.filename}" connected.</p>}
                {isProcessing && <p className="animate-pulse text-yellow-500">&gt; Generating batch outputs...</p>}
                {downloadUrl && <p className="text-green-400">&gt; Batch complete. ZIP ready for download.</p>}
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className="mt-12 pt-8 border-t border-black flex justify-between items-center opacity-40">
        <p className="data-value text-[10px]">© 2026 PDF_FORM_AUTOMATOR_CORE</p>
        <div className="flex gap-4">
          <p className="data-value text-[10px]">ENCRYPTION: AES-256</p>
          <p className="data-value text-[10px]">LICENSE: APACHE-2.0</p>
        </div>
      </footer>
    </div>
  );
}
