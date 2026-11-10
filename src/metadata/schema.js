/**
 * @file src/metadata/schema.js
 * @description Schema validation and specification for versioned Scientific Document IR (v2.0.0).
 * Preserves strict backward compatibility with v1.0.0 minimal IR while adding validated scientific metadata.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Current version of the Scientific Metadata Schema.
 */
export const SCIENTIFIC_METADATA_VERSION = '2.0.0';

/**
 * Validates a scientific metadata object structure.
 *
 * @param {Object} metadata
 * @returns {boolean}
 */
export function validateScientificMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.version !== SCIENTIFIC_METADATA_VERSION) return false;

  const requiredFields = [
    'title',
    'subtitle',
    'authors',
    'affiliations',
    'emails',
    'abstract',
    'keywords',
    'doi',
    'year',
    'venue',
    'publisher',
    'documentType',
    'sections',
    'references'
  ];

  for (const field of requiredFields) {
    if (!(field in metadata)) return false;
  }

  // Validate field structure with provenance
  const provFields = [
    'title',
    'subtitle',
    'abstract',
    'doi',
    'year',
    'venue',
    'publisher',
    'documentType'
  ];

  for (const field of provFields) {
    const val = metadata[field];
    if (!val || typeof val !== 'object') return false;
    if (!['extracted', 'inferred', 'unavailable'].includes(val.source)) return false;
    if (typeof val.confidence !== 'number') return false;
  }

  // Validate authors array
  if (!Array.isArray(metadata.authors)) return false;
  for (const author of metadata.authors) {
    if (!author || typeof author !== 'object') return false;
    if (typeof author.name !== 'string' || !author.name) return false;
    if (typeof author.order !== 'number') return false;
    if (!Array.isArray(author.affiliations)) return false;
  }

  // Validate section tree
  if (!Array.isArray(metadata.sections)) return false;
  for (const sec of metadata.sections) {
    if (!validateSectionNode(sec)) return false;
  }

  // Validate references array
  if (!Array.isArray(metadata.references)) return false;
  for (const ref of metadata.references) {
    if (!ref || typeof ref !== 'object') return false;
    if (typeof ref.index !== 'number' || typeof ref.raw !== 'string') return false;
    if (!Array.isArray(ref.authors)) return false;
  }

  return true;
}

/**
 * Recursively validates a section tree node.
 *
 * @param {Object} node
 * @returns {boolean}
 */
export function validateSectionNode(node) {
  if (!node || typeof node !== 'object') return false;
  if (typeof node.title !== 'string') return false;
  if (typeof node.level !== 'number') return false;
  if (typeof node.page !== 'number') return false;
  if (!Array.isArray(node.children)) return false;

  for (const child of node.children) {
    if (!validateSectionNode(child)) return false;
  }

  return true;
}

/**
 * Validates a Document IR object, supporting both v1.0.0 minimal schema
 * and v2.0.0 extended Scientific Document IR.
 *
 * @param {Object} doc - Document IR object to validate.
 * @returns {boolean} True if valid according to v1 or v2 schema.
 */
export function validateDocumentIRV2(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (!doc.metadata || typeof doc.metadata !== 'object') return false;
  if (typeof doc.metadata.title !== 'string') return false;
  if (typeof doc.metadata.pageCount !== 'number') return false;
  if (!Array.isArray(doc.pages)) return false;

  for (const pageObj of doc.pages) {
    if (!pageObj || typeof pageObj !== 'object') return false;
    if (typeof pageObj.page !== 'number') return false;
    if (typeof pageObj.content !== 'string') return false;
  }

  // If scientificMetadata is present, validate it
  if (doc.scientificMetadata !== undefined) {
    return validateScientificMetadata(doc.scientificMetadata);
  }

  return true;
}
