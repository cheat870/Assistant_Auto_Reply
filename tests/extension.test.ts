import { describe, expect, it } from 'vitest';
import {
  analyzeFilenameExtension,
  extractAllExtensions,
  normalizeExtension,
} from '../src/utils/extension.js';

describe('Extension Utility Tests', () => {
  describe('normalizeExtension', () => {
    it('should normalize uppercase extensions', () => {
      expect(normalizeExtension('.EXE')).toBe('.exe');
      expect(normalizeExtension('EXE')).toBe('.exe');
      expect(normalizeExtension('.BAT')).toBe('.bat');
      expect(normalizeExtension('BAT')).toBe('.bat');
    });

    it('should handle standard extensions', () => {
      expect(normalizeExtension('.zip')).toBe('.zip');
      expect(normalizeExtension('.tar')).toBe('.tar');
      expect(normalizeExtension('.gz')).toBe('.gz');
      expect(normalizeExtension('.7z')).toBe('.7z');
      expect(normalizeExtension('.rar')).toBe('.rar');
      expect(normalizeExtension('.z')).toBe('.z');
    });

    it('should handle whitespace and empty strings', () => {
      expect(normalizeExtension('  .exe  ')).toBe('.exe');
      expect(normalizeExtension('')).toBe('');
    });
  });

  describe('extractAllExtensions', () => {
    it('should extract single extension', () => {
      expect(extractAllExtensions('file.exe')).toEqual(['.exe']);
      expect(extractAllExtensions('document.pdf')).toEqual(['.pdf']);
    });

    it('should extract multiple extensions in order', () => {
      expect(extractAllExtensions('invoice.pdf.exe')).toEqual(['.pdf', '.exe']);
      expect(extractAllExtensions('archive.tar.gz')).toEqual(['.tar', '.gz']);
      expect(extractAllExtensions('report.2026.docx.bat')).toEqual(['.2026', '.docx', '.bat']);
    });

    it('should return empty for files without extension', () => {
      expect(extractAllExtensions('README')).toEqual([]);
    });
  });

  describe('analyzeFilenameExtension - Double Extension Detection', () => {
    it('should detect double extension for file.pdf.exe', () => {
      const result = analyzeFilenameExtension('file.pdf.exe');
      expect(result.isDoubleExtension).toBe(true);
      expect(result.primaryExtension).toBe('.exe');
      expect(result.secondaryExtension).toBe('.pdf');
      expect(result.dangerReason).toBeDefined();
    });

    it('should detect double extension for photo.jpg.exe', () => {
      const result = analyzeFilenameExtension('photo.jpg.exe');
      expect(result.isDoubleExtension).toBe(true);
      expect(result.primaryExtension).toBe('.exe');
      expect(result.secondaryExtension).toBe('.jpg');
    });

    it('should detect double extension for document.docx.bat', () => {
      const result = analyzeFilenameExtension('document.docx.bat');
      expect(result.isDoubleExtension).toBe(true);
      expect(result.primaryExtension).toBe('.bat');
      expect(result.secondaryExtension).toBe('.docx');
    });

    it('should detect double extension for image.png.scr', () => {
      const result = analyzeFilenameExtension('image.png.scr');
      expect(result.isDoubleExtension).toBe(true);
      expect(result.primaryExtension).toBe('.scr');
      expect(result.secondaryExtension).toBe('.png');
    });

    it('should detect double extension for update.zip.exe', () => {
      const result = analyzeFilenameExtension('update.zip.exe');
      expect(result.isDoubleExtension).toBe(true);
      expect(result.primaryExtension).toBe('.exe');
      expect(result.secondaryExtension).toBe('.zip');
    });

    it('should detect double extension for movie.mp4.exe', () => {
      const result = analyzeFilenameExtension('movie.mp4.exe');
      expect(result.isDoubleExtension).toBe(true);
      expect(result.primaryExtension).toBe('.exe');
      expect(result.secondaryExtension).toBe('.mp4');
    });

    it('should NOT flag legitimate compound extension archive.tar.gz', () => {
      const result = analyzeFilenameExtension('archive.tar.gz');
      expect(result.isDoubleExtension).toBe(false);
      expect(result.primaryExtension).toBe('.gz');
    });

    it('should NOT flag safe normal files', () => {
      expect(analyzeFilenameExtension('photo.jpg').isDoubleExtension).toBe(false);
      expect(analyzeFilenameExtension('document.pdf').isDoubleExtension).toBe(false);
      expect(analyzeFilenameExtension('image.png').isDoubleExtension).toBe(false);
      expect(analyzeFilenameExtension('text.txt').isDoubleExtension).toBe(false);
    });

    it('should handle uppercase double extension INVOICE.PDF.EXE', () => {
      const result = analyzeFilenameExtension('INVOICE.PDF.EXE');
      expect(result.isDoubleExtension).toBe(true);
      expect(result.primaryExtension).toBe('.exe');
    });
  });
});
