// server/api/shopify/update-product.js
const shopifyAdminAPI = require('../shopify-client');
const { findBrandMetaobject } = require('./brand-metaobject');

// Weight unit: frontend slug → Shopify WeightUnit enum
const WEIGHT_UNIT_MAP = {
  lb: 'POUNDS',
  lbs: 'POUNDS',
  kg: 'KILOGRAMS',
  g: 'GRAMS',
  oz: 'OUNCES',
};

const CONDITION_MAP = {
  'new-sealed': 'New / Sealed',
  'opened-used': 'Opened / Used',
};

const EDITION_MAP = {
  'standard_edition': 'Standard Item',
  'standard-edition': 'Standard Item',
  'limited_edition': 'Limited Edition',
  'limited-edition': 'Limited Edition',
  'convention_exclusive': 'Convention Exclusive',
  'convention-exclusive': 'Convention Exclusive',
  'artist_proof': 'Artist Proof',
  'artist-proof': 'Artist Proof',
  'signed_autographed': 'Signed / Autographed',
  'signed-autographed': 'Signed / Autographed',
};

module.exports = async (req, res) => {
  try {
    console.log('=== UPDATE PRODUCT CALLED ===');
    console.log('req.body:', JSON.stringify(req.body, null, 2));
    console.log('productId:', req.body.productId);

    const { productId, vendorUsername, title, description, price, publicData, variantId } = req.body;

    if (!productId) {
      console.error('UPDATE PRODUCT ERROR: Missing productId');
      return res.status(400).json({ success: false, error: 'Missing productId' });
    }

    // Resolve brand name → metaobject GID
    const brandGid = publicData?.brand ? await findBrandMetaobject(publicData.brand) : null;
    console.log(`[update-product] brand "${publicData?.brand}" → GID: ${brandGid}`);

    // Map condition slug → Shopify display value
    const conditionValue = CONDITION_MAP[publicData?.itemcondition] || publicData?.itemcondition || '';
    if (publicData?.itemcondition && !CONDITION_MAP[publicData.itemcondition]) {
      console.warn('Unknown condition value:', publicData.itemcondition);
    }

    // Map edition slug → Shopify enum choice
    const rawEdition = publicData?.edition_size_exclusivity || publicData?.edition || '';
    const editionValue = EDITION_MAP[rawEdition] || '';
    if (rawEdition && !EDITION_MAP[rawEdition]) {
      console.warn('Unknown edition value:', rawEdition);
    }

    // includes_* are enum fields in Shopify with choices ["Yes", "No"]
    const includesOriginalPackaging = publicData?.original_packaging_included === 'yes-original-packaging' ? 'Yes' : 'No';
    const includesCard = (publicData?.includes_card === true || publicData?.includes_card === 'true') ? 'Yes' : 'No';

    const metafields = [
      brandGid
        ? { namespace: 'custom', key: 'brand', value: brandGid, type: 'metaobject_reference' }
        : null,
      { namespace: 'custom', key: 'artist', value: publicData?.artist || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'series_collection', value: publicData?.series_collection || publicData?.series || '', type: 'single_line_text_field' },
      editionValue ? { namespace: 'custom', key: 'edition_size_exclusivity', value: editionValue, type: 'single_line_text_field' } : null,
      { namespace: 'custom', key: 'condition', value: conditionValue, type: 'single_line_text_field' },
      { namespace: 'custom', key: 'condition_notes', value: publicData?.condition_notes || '', type: 'multi_line_text_field' },
      { namespace: 'custom', key: 'includes_original_packaging', value: includesOriginalPackaging, type: 'single_line_text_field' },
      { namespace: 'custom', key: 'includes_card', value: includesCard, type: 'single_line_text_field' },
      { namespace: 'custom', key: 'fulfillment_method', value: 'Fulfilled by Seller', type: 'single_line_text_field' },
    ].filter(m => m && m.value && m.value !== 'false');

    // ─── Step 1: Update product fields and metafields ───
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title handle }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      input: {
        id: productId,
        title,
        descriptionHtml: description,
        vendor: vendorUsername || undefined,
        tags: [
          'tanoooki',
          publicData?.brand,
          publicData?.series_collection || publicData?.series,
          publicData?.categoryLevel1,
        ].filter(Boolean),
        metafields,
      },
    };

    const shopifyResponse = await shopifyAdminAPI({ query: mutation, variables });

    if (shopifyResponse.data.productUpdate.userErrors.length > 0) {
      console.error('Shopify userErrors:', shopifyResponse.data.productUpdate.userErrors);
      return res.status(400).json({
        success: false,
        errors: shopifyResponse.data.productUpdate.userErrors,
      });
    }

    // ─── Step 2: Update variant — price, barcode, weight ───
    if (variantId) {
      const weightValue = publicData?.pub_packageWeight ?? publicData?.packageWeight ?? null;
      const weightUnitRaw = publicData?.pub_packageWeightUnit || publicData?.packageWeightUnit || 'lb';
      const weightUnit = WEIGHT_UNIT_MAP[weightUnitRaw] || 'POUNDS';

      const variantInput = {
        id: variantId,
        barcode: publicData?.barcode_UPC || '',
        inventoryItem: {
          sku: publicData?.barcode_UPC || undefined,
          ...(weightValue != null ? {
            measurement: {
              weight: { value: parseFloat(weightValue), unit: weightUnit },
            },
          } : {}),
        },
        ...(price != null ? { price: (parseFloat(price) / 100).toFixed(2) } : {}),
      };

      const variantMutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }
      `;

      const variantResponse = await shopifyAdminAPI({
        query: variantMutation,
        variables: { productId, variants: [variantInput] },
      });

      if (variantResponse.data.productVariantsBulkUpdate.userErrors.length > 0) {
        console.warn('Variant update warnings:', variantResponse.data.productVariantsBulkUpdate.userErrors);
      }
    }

    return res.status(200).json({
      success: true,
      data: shopifyResponse.data.productUpdate.product,
    });

  } catch (error) {
    console.error('UPDATE PRODUCT ERROR:', error.message);
    console.error('Full error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
