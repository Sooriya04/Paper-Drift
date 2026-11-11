/**
@file src/math/schema.js
@description Structured Math Intermediate Representation (Math IR) schema, tree representation,
and exporters for LaTeX, MathML, and Markdown.
Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
*/

/**
 * Creates a structured Math IR node.
 * @param {string} type - Node type (e.g. 'number', 'identifier', 'operator', 'greek', 'superscript', 'subscript', 'fraction', 'sqrt', 'matrix', 'integral', 'summation', 'limit', 'row', 'equation')
 * @param {Object} [props={}] - Node properties and children
 * @returns {Object} Math IR node
 */
export function createMathNode(type, props = {}) {
  return {
    type,
    ...props
  };
}

/**
 * Validates a Math IR node or tree.
 * @param {Object} node - Math IR node
 * @returns {boolean} True if valid
 */
export function validateMathIR(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (typeof node.type !== 'string' || node.type.trim() === '') return false;
  return true;
}

/**
 * Converts a Math IR node tree to LaTeX string representation.
 * @param {Object} node - Math IR node
 * @returns {string} LaTeX string
 */
export function toLaTeX(node) {
  if (!node) return '';

  switch (node.type) {
    case 'number':
    case 'identifier':
    case 'text':
      return node.value || '';

    case 'greek':
      return `\\${node.name || node.value || ''}`;

    case 'operator':
      return node.value || '';

    case 'superscript': {
      const base = toLaTeX(node.base);
      const sup = toLaTeX(node.sup || node.exponent);
      return `${base}^{${sup}}`;
    }

    case 'subscript': {
      const base = toLaTeX(node.base);
      const sub = toLaTeX(node.sub || node.index);
      return `${base}_{${sub}}`;
    }

    case 'fraction': {
      const num = toLaTeX(node.numerator || node.num);
      const den = toLaTeX(node.denominator || node.den);
      return `\\frac{${num}}{${den}}`;
    }

    case 'sqrt': {
      const expr = toLaTeX(node.expr || node.content);
      return `\\sqrt{${expr}}`;
    }

    case 'integral': {
      let res = '\\int';
      if (node.lower || node.sub) {
        res += `_{${toLaTeX(node.lower || node.sub)}}`;
      }
      if (node.upper || node.sup) {
        res += `^{${toLaTeX(node.upper || node.sup)}}`;
      }
      if (node.expr) {
        res += ` ${toLaTeX(node.expr)}`;
      }
      return res;
    }

    case 'summation': {
      let res = '\\sum';
      if (node.lower || node.sub) {
        res += `_{${toLaTeX(node.lower || node.sub)}}`;
      }
      if (node.upper || node.sup) {
        res += `^{${toLaTeX(node.upper || node.sup)}}`;
      }
      if (node.expr) {
        res += ` ${toLaTeX(node.expr)}`;
      }
      return res;
    }

    case 'limit': {
      let res = '\\lim';
      if (node.lower || node.sub) {
        res += `_{${toLaTeX(node.lower || node.sub)}}`;
      }
      if (node.expr) {
        res += ` ${toLaTeX(node.expr)}`;
      }
      return res;
    }

    case 'matrix': {
      const rows = (node.rows || []).map(row =>
        (row || []).map(cell => toLaTeX(cell)).join(' & ')
      ).join(' \\\\ \n');
      const env = node.env || 'pmatrix';
      return `\\begin{${env}}\n${rows}\n\\end{${env}}`;
    }

    case 'row':
    case 'block': {
      const children = node.children || node.elements || [];
      return children.map(c => toLaTeX(c)).join(' ');
    }

    case 'equation': {
      const body = toLaTeX(node.body || node.content);
      const label = node.label ? ` \\tag{${node.label}}` : '';
      return `${body}${label}`;
    }

    default:
      if (node.value) return node.value;
      if (Array.isArray(node.children)) {
        return node.children.map(c => toLaTeX(c)).join(' ');
      }
      return '';
  }
}

/**
 * Converts a Math IR node tree to MathML string representation.
 * @param {Object} node - Math IR node
 * @returns {string} MathML XML string
 */
export function toMathML(node) {
  if (!node) return '<math></math>';

  function render(n) {
    if (!n) return '';
    switch (n.type) {
      case 'number':
        return `<mn>${n.value || ''}</mn>`;
      case 'identifier':
        return `<mi>${n.value || ''}</mi>`;
      case 'greek':
        return `<mi>&${n.name || n.value || ''};</mi>`;
      case 'operator':
        return `<mo>${n.value || ''}</mo>`;
      case 'superscript':
        return `<msup>${render(n.base)}<mrow>${render(n.sup || n.exponent)}</mrow></msup>`;
      case 'subscript':
        return `<msub>${render(n.base)}<mrow>${render(n.sub || n.index)}</mrow></msub>`;
      case 'fraction':
        return `<mfrac><mrow>${render(n.numerator || n.num)}</mrow><mrow>${render(n.denominator || n.den)}</mrow></mfrac>`;
      case 'sqrt':
        return `<msqrt>${render(n.expr || n.content)}</msqrt>`;
      case 'integral':
      case 'summation':
      case 'limit': {
        const opSymbol = n.type === 'integral' ? '∫' : (n.type === 'summation' ? '∑' : 'lim');
        const lower = n.lower || n.sub ? render(n.lower || n.sub) : '';
        const upper = n.upper || n.sup ? render(n.upper || n.sup) : '';
        if (lower && upper) {
          return `<munderover><mo>${opSymbol}</mo><mrow>${lower}</mrow><mrow>${upper}</mrow></munderover>`;
        } else if (lower) {
          return `<munder><mo>${opSymbol}</mo><mrow>${lower}</mrow></munder>`;
        } else if (upper) {
          return `<mover><mo>${opSymbol}</mo><mrow>${upper}</mrow></mover>`;
        }
        return `<mo>${opSymbol}</mo>`;
      }
      case 'matrix': {
        const rows = (n.rows || []).map(r =>
          `<mtr>${(r || []).map(c => `<mtd>${render(c)}</mtd>`).join('')}</mtr>`
        ).join('');
        return `<mtable>${rows}</mtable>`;
      }
      case 'row':
      case 'block': {
        const children = n.children || n.elements || [];
        return `<mrow>${children.map(render).join('')}</mrow>`;
      }
      case 'equation':
        return `<mrow>${render(n.body || n.content)}</mrow>`;
      default:
        if (n.value) return `<mi>${n.value}</mi>`;
        if (Array.isArray(n.children)) {
          return `<mrow>${n.children.map(render).join('')}</mrow>`;
        }
        return '';
    }
  }

  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${render(node)}</math>`;
}

/**
 * Converts a Math IR node tree to Markdown string representation.
 * @param {Object} node - Math IR node
 * @param {boolean} [display=false] - Whether display math ($$...$$) or inline ($...$)
 * @returns {string} Markdown string with LaTeX math
 */
export function toMarkdown(node, display = false) {
  const latex = toLaTeX(node);
  if (display) {
    const label = (node.label && !latex.includes(`\\tag{${node.label}}`)) ? ` \\tag{${node.label}}` : '';
    return `$$\n${latex}${label}\n$$`;
  }
  return `$${latex}$`;
}
