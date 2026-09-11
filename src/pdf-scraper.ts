import { Sandbox } from 'e2b';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

interface ScraperResult {
  success: boolean;
  output?: string;
  error?: string;
  outputFiles?: {
    structured: string;
    dbReady: string;
  };
}

async function runPdfScraper(pdfPath: string): Promise<ScraperResult> {
  let sandbox: Sandbox | null = null;

  try {
    console.log('Starting e2b sandbox...');
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      metadata: {
        template: 'base',
      },
    });

    console.log('Sandbox created successfully!');

    // Read the Python script
    const pythonScriptPath = path.join(
      __dirname,
      '../../pdf-scraper/main.py'
    );
    console.log(`Reading Python script from: ${pythonScriptPath}`);
    const pythonScript = fs.readFileSync(pythonScriptPath, 'utf-8');

    // Read the PDF file
    console.log(`Reading PDF from: ${pdfPath}`);
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found at: ${pdfPath}`);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfFilename = path.basename(pdfPath);

    // Upload Python script to sandbox
    console.log('Uploading Python script to sandbox...');
    await sandbox.files.write('/home/user/main.py', pythonScript);

    // Upload PDF to sandbox
    console.log('Uploading PDF to sandbox...');
    await sandbox.files.write(`/home/user/${pdfFilename}`, pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength));

    // Install dependencies
    console.log('Installing pdfplumber...');
    const installResult = await sandbox.commands.run('pip install pdfplumber');
    console.log('Install output:', installResult.stdout);
    if (installResult.stderr) {
      console.log('Install warnings:', installResult.stderr);
    }

    // Run the Python script
    console.log('Running PDF scraper...');
    const runResult = await sandbox.commands.run(
      `python main.py "${pdfFilename}"`
    );

    console.log('\n=== Python Script Output ===');
    console.log(runResult.stdout);

    if (runResult.stderr) {
      console.log('\n=== Errors/Warnings ===');
      console.log(runResult.stderr);
    }

    // Check if script ran successfully
    if (runResult.exitCode !== 0) {
      return {
        success: false,
        error: `Script exited with code ${runResult.exitCode}`,
        output: runResult.stdout,
      };
    }

    // Download the output files
    const baseName = path.basename(pdfFilename, '.pdf');
    const structuredFile = `${baseName}_structured.json`;
    const dbReadyFile = `${baseName}_db_ready.json`;

    console.log('\nDownloading output files...');

    let structuredContent = '';
    let dbReadyContent = '';

    try {
      structuredContent = await sandbox.files.read(
        `/home/user/${structuredFile}`
      );
      console.log(`Downloaded: ${structuredFile}`);
    } catch (e) {
      console.log(`Warning: Could not download ${structuredFile}`);
    }

    try {
      dbReadyContent = await sandbox.files.read(`/home/user/${dbReadyFile}`);
      console.log(`Downloaded: ${dbReadyFile}`);
    } catch (e) {
      console.log(`Warning: Could not download ${dbReadyFile}`);
    }

    // Save output files locally
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (structuredContent) {
      const structuredPath = path.join(outputDir, structuredFile);
      fs.writeFileSync(structuredPath, structuredContent);
      console.log(`Saved to: ${structuredPath}`);
    }

    if (dbReadyContent) {
      const dbReadyPath = path.join(outputDir, dbReadyFile);
      fs.writeFileSync(dbReadyPath, dbReadyContent);
      console.log(`Saved to: ${dbReadyPath}`);
    }

    return {
      success: true,
      output: runResult.stdout,
      outputFiles: {
        structured: structuredContent,
        dbReady: dbReadyContent,
      },
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (sandbox) {
      console.log('\nClosing sandbox...');
      await sandbox.kill();
      console.log('Sandbox closed.');
    }
  }
}

// Main execution
async function main() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error('Usage: npm run dev pdf-scraper.ts <path-to-pdf>');
    console.error(
      'Example: npm run dev pdf-scraper.ts /path/to/attendance.pdf'
    );
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('PDF Scraper with e2b');
  console.log('='.repeat(80));
  console.log(`PDF File: ${pdfPath}\n`);

  const result = await runPdfScraper(pdfPath);

  if (result.success) {
    console.log('\n✓ PDF scraping completed successfully!');
  } else {
    console.error('\n✗ PDF scraping failed:', result.error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runPdfScraper };
