// server/api/shopify/brand-metaobject.js
// Helpers for resolving brand names <-> Shopify metaobject GIDs.
// Brands are stored as `metaobject_reference` metafields on products.
// The metaobject type handle is expected to be "brand".
const shopifyAdminAPI = require('../shopify-client');

/**
 * Normalize a brand display name to a slug-style key.
 * "Pop Mart" → "pop-mart", "KAWS" → "kaws"
 */
function normalizeBrandName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Find a brand metaobject GID by display name.
 * Queries all metaobjects of type "brand" and matches against:
 *   1. A field named "normalized_key" equal to the slugified name
 *   2. A field named "display_name" (case-insensitive) equal to the raw name
 *
 * Returns the GID string (e.g. "gid://shopify/Metaobject/12345") or null if not found.
 */
async function findBrandMetaobject(brandName) {
  if (!brandName) return null;

  const normalized = normalizeBrandName(brandName);

  const query = `
    query getBrands($type: String!) {
      metaobjects(type: $type, first: 250) {
        edges {
          node {
            id
            fields {
              key
              value
            }
          }
        }
      }
    }
  `;

  const response = await shopifyAdminAPI({ query, variables: { type: 'brand' } });
  const edges = response.data?.metaobjects?.edges || [];

  for (const { node } of edges) {
    const fields = {};
    for (const f of node.fields) {
      fields[f.key] = f.value;
    }

    const normalizedKey = fields.normalized_key || normalizeBrandName(fields.display_name || fields.name || '');
    const displayName = (fields.display_name || fields.name || '').toLowerCase();

    if (normalizedKey === normalized || displayName === brandName.trim().toLowerCase()) {
      return node.id; // GID like "gid://shopify/Metaobject/12345"
    }
  }

  console.warn(`[brand-metaobject] No metaobject found for brand: "${brandName}" (normalized: "${normalized}")`);
  return null;
}

/**
 * Resolve a brand metafield value (which may be a GID or a plain string) to a display name.
 * If the value looks like a GID, query the metaobject for its display_name field.
 * Otherwise return it as-is (legacy plain-string values).
 */
async function resolveBrandDisplayName(brandValue) {
  if (!brandValue) return '';

  // If it's not a GID, return as-is (plain string stored in older listings)
  if (!brandValue.startsWith('gid://shopify/Metaobject/')) {
    return brandValue;
  }

  const query = `
    query getMetaobject($id: ID!) {
      metaobject(id: $id) {
        fields {
          key
          value
        }
      }
    }
  `;

  const response = await shopifyAdminAPI({ query, variables: { id: brandValue } });
  const fields = response.data?.metaobject?.fields || [];

  for (const f of fields) {
    if (f.key === 'display_name' || f.key === 'name') {
      return f.value || '';
    }
  }

  return brandValue; // Fallback: return the GID if fields not found
}

module.exports = { findBrandMetaobject, resolveBrandDisplayName, normalizeBrandName };
