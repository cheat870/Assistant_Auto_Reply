import fs from 'node:fs/promises';
import path from 'node:path';
import type { ScriptAnalysisResult } from '../types/index.js';

interface ScriptPattern {
  name: string;
  category:
    | 'powershell'
    | 'network'
    | 'deletion'
    | 'registry'
    | 'persistence'
    | 'execution'
    | 'obfuscation';
  pattern: RegExp;
  description: string;
}

const SUSPICIOUS_PATTERNS: ScriptPattern[] = [
  // PowerShell & Invocations
  {
    name: 'PowerShell Invocation',
    category: 'powershell',
    pattern: /\b(?:powershell|pwsh)(?:\.exe)?\b/i,
    description: 'Invokes PowerShell to execute commands or scripts',
  },
  {
    name: 'PowerShell Encoded Command',
    category: 'obfuscation',
    pattern: /-(?:enc|encodedcommand)\s+[A-Za-z0-9+/=]{10,}/i,
    description: 'Uses base64 encoded PowerShell command line argument',
  },
  {
    name: 'PowerShell ExecutionPolicy Bypass',
    category: 'powershell',
    pattern: /-(?:ep|executionpolicy)\s+bypass/i,
    description: 'Attempts to bypass Windows PowerShell execution policy',
  },
  {
    name: 'Hidden Window Style',
    category: 'execution',
    pattern: /-(?:w|windowstyle)\s+hidden/i,
    description: 'Executes processes in a hidden background window',
  },
  {
    name: 'PowerShell Web Download',
    category: 'network',
    pattern: /(?:DownloadFile|DownloadString|DownloadData)\s*\(/i,
    description: 'Uses .NET WebClient or HttpClient to download remote content',
  },
  {
    name: 'PowerShell Invoke-WebRequest / IWR',
    category: 'network',
    pattern: /\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i,
    description: 'Performs web requests to download or transmit data',
  },
  {
    name: 'PowerShell Invoke-Expression / IEX',
    category: 'execution',
    pattern: /\b(?:Invoke-Expression|iex)\b/i,
    description: 'Dynamically executes string or downloaded content as code',
  },

  // Binary downloaders & abuse of living-off-the-land tools
  {
    name: 'CertUtil URL Cache Download',
    category: 'network',
    pattern: /\bcertutil(?:\.exe)?\s+(?:-[a-z]*\s+)*-urlcache/i,
    description: 'Uses CertUtil to download remote files from the internet',
  },
  {
    name: 'BitsAdmin Transfer',
    category: 'network',
    pattern: /\bbitsadmin(?:\.exe)?\s+\/transfer/i,
    description: 'Uses BITSAdmin to download background files',
  },
  {
    name: 'Curl or Wget Download',
    category: 'network',
    pattern: /\b(?:curl|wget)(?:\.exe)?\b/i,
    description: 'Initiates HTTP/HTTPS transfer via curl or wget',
  },

  // Execution & Launching
  {
    name: 'Command Shell Execution',
    category: 'execution',
    pattern: /\bcmd(?:\.exe)?\s+\/[ck]\b/i,
    description: 'Spawns Windows Command Interpreter',
  },
  {
    name: 'MSHTA Execution',
    category: 'execution',
    pattern: /\bmshta(?:\.exe)?\b/i,
    description: 'Uses Microsoft HTML Application Host to execute HTA/VBScript/JS',
  },
  {
    name: 'Rundll32 or Regsvr32 Invocation',
    category: 'execution',
    pattern: /\b(?:rundll32|regsvr32)(?:\.exe)?\b/i,
    description: 'Launches code via Rundll32 or Regsvr32',
  },
  {
    name: 'WScript / CScript Shell Creation',
    category: 'execution',
    pattern: /(?:WScript\.Shell|Shell\.Application)/i,
    description: 'Creates Windows Script Host shell COM object to launch processes',
  },

  // File Deletion & Shadow Copy Deletion
  {
    name: 'Volume Shadow Copy Deletion',
    category: 'deletion',
    pattern: /\bvssadmin(?:\.exe)?\s+delete\s+shadows/i,
    description: 'Attempts to delete Windows Volume Shadow Copies (ransomware indicator)',
  },
  {
    name: 'Forced File Deletion',
    category: 'deletion',
    pattern: /\b(?:del|erase)\s+(?:\/[a-z]\s+)*(?:\/f|\/q|\*)/i,
    description: 'Forcibly deletes files silently without user confirmation',
  },
  {
    name: 'Directory Removal',
    category: 'deletion',
    pattern: /\b(?:rmdir|rd)\s+\/s/i,
    description: 'Recursively removes directory trees',
  },

  // Registry & Persistence
  {
    name: 'Registry Modification Command',
    category: 'registry',
    pattern: /\breg(?:\.exe)?\s+(?:add|delete)\b/i,
    description: 'Directly modifies Windows Registry keys via command line',
  },
  {
    name: 'Run / Startup Persistence Key',
    category: 'persistence',
    pattern: /(?:CurrentVersion\\Run|CurrentVersion\\RunOnce)/i,
    description: 'References Windows autostart Run or RunOnce registry keys',
  },
  {
    name: 'Scheduled Task Creation',
    category: 'persistence',
    pattern: /\bschtasks(?:\.exe)?\s+\/create/i,
    description: 'Schedules automated persistent background task',
  },
  {
    name: 'Service Creation',
    category: 'persistence',
    pattern: /\bsc(?:\.exe)?\s+create\b/i,
    description: 'Installs a persistent background Windows Service',
  },
  {
    name: 'WMIC Process Creation',
    category: 'execution',
    pattern: /\bwmic(?:\.exe)?\s+process\s+call\s+create/i,
    description: 'Uses WMI to spawn processes remotely or locally',
  },

  // Obfuscation
  {
    name: 'Base64 Decoding Routine',
    category: 'obfuscation',
    pattern: /(?:FromBase64String|atob\s*\(|base64_decode)/i,
    description: 'Contains routine to decode base64 data into memory or disk',
  },
  {
    name: 'Dynamic Eval / Unescape',
    category: 'obfuscation',
    pattern: /\b(?:eval|unescape)\s*\(/i,
    description: 'Uses dynamic code evaluation',
  },
];

/**
 * Safely performs static text inspection on script files (.bat, .cmd, .ps1, .vbs, .js).
 * NEVER executes the script.
 */
export async function analyzeScriptFile(filePath: string): Promise<ScriptAnalysisResult> {
  const ext = path.extname(filePath).toLowerCase();

  let scriptType: ScriptAnalysisResult['scriptType'] = 'UNKNOWN';
  if (['.bat', '.cmd'].includes(ext)) scriptType = 'BATCH';
  else if (['.ps1', '.psm1'].includes(ext)) scriptType = 'POWERSHELL';
  else if (['.vbs', '.vbe'].includes(ext)) scriptType = 'VBSCRIPT';
  else if (['.js', '.jse'].includes(ext)) scriptType = 'JAVASCRIPT';
  else if (['.sh', '.bash'].includes(ext)) scriptType = 'SHELL';

  let content: string;
  try {
    // Read up to 2MB of text safely to prevent memory exhaustion
    const buffer = await fs.readFile(filePath);
    content = buffer.subarray(0, 2 * 1024 * 1024).toString('utf-8');
  } catch {
    return {
      isScript: true,
      scriptType,
      lineCount: 0,
      indicators: ['Failed to read script file content'],
      detectedCommands: [],
      hasObfuscation: false,
      hasNetworkActivity: false,
      hasPersistence: false,
      hasFileDeletion: false,
      hasRegistryModification: false,
    };
  }

  const lines = content.split(/\r?\n/);
  const lineCount = lines.length;

  const indicators: string[] = [];
  const detectedCommands: string[] = [];

  let hasObfuscation = false;
  let hasNetworkActivity = false;
  let hasPersistence = false;
  let hasFileDeletion = false;
  let hasRegistryModification = false;

  for (const pat of SUSPICIOUS_PATTERNS) {
    if (pat.pattern.test(content)) {
      indicators.push(`${pat.name}: ${pat.description}`);
      detectedCommands.push(pat.name);

      if (pat.category === 'obfuscation') hasObfuscation = true;
      if (pat.category === 'network') hasNetworkActivity = true;
      if (pat.category === 'persistence') hasPersistence = true;
      if (pat.category === 'deletion') hasFileDeletion = true;
      if (pat.category === 'registry') hasRegistryModification = true;
    }
  }

  return {
    isScript: true,
    scriptType,
    lineCount,
    indicators,
    detectedCommands,
    hasObfuscation,
    hasNetworkActivity,
    hasPersistence,
    hasFileDeletion,
    hasRegistryModification,
  };
}
