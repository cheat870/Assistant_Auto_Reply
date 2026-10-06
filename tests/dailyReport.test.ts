import { describe, expect, it } from 'vitest';
import { dailyReportService } from '../src/services/dailyReport.service.js';

describe('Daily Report Service Suite', () => {
  it('should compute valid UTC day boundaries for Cambodia ICT timezone (UTC+7)', () => {
    const { startOfTodayUtc, dateFormatted, dateKey } = dailyReportService.getStartOfTodayInUtc();

    expect(startOfTodayUtc).toBeInstanceOf(Date);
    expect(dateFormatted).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(startOfTodayUtc.getTime()).toBeLessThan(Date.now() + 86400000);
  });

  it('should format daily report message politely in Khmer without commercial business wording', () => {
    const mockStats = {
      dateString: '06/10/2026',
      messagesToday: 24,
      activeUsersCount: 5,
      newUsersCount: 2,
      deletedToday: 3,
      threatsToday: 1,
      autoRepliesToday: 8,
      activeUserNames: ['Sokha (@sokha)', 'Dara'],
    };

    const message = dailyReportService.formatDailyReportMessage(mockStats);

    expect(message).toContain('របាយការណ៍សង្ខេបប្រចាំថ្ងៃ');
    expect(message).toContain('06/10/2026');
    expect(message).toContain('5</b> នាក់');
    expect(message).toContain('24</b> សារ');
    expect(message).toContain('3</b> សារ');
    expect(message).toContain('1</b> ករណី');
    expect(message).toContain('Sokha (@sokha)');
    expect(message).not.toContain('ហាង');
    expect(message).not.toContain('លក់');
    expect(message).not.toContain('អាជីវកម្ម');
  });

  it('should escape CSV fields according to RFC4180 standard', () => {
    function escapeCsvField(val: any): string {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }

    expect(escapeCsvField('Hello')).toBe('"Hello"');
    expect(escapeCsvField('Hello "World"')).toBe('"Hello ""World"""');
    expect(escapeCsvField('Line1\nLine2')).toBe('"Line1\nLine2"');
    expect(escapeCsvField(null)).toBe('""');
    expect(escapeCsvField(123)).toBe('"123"');
  });
});
