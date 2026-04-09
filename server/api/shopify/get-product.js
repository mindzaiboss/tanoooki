// server/api/shopify/get-product.js
const shopifyAdminAPI = require('../shopify-client');
const { resolveBrandDisplayName } = require('./brand-metaobject');

// Reverse condition map: Shopify display value → frontend slug
const CONDITION_REVERSE_MAP = {
  'New / Sealed': 'new-sealed',
  'Opened / Used': 'opened-used',
};

// Shopify WeightUnit enum → frontend slug
const WEIGHT_UNIT_REVERSE_MAP = {
  POUNDS: 'lb',
  KILOGRAMS: 'kg',
  GRAMS: 'g',
  OUNCES: 'oz',
};

module.exports = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ success: false, error: 'Missing productId' });
    }

    const gid = `gid://shopify/Product/${productId}`;

    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          descriptionHtml
          handle
          status
          vendor
          featuredImage { url altText }
          images(first: 10) {
            edges {
              node { id url altText }
            }
          }
          variants(first: 1) {
            edges {
              node {
                id
                price
                sku
                barcode
                inventoryPolicy
                inventoryItem {
                  id
                  measurement {
                    weight { value unit }
                  }
                  inventoryLevels(first: 1) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          metafields(first: 30, namespace: "custom") {
            edges {
              node { key value }
            }
          }
        }
      }
    `;

    const response = await shopifyAdminAPI({ query, variables: { id: gid } });
    const product = response.data?.product;

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Extract custom metafields into a flat object
    const mf = {};
    for (const edge of product.metafields?.edges || []) {
      mf[edge.node.key] = edge.node.value;
    }

    const variant = product.variants?.edges?.[0]?.node;

    // Price: Shopify dollars → cents
    const priceInCents = variant?.price ? Math.round(parseFloat(variant.price) * 100) : null;

    // Stock quantity
    const stockQuantity = variant?.inventoryItem?.inventoryLevels?.edges?.[0]
      ?.node?.quantities?.find(q => q.name === 'available')?.quantity ?? null;

    // Weight from variant shipping fields
    const weightData = variant?.inventoryItem?.measurement?.weight;
    const packageWeight = weightData?.value ?? null;
    const packageWeightUnit = WEIGHT_UNIT_REVERSE_MAP[weightData?.unit] || 'lb';

    // Condition: reverse-map Shopify display value → frontend slug
    const rawCondition = mf.condition || '';
    const itemcondition = CONDITION_REVERSE_MAP[rawCondition] || rawCondition;

    // Brand: resolve metaobject GID → display name
    const brand = await resolveBrandDisplayName(mf.brand || '');

    // Boolean metafields stored as "true"/"false" strings
    const original_packaging_included = mf.includes_original_packaging === 'true'
      ? 'yes-original-packaging'
      : '';
    const includes_card = mf.includes_card === 'true';

    // Images mapped to Sharetribe-compatible shape
    const images = (product.images?.edges || []).map(edge => {
      const url = edge.node.url;
      const imgGid = edge.node.id;
      const numericId = imgGid.split('/').pop();
      return {
        id: { uuid: numericId },
        type: 'image',
        attributes: {
          variants: {
            'listing-card': { url, width: 400, height: 400 },
            'listing-card-2x': { url, width: 800, height: 800 },
          },
        },
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        id: productId,
        title: product.title,
        description: product.descriptionHtml,
        handle: product.handle,
        status: product.status,
        vendor: product.vendor,
        price: priceInCents,
        stock: stockQuantity,
        sku: variant?.sku,
        barcode: variant?.barcode,
        variantId: variant?.id || null,
        images,
        imageUrl: product.featuredImage?.url || null,
        publicData: {
          // UI-only fields — hardcoded defaults so wizard doesn't break
          listingType: 'product-selling',
          transactionProcessAlias: 'default-buying-money-in-use/release-1',
          unitType: 'item',
          categoryLevel1: product.productType || '',
          // Product details
          brand,
          artist: mf.artist || '',
          series_collection: mf.series_collection || '',
          edition_size_exclusivity: mf.edition_size_exclusivity || '',
          itemcondition,
          condition_notes: mf.condition_notes || '',
          original_packaging_included,
          includes_card,
          barcode_UPC: variant?.barcode || variant?.sku || '',
          // Shipping — weight from variant, both prefixed and unprefixed for form compat
          shippingEnabled: true,
          packageWeight,
          pub_packageWeight: packageWeight,
          packageWeightUnit,
          pub_packageWeightUnit: packageWeightUnit,
        },
      },
    });

  } catch (error) {
    console.error('Get product error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
