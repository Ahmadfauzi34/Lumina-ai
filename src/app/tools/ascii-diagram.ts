// ============================================================
// ENHANCED ASCII DIAGRAM RENDERER
// Fine-tuned untuk visual clarity dan responsiveness
// ============================================================

export interface RenderOptions {
  borderStyle?: 'single' | 'double' | 'heavy' | 'round' | 'minimal';
  colorize?: boolean;        // ANSI color codes
  maxWidth?: number;
  padding?: number;
  truncate?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface TableOptions extends RenderOptions {
  headerStyle?: 'bold' | 'underline' | 'inverse';
  zebraStripes?: boolean;   // Alternate row background
  footer?: string;          // Summary row
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const BORDERS = {
  single: { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘', tj: '┬', bj: '┴', lj: '├', rj: '┤', cross: '┼', h2: '─' },
  double: { h: '═', v: '║', tl: '╔', tr: '╗', bl: '╚', br: '╝', tj: '╦', bj: '╩', lj: '╠', rj: '╣', cross: '╬', h2: '═' },
  heavy: { h: '━', v: '┃', tl: '┏', tr: '┓', bl: '┗', br: '┛', tj: '┳', bj: '┻', lj: '┣', rj: '┫', cross: '╋', h2: '━' },
  round: { h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯', tj: '┬', bj: '┴', lj: '├', rj: '┤', cross: '┼', h2: '─' },
  minimal: { h: ' ', v: ' ', tl: ' ', tr: ' ', bl: ' ', br: ' ', tj: ' ', bj: ' ', lj: ' ', rj: ' ', cross: ' ', h2: ' ' },
};

export class ASCIIDiagram {
  private opts: Required<RenderOptions>;
  private borders: typeof BORDERS.single;

  constructor(options: RenderOptions = {}) {
    this.opts = {
      borderStyle: options.borderStyle || 'single',
      colorize: options.colorize ?? false,
      maxWidth: options.maxWidth ?? 100,
      padding: options.padding ?? 1,
      truncate: options.truncate ?? true,
      align: options.align || 'left',
    };
    this.borders = BORDERS[this.opts.borderStyle];
  }

  // ============================================================
  // SMART TABLE — Auto-fit dengan content-aware truncation
  // ============================================================

  table(headers: string[], rows: string[][], options: TableOptions = {}): string {
    const opts = { ...this.opts, ...options };
    const borders = BORDERS[opts.borderStyle!];
    
    // Calculate optimal column widths
    const colCount = headers.length;
    let availableWidth = opts.maxWidth - (colCount + 1) - (opts.padding * 2 * colCount);
    if (availableWidth < 1) availableWidth = 10;
    
    // Content widths
    const contentWidths = headers.map((h, i) => {
      const headerW = this.strWidth(h);
      const maxRowW = rows.reduce((max, row) => {
        const cell = row[i] || '';
        return Math.max(max, this.strWidth(cell));
      }, 0);
      return Math.max(headerW, maxRowW, 3); // Minimum 3 chars
    });

    // Distribute available space proportionally
    const totalContent = contentWidths.reduce((a, b) => a + b, 0);
    let colWidths: number[];
    
    if (totalContent <= availableWidth) {
      // Add extra space proportionally
      const extra = availableWidth - totalContent;
      colWidths = contentWidths.map(w => w + Math.floor((w / totalContent) * extra));
    } else {
      // Truncate — prioritize wider columns
      const scale = availableWidth / totalContent;
      colWidths = contentWidths.map(w => Math.max(3, Math.floor(w * scale)));
    }

    // Ensure sum fits
    const currentSum = colWidths.reduce((a, b) => a + b, 0);
    if (currentSum > availableWidth) {
      const shrink = currentSum - availableWidth;
      const maxIdx = colWidths.indexOf(Math.max(...colWidths));
      colWidths[maxIdx] -= shrink;
    }

    const innerWidths = colWidths.map(w => w + opts.padding * 2);

    // Build output
    let result = '';

    // Top border
    result += this.line(innerWidths, 'top', borders);

    // Header
    const headerCells = headers.map((h, i) => this.cell(h, innerWidths[i], 'center', opts as Required<RenderOptions>));
    result += this.row(headerCells, borders);
    
    if (options.headerStyle === 'underline' || options.headerStyle === 'inverse') {
      result += this.line(innerWidths, 'mid', borders, borders.h2);
    } else {
      result += this.line(innerWidths, 'mid', borders);
    }

    // Rows
    rows.forEach((row, idx) => {
      const cells = row.map((cell, i) => {
        const truncated = opts.truncate ? this.truncate(cell, colWidths[i]) : cell;
        return this.cell(truncated, innerWidths[i], opts.align, opts as Required<RenderOptions>);
      });
      
      const rowStr = this.row(cells, borders);
      
      // Zebra stripes dengan ANSI
      if (opts.colorize && options.zebraStripes && idx % 2 === 1) {
        result += ANSI.dim + rowStr + ANSI.reset + '\n';
      } else {
        result += rowStr + '\n';
      }
    });

    // Footer
    if (options.footer) {
      result += this.line(innerWidths, 'mid', borders);
      const footerCell = this.cell(options.footer, innerWidths.reduce((a, b) => a + b, 0) + (colCount - 1), 'center', opts as Required<RenderOptions>);
      result += this.row([footerCell], borders);
    }

    // Bottom border
    result += this.line(innerWidths, 'bottom', borders);

    return result;
  }

  // ============================================================
  // PROGRESS BAR — Untuk loading states
  // ============================================================

  progressBar(label: string, current: number, total: number, width = 40): string {
    const ratio = Math.min(current / total, 1);
    const filled = Math.floor(width * ratio);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.floor(ratio * 100);
    
    if (this.opts.colorize) {
      const color = ratio < 0.3 ? ANSI.red : ratio < 0.7 ? ANSI.yellow : ANSI.green;
      return `${label} ${color}[${bar}]${ANSI.reset} ${percent}% (${current}/${total})`;
    }
    
    return `${label} [${bar}] ${percent}% (${current}/${total})`;
  }

  // ============================================================
  // TREE VIEW — Untuk nested structures (file tree, step hierarchy)
  // ============================================================

  tree(items: { label: string; status?: string; children?: any[] }[], prefix = ''): string {
    let result = '';
    
    items.forEach((item, idx) => {
      const isLast = idx === items.length - 1;
      const branch = isLast ? '└── ' : '├── ';
      const extend = isLast ? '    ' : '│   ';
      
      const statusIcon = item.status === 'done' ? '✓ ' :
                        item.status === 'running' ? '▶ ' :
                        item.status === 'error' ? '✗ ' :
                        item.status === 'pending' ? '○ ' : '  ';
      
      const line = prefix + branch + statusIcon + item.label;
      result += line + '\n';
      
      if (item.children) {
        result += this.tree(item.children, prefix + extend);
      }
    });
    
    return result;
  }

  // ============================================================
  // METRIC CARDS — Untuk KPI/metrics display
  // ============================================================

  metricCards(metrics: { label: string; value: string | number; unit?: string; trend?: 'up' | 'down' | 'neutral' }[]): string {
    const cards = metrics.map(m => {
      const trendIcon = m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→';
      const trendColor = m.trend === 'up' ? ANSI.green : m.trend === 'down' ? ANSI.red : ANSI.gray;
      
      const valueStr = `${m.value}${m.unit || ''}`;
      const width = Math.max(this.strWidth(m.label), this.strWidth(valueStr)) + 4;
      
      let card = '';
      card += '┌' + '─'.repeat(width) + '┐\n';
      card += '│ ' + this.padRight(m.label, width - 2) + ' │\n';
      card += '├' + '─'.repeat(width) + '┤\n';
      
      const valueLine = this.opts.colorize 
        ? `${ANSI.bold}${valueStr}${ANSI.reset} ${trendColor}${trendIcon}${ANSI.reset}`
        : `${valueStr} ${trendIcon}`;
      
      card += '│ ' + this.padCenter(valueLine, width - 2) + ' │\n';
      card += '└' + '─'.repeat(width) + '┘';
      
      return card;
    });
    
    // Side-by-side layout
    return this.sideBySide(cards, 2);
  }

  // ============================================================
  // PIPELINE FLOW — Visualisasi execution flow
  // ============================================================

  pipelineFlow(stages: {
    name: string;
    status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
    detail?: string;
    timeMs?: number;
  }[]): string {
    const maxNameWidth = stages.reduce((max, s) => Math.max(max, this.strWidth(s.name)), 0);
    
    let result = '';
    
    stages.forEach((stage, idx) => {
      const isLast = idx === stages.length - 1;
      
      // Status styling
      const [icon, color] = ({
        pending: ['○', ANSI.gray],
        running: ['◐', ANSI.blue],
        done: ['●', ANSI.green],
        error: ['◉', ANSI.red],
        skipped: ['⊘', ANSI.gray],
      } as Record<string, string[]>)[stage.status] || ['?', ANSI.reset];
      
      // Connector
      const connector = isLast ? '  ' : '  │';
      
      // Box
      const namePadded = this.padRight(stage.name, maxNameWidth);
      const timeStr = stage.timeMs ? ` ${stage.timeMs}ms` : '';
      const detailStr = stage.detail ? ` — ${stage.detail}` : '';
      
      const line = this.opts.colorize
        ? `${connector} ${color}${icon}${ANSI.reset} ${namePadded}${ANSI.dim}${timeStr}${detailStr}${ANSI.reset}`
        : `${connector} ${icon} ${namePadded}${timeStr}${detailStr}`;
      
      result += line + '\n';
      
      if (!isLast) {
        result += '  │\n';
      }
    });
    
    return result;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private sideBySide(blocks: string[], perRow: number): string {
    if (blocks.length === 0) return '';
    const lines = blocks.map(b => b.split('\n'));
    // Filter out undefined to be safe
    const validLines = lines.filter(l => l && l.length > 0);
    if (validLines.length === 0) return blocks.join('\n');

    const maxLines = Math.max(...validLines.map(l => l.length));
    const maxWidth = Math.max(...validLines.map(l => Math.max(...l.map(this.strWidth.bind(this)))));
    
    let result = '';
    for (let row = 0; row < Math.ceil(blocks.length / perRow); row++) {
      const rowBlocks = lines.slice(row * perRow, (row + 1) * perRow);
      
      for (let i = 0; i < maxLines; i++) {
        const lineParts = rowBlocks.map(block => {
          const line = block[i] || '';
          return this.padRight(line, maxWidth + 2);
        });
        result += lineParts.join('') + '\n';
      }
      result += '\n';
    }
    return result.trim();
  }

  private truncate(str: string, maxWidth: number): string {
    if (this.strWidth(str) <= maxWidth) return str;
    
    const ellipsis = '…';
    let result = '';
    let width = 0;
    
    for (const char of str) {
      const charWidth = this.charWidth(char);
      if (width + charWidth + 1 > maxWidth) {
        return result + ellipsis;
      }
      result += char;
      width += charWidth;
    }
    
    return result;
  }

  private charWidth(char: string): number {
    // CJK chars are width 2, others width 1
    const code = char.charCodeAt(0);
    if (code >= 0x3000 && code <= 0x9FFF) return 2;
    if (code >= 0xAC00 && code <= 0xD7AF) return 2; // Korean
    if (code >= 0xFF00 && code <= 0xFFEF) return 2; // Fullwidth
    return 1;
  }

  private strWidth(str: string): number {
    if (typeof str !== 'string') return 0;
    return Array.from(str).reduce((sum, char) => sum + this.charWidth(char), 0);
  }

  private cell(content: string, width: number, align: string, opts: Required<RenderOptions>): string {
    const pad = opts.padding || 1;
    const innerWidth = width - (pad * 2);
    
    let text: string;
    if (align === 'center') {
      text = this.padCenter(content, innerWidth);
    } else if (align === 'right') {
      text = this.padLeft(content, innerWidth);
    } else {
      text = this.padRight(content, innerWidth);
    }
    
    return ' '.repeat(pad) + text + ' '.repeat(pad);
  }

  private row(cells: string[], borders: typeof BORDERS.single): string {
    return borders.v + cells.join(borders.v) + borders.v;
  }

  private line(widths: number[], position: 'top' | 'mid' | 'bottom', borders: typeof BORDERS.single, char?: string): string {
    const h = char || borders.h;
    const left = position === 'top' ? borders.tl : position === 'bottom' ? borders.bl : borders.lj;
    const right = position === 'top' ? borders.tr : position === 'bottom' ? borders.br : borders.rj;
    const sep = position === 'top' ? borders.tj : position === 'bottom' ? borders.bj : borders.cross;
    
    let line = left;
    widths.forEach((w, i) => {
      line += h.repeat(w);
      if (i < widths.length - 1) line += sep;
    });
    line += right + '\n';
    return line;
  }

  private padRight(str: string, width: number): string {
    str = String(str || '');
    const pad = width - this.strWidth(str);
    return str + ' '.repeat(Math.max(0, pad));
  }

  private padLeft(str: string, width: number): string {
    str = String(str || '');
    const pad = width - this.strWidth(str);
    return ' '.repeat(Math.max(0, pad)) + str;
  }

  private padCenter(str: string, width: number): string {
    str = String(str || '');
    const pad = width - this.strWidth(str);
    const left = Math.floor(Math.max(0, pad) / 2);
    const right = Math.max(0, pad) - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  }
}

export const ascii = new ASCIIDiagram({ colorize: false, borderStyle: 'single' });
export const asciiDiagram = ascii; // for backwards compatibility
