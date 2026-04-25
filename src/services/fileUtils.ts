import * as XLSX from 'xlsx';
import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib';
import JSZip from 'jszip';

export interface ExcelData {
  headers: string[];
  rows: any[];
}

export interface PDFMetadata {
  fields: string[];
  originalBuffer: ArrayBuffer;
}

export const parseExcel = async (file: File): Promise<ExcelData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
          throw new Error('Excel file is empty');
        }

        const headers = jsonData[0] as string[];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        resolve({ headers, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const parsePDFFields = async (file: File): Promise<PDFMetadata> => {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const form = pdfDoc.getForm();
  const fields = form.getFields().map(f => f.getName());
  
  return {
    fields,
    originalBuffer: buffer
  };
};

export const sanitizeFileName = (name: string): string => {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim();
};

export const formatDate = (dateValue: any, format: 'PDF' | 'FILE'): string => {
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return String(dateValue);

  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();

  if (format === 'PDF') {
    return `${mm}/${dd}/${yyyy}`;
  }
  return `${yyyy}-${mm}-${dd}`;
};

export interface FillResult {
  pdfBytes: Uint8Array;
  skips: string[];
}

export const fillPDF = async (
  templateBuffer: ArrayBuffer,
  mapping: Record<string, string>,
  rowData: any
): Promise<FillResult> => {
  const pdfDoc = await PDFDocument.load(templateBuffer);
  const form = pdfDoc.getForm();
  const skips: string[] = [];

  for (const [pdfField, excelHeader] of Object.entries(mapping)) {
    if (!excelHeader) continue;
    
    const value = rowData[excelHeader];
    if (value === undefined || value === null) continue;

    const field = form.getField(pdfField);
    
    if (field instanceof PDFTextField) {
      let stringValue = '';
      // Check if it's a date
      if (value instanceof Date || (typeof value === 'number' && value > 40000 && value < 60000)) {
         // xlsx sometimes returns dates as numbers
         const d = XLSX.SSF.parse_date_code(value);
         if (d) {
           stringValue = formatDate(new Date(d.y, d.m - 1, d.d), 'PDF');
         } else {
           stringValue = String(value);
         }
      } else {
        stringValue = String(value);
      }

      // Skip logic: check if data exceeds field size
      const maxLen = field.getMaxLength();
      if (maxLen !== undefined && stringValue.length > maxLen) {
        skips.push(`${pdfField} (Data: "${stringValue}" is ${stringValue.length} chars, limit ${maxLen})`);
        continue;
      }

      field.setText(stringValue);
    } else if (field instanceof PDFCheckBox) {
      const isChecked = ['true', 'yes', '1', 'on', 'checked', 'x'].includes(String(value).toLowerCase());
      if (isChecked) {
        field.check();
      } else {
        field.uncheck();
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, skips };
};

export const generateOutputName = (
  pattern: string,
  rowData: any
): string => {
  let name = pattern;
  const regex = /\[(.*?)\]/g;
  let match;
  
  while ((match = regex.exec(pattern)) !== null) {
    const key = match[1];
    let val = rowData[key] || '';
    
    // Handle dates in filenames
    if (val instanceof Date || (typeof val === 'number' && val > 40000 && val < 60000)) {
       const d = XLSX.SSF.parse_date_code(val);
       if (d) {
         val = formatDate(new Date(d.y, d.m - 1, d.d), 'FILE');
       }
    }
    
    name = name.replace(`[${key}]`, String(val));
  }
  
  return sanitizeFileName(name) || 'document';
};
