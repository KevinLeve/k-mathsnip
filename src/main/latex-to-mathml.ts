/**
 * LaTeX -> Presentation MathML, for clipboard paste into Word as a real, editable equation.
 *
 * Direct TypeScript port of the Python implementation validated in pdf2word
 * (pdf2word/write/latex_omml.py + latex_mathml.py), kept in one file here for a single-package
 * Electron app. Scope is deliberately narrow — exactly the constructs real formula-recognition
 * output uses: fractions, subscripts/superscripts (incl. combined), n-ary sum/prod/int with limits,
 * accents, Greek letters, parenthesised/bracketed groups, a single-row alignment-environment
 * wrapper, ellipsis, +-=<> operators. Anything outside this raises LatexParseError so the caller
 * falls back to plain-text copy rather than guessing.
 *
 * Verified against real Word (2026-11-07): copying a native equation from Word puts Presentation
 * MathML on the clipboard under the registered format name "MathML Presentation"; writing synthetic
 * MathML back under that same format and pasting (Ctrl+V) creates a real OMath object in Word.
 */

export class LatexParseError extends Error {}

const IGNORED_CMDS = new Set([
  'displaystyle', 'textstyle', 'scriptstyle', 'quad', 'qquad',
  'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr',
  'Biggl', 'Biggr', 'limits', 'nolimits', 'small', 'boldsymbol', 'mathbf', 'bf',
]);

const SYMBOL: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ',
  mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  ldots: '…', cdots: '⋯', dots: '…',
  times: '×', div: '÷', pm: '±',
  leq: '≤', geq: '≥', neq: '≠', approx: '≈',
  infty: '∞', cdot: '⋅',
};

const FRAC_CMDS = new Set(['frac', 'cfrac', 'dfrac', 'tfrac']);

const ACCENT: Record<string, string> = {
  hat: '^', widehat: '^',
  bar: '-', overline: '-',
  tilde: '~', widetilde: '~',
  vec: '→',
};

const DELIM_OPEN: Record<string, string> = { '(': ')', '[': ']', '\\{': '\\}' };

function tokenize(src: string): string[] {
  const re = /(\\[A-Za-z]+)|(\\[,!;: ])|([{}])|([\^_])|(.)/gs;
  const toks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[2]) continue; // spacing command, ignored
    const val = m[0];
    if (m[5] && /\s/.test(val)) continue;
    toks.push(val);
  }
  return toks;
}

type Run = { kind: 'Run'; text: string; italic: boolean };
type Seq = { kind: 'Seq'; items: Node[] };
type Frac = { kind: 'Frac'; num: Node; den: Node };
type Sub = { kind: 'Sub'; base: Node; sub: Node };
type Sup = { kind: 'Sup'; base: Node; sup: Node };
type SubSup = { kind: 'SubSup'; base: Node; sub: Node; sup: Node };
type Nary = { kind: 'Nary'; op: string; sub: Node | null; sup: Node | null; body: Node };
type Accent = { kind: 'Accent'; base: Node; char: string };
type Delim = { kind: 'Delim'; open: string; close: string; body: Node };
type Node = Run | Seq | Frac | Sub | Sup | SubSup | Nary | Accent | Delim;

const run = (text: string, italic = true): Run => ({ kind: 'Run', text, italic });
const emptyRun = (): Run => run('');
const isEmpty = (n: Node): boolean =>
  (n.kind === 'Run' && n.text === '') || (n.kind === 'Seq' && n.items.length === 0);

class Parser {
  i = 0;
  constructor(private toks: string[]) {}

  peek(): string | undefined {
    return this.toks[this.i];
  }
  next(): string {
    if (this.i >= this.toks.length) throw new LatexParseError('unexpected end of input');
    return this.toks[this.i++];
  }
  expect(tok: string): void {
    const t = this.next();
    if (t !== tok) throw new LatexParseError(`expected ${tok}, got ${t}`);
  }

  parseSequence(stop: Set<string>): Node {
    const items: Node[] = [];
    while (true) {
      const t = this.peek();
      if (t === undefined || stop.has(t)) break;
      items.push(this.parseAtomWithPostfix(true));
    }
    if (items.length === 0) return emptyRun();
    return items.length === 1 ? items[0] : { kind: 'Seq', items };
  }

  parseGroup(): Node {
    if (this.peek() === '{') {
      this.next();
      const node = this.parseSequence(new Set(['}']));
      this.expect('}');
      return node;
    }
    return this.parseAtomWithPostfix(false);
  }

  parseAtomWithPostfix(allowPostfix: boolean): Node {
    const base = this.parseAtom();
    if (!allowPostfix) return base;
    let subNode: Node | null = null;
    let supNode: Node | null = null;
    while (this.peek() === '_' || this.peek() === '^') {
      const t = this.next();
      const g = this.parseGroup();
      if (t === '_') subNode = g;
      else supNode = g;
    }
    if (subNode !== null && supNode !== null) return { kind: 'SubSup', base, sub: subNode, sup: supNode };
    if (subNode !== null) return { kind: 'Sub', base, sub: subNode };
    if (supNode !== null) return { kind: 'Sup', base, sup: supNode };
    return base;
  }

  parseAtom(): Node {
    const t = this.next();

    if (t === '{') {
      const node = this.parseSequence(new Set(['}']));
      this.expect('}');
      return node;
    }

    if (t in DELIM_OPEN) {
      const close = DELIM_OPEN[t];
      const body = this.parseSequence(new Set([close]));
      this.expect(close);
      return { kind: 'Delim', open: t, close, body };
    }
    if (t === ')' || t === ']' || t === '\\}') {
      throw new LatexParseError(`unmatched closing delimiter ${t}`);
    }

    if (t === '\\left') {
      const opener = this.next();
      const openMap: Record<string, string> = { '(': ')', '[': ']', '\\{': '\\}', '.': '' };
      if (!(opener in openMap)) throw new LatexParseError(`unsupported \\left delimiter ${opener}`);
      let depth = 0;
      const bodyToks: string[] = [];
      let closer = '';
      while (true) {
        const nt = this.next();
        if (nt === '\\left') depth += 1;
        else if (nt === '\\right') {
          if (depth === 0) {
            closer = this.next();
            break;
          }
          depth -= 1;
        }
        bodyToks.push(nt);
      }
      const sub = new Parser(bodyToks);
      const body = sub.parseSequence(new Set());
      const openDisp = opener === '.' ? '' : opener;
      const closeDisp = closer === '.' ? '' : closer;
      if (openDisp || closeDisp) return { kind: 'Delim', open: openDisp, close: closeDisp, body };
      return body;
    }
    if (t === '\\right') throw new LatexParseError('unmatched \\right');

    const name0 = t.startsWith('\\') ? t.slice(1) : undefined;

    if (name0 && FRAC_CMDS.has(name0)) {
      const num = this.parseGroup();
      const den = this.parseGroup();
      return { kind: 'Frac', num, den };
    }
    if (name0 && name0 in ACCENT) {
      const base = this.parseGroup();
      return { kind: 'Accent', base, char: ACCENT[name0] };
    }
    if (t === '\\sum' || t === '\\prod' || t === '\\int') {
      const op = t === '\\sum' ? '∑' : t === '\\prod' ? '∏' : '∫';
      let subNode: Node | null = null;
      let supNode: Node | null = null;
      while (this.peek() === '_' || this.peek() === '^') {
        const st = this.next();
        const g = this.parseGroup();
        if (st === '_') subNode = g;
        else supNode = g;
      }
      const body = this.parseSequence(new Set(['}', ')', ']', '\\}', '=', '+', '-']));
      return { kind: 'Nary', op, sub: subNode, sup: supNode, body };
    }
    if (t === '\\mathrm' || t === '\\mbox' || t === '\\text' || t === '\\boldsymbol' ||
        t === '\\mathbf' || t === '\\operatorname') {
      return this.parseGroup();
    }
    if ((name0 && IGNORED_CMDS.has(name0)) || t === '\\!' || t === '\\,' || t === '\\;' || t === '\\:') {
      if (this.peek() === '{') return this.parseGroup();
      return { kind: 'Seq', items: [] };
    }
    if (t.startsWith('\\')) {
      if (name0 && name0 in SYMBOL) return run(SYMBOL[name0], false);
      throw new LatexParseError(`unsupported command ${t}`);
    }
    if ('+-=<>|'.includes(t)) return run(t, false);
    if (t === ',') return run(',', false);
    return run(t, /[A-Za-z]/.test(t));
  }
}

const ENV_RE = /^\\begin\s*\{(aligned|array|align\*?)\}(?:\{[^}]*\})?([\s\S]*)\\end\s*\{\1\}$/;

function stripAlignmentEnvironment(src: string): string {
  const m = ENV_RE.exec(src.trim());
  if (!m) return src;
  return m[2].replace(/\\\\/g, ' ').replace(/&/g, ' ');
}

function checkNoEmptyArgs(node: Node): void {
  switch (node.kind) {
    case 'Frac':
      if (isEmpty(node.num) || isEmpty(node.den))
        throw new LatexParseError('fraction with an empty numerator or denominator');
      checkNoEmptyArgs(node.num);
      checkNoEmptyArgs(node.den);
      break;
    case 'Nary':
      if (isEmpty(node.body)) throw new LatexParseError(`${node.op} operator with no summand/body`);
      checkNoEmptyArgs(node.body);
      if (node.sub) checkNoEmptyArgs(node.sub);
      if (node.sup) checkNoEmptyArgs(node.sup);
      break;
    case 'Sub':
      if (isEmpty(node.base)) throw new LatexParseError('subscript with an empty base');
      checkNoEmptyArgs(node.base);
      checkNoEmptyArgs(node.sub);
      break;
    case 'Sup':
      if (isEmpty(node.base)) throw new LatexParseError('superscript with an empty base');
      checkNoEmptyArgs(node.base);
      checkNoEmptyArgs(node.sup);
      break;
    case 'SubSup':
      if (isEmpty(node.base)) throw new LatexParseError('subscript/superscript with an empty base');
      checkNoEmptyArgs(node.base);
      checkNoEmptyArgs(node.sub);
      checkNoEmptyArgs(node.sup);
      break;
    case 'Accent':
      if (isEmpty(node.base)) throw new LatexParseError('accent with an empty base');
      checkNoEmptyArgs(node.base);
      break;
    case 'Delim':
      checkNoEmptyArgs(node.body);
      break;
    case 'Seq':
      for (const it of node.items) checkNoEmptyArgs(it);
      break;
  }
}

export function parseLatex(srcIn: string): Node {
  let src = srcIn.trim();
  if (src.startsWith('$') && src.endsWith('$')) src = src.slice(1, -1);
  if (src.startsWith('\\[') && src.endsWith('\\]')) src = src.slice(2, -2);
  src = stripAlignmentEnvironment(src);
  const toks = tokenize(src);
  const p = new Parser(toks);
  const node = p.parseSequence(new Set());
  if (p.i !== toks.length) throw new LatexParseError(`trailing tokens: ${toks.slice(p.i).join(' ')}`);
  checkNoEmptyArgs(node);
  return node;
}

// ---------------------------------------------------------------- MathML emit
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mi(text: string, italic: boolean): string {
  const variant = italic || /[A-Za-z]/.test(text) ? 'italic' : 'normal';
  return `<mml:mi mathvariant="${variant}">${escapeXml(text)}</mml:mi>`;
}

function leaf(text: string, italic: boolean): string {
  if (/^[0-9.]+$/.test(text) && /[0-9]/.test(text)) return `<mml:mn>${escapeXml(text)}</mml:mn>`;
  if (!italic && !/[A-Za-z]/.test(text)) return `<mml:mo>${escapeXml(text)}</mml:mo>`;
  return mi(text, italic);
}

function row(parts: string[]): string {
  return `<mml:mrow>${parts.join('')}</mml:mrow>`;
}

function emit(node: Node): string {
  switch (node.kind) {
    case 'Run':
      if (node.text === '') return '<mml:mrow/>';
      if (node.text.length > 1 && node.italic)
        return row([...node.text].map((ch) => leaf(ch, node.italic)));
      return leaf(node.text, node.italic);
    case 'Seq':
      return row(node.items.map(emit));
    case 'Frac':
      return `<mml:mfrac>${row([emit(node.num)])}${row([emit(node.den)])}</mml:mfrac>`;
    case 'Sub':
      return `<mml:msub>${row([emit(node.base)])}${row([emit(node.sub)])}</mml:msub>`;
    case 'Sup':
      return `<mml:msup>${row([emit(node.base)])}${row([emit(node.sup)])}</mml:msup>`;
    case 'SubSup':
      return `<mml:msubsup>${row([emit(node.base)])}${row([emit(node.sub)])}${row([emit(node.sup)])}</mml:msubsup>`;
    case 'Nary': {
      const sub = node.sub ? row([emit(node.sub)]) : '<mml:mrow/>';
      const sup = node.sup ? row([emit(node.sup)]) : '<mml:mrow/>';
      const op = `<mml:mo stretchy="false">${escapeXml(node.op)}</mml:mo>`;
      return `<mml:munderover>${op}${sub}${sup}</mml:munderover>${row([emit(node.body)])}`;
    }
    case 'Accent':
      return `<mml:mover accent="true">${row([emit(node.base)])}<mml:mo>${escapeXml(node.char)}</mml:mo></mml:mover>`;
    case 'Delim': {
      const inner = row([emit(node.body)]);
      if (!node.open && !node.close) return inner;
      return `<mml:mfenced open="${escapeXml(node.open)}" close="${escapeXml(node.close)}">${inner}</mml:mfenced>`;
    }
  }
}

/** LaTeX math string -> standalone Presentation MathML document. Throws LatexParseError on
 * anything outside the supported grammar subset — caller should fall back to plain-text copy. */
export function latexToMathml(src: string): string {
  const ast = parseLatex(src);
  const body = emit(ast);
  return `<?xml version="1.0"?>\r\n<mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML">${body}</mml:math>\r\n`;
}
