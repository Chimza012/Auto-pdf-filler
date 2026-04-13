import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import archiver from "archiver";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Ensure directories exist
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  const outputsDir = path.resolve(process.cwd(), "outputs");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
  });
  const upload = multer({ storage });

  // API Routes
  app.post("/api/upload-pdf", upload.single("pdf"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    console.log(`PDF Uploaded: ${req.file.filename}`);
    res.json({ filename: req.file.filename, originalName: req.file.originalname });
  });

  app.post("/api/extract-fields", async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: "Filename required" });

    try {
      const pdfPath = path.join(uploadsDir, filename);
      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      const fieldNames = fields.map(f => f.getName());
      res.json({ fields: fieldNames, count: fieldNames.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to extract fields" });
    }
  });

  app.post("/api/generate-excel", async (req, res) => {
    const { fields, pdfName } = req.body;
    if (!fields || !Array.isArray(fields)) return res.status(400).json({ error: "Fields array required" });

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Data");
      
      // Add headers
      worksheet.addRow(fields);
      
      const excelFilename = `template-${Date.now()}.xlsx`;
      const excelPath = path.join(outputsDir, excelFilename);
      console.log(`Generating Excel template: ${excelPath}`);
      await workbook.xlsx.writeFile(excelPath);
      
      res.json({ downloadUrl: `/api/download/${excelFilename}` });
    } catch (error) {
      console.error("Excel generation error:", error);
      res.status(500).json({ error: "Failed to generate Excel" });
    }
  });

  app.post("/api/upload-excel", upload.single("excel"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ filename: req.file.filename });
  });

  app.post("/api/process", async (req, res) => {
    const { pdfFilename, excelFilename } = req.body;
    if (!pdfFilename || !excelFilename) return res.status(400).json({ error: "PDF and Excel filenames required" });

    try {
      const pdfPath = path.join(uploadsDir, pdfFilename);
      const excelPath = path.join(uploadsDir, excelFilename);
      
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelPath);
      const worksheet = workbook.getWorksheet(1);
      
      if (!worksheet) throw new Error("Worksheet not found");

      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell) => {
        headers.push(cell.value?.toString() || "");
      });

      const results: string[] = [];
      const batchId = Date.now();
      const batchDir = path.join(outputsDir, `batch-${batchId}`);
      fs.mkdirSync(batchDir);

      const pdfBytes = fs.readFileSync(pdfPath);

      // Process rows (skip header)
      const rows = worksheet.getRows(2, worksheet.rowCount - 1) || [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();
        
        row.eachCell((cell, colNumber) => {
          const fieldName = headers[colNumber - 1];
          const value = cell.value?.toString() || "";
          
          try {
            const field = form.getField(fieldName);
            if (field) {
              if (field.constructor.name === 'PDFCheckBox') {
                const cb = form.getCheckBox(fieldName);
                if (value.toLowerCase() === 'yes' || value.toLowerCase() === 'true' || value === '1') {
                  cb.check();
                } else {
                  cb.uncheck();
                }
              } else if (field.constructor.name === 'PDFTextField') {
                const tf = form.getTextField(fieldName);
                tf.setText(value);
              } else if (field.constructor.name === 'PDFDropdown') {
                const dd = form.getDropdown(fieldName);
                dd.select(value);
              } else if (field.constructor.name === 'PDFRadioGroup') {
                const rg = form.getRadioGroup(fieldName);
                rg.select(value);
              }
            }
          } catch (e) {
            console.warn(`Could not fill field ${fieldName}:`, e);
          }
        });

        const filledPdfBytes = await pdfDoc.save();
        const outputFilename = `filled-${i + 1}-${pdfFilename}`;
        fs.writeFileSync(path.join(batchDir, outputFilename), filledPdfBytes);
        results.push(outputFilename);
      }

      // Create ZIP
      const zipFilename = `results-${batchId}.zip`;
      const zipPath = path.join(outputsDir, zipFilename);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.pipe(output);
      archive.directory(batchDir, false);
      await archive.finalize();

      res.json({ 
        zipUrl: `/api/download/${zipFilename}`,
        count: results.length
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  app.get("/api/download/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(outputsDir, filename);
    console.log(`Download requested: ${filename} from ${filePath}`);
    
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.xlsx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else if (ext === '.zip') {
        res.setHeader('Content-Type', 'application/zip');
      }
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(filePath);
    } else {
      console.error(`File not found for download: ${filePath}`);
      res.status(404).json({ error: "File not found" });
    }
  });

  // Catch-all for API to prevent falling through to Vite SPA
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
