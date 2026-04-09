// server/api/shopify/create-product.js
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

// Frontend slug → Shopify enum choice (must match Shopify metafield definition exactly)
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
  console.log('=== CREATE PRODUCT ROUTE HIT ===');
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    const { vendorId, vendorUsername, title, description, price, publicData, images } = req.body;

    if (!title || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, price',
      });
    }

    // Resolve brand name → metaobject GID
    const brandGid = publicData?.brand ? await findBrandMetaobject(publicData.brand) : null;
    console.log(`[create-product] brand "${publicData?.brand}" → GID: ${brandGid}`);

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

    // Prepare images
    const imageInputs = (images || [])
      .map(img => ({ src: img.url }))
      .filter(img => img.src);

    // ─── Step 1: Create product ───
    const createMutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            status
            vendor
            featuredImage { url }
            variants(first: 1) {
              edges {
                node {
                  id
                  inventoryItem { id }
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const createVariables = {
      input: {
        title,
        descriptionHtml: description || '',
        vendor: vendorUsername || 'Tanoooki',
        productType: publicData?.categoryLevel1 || 'Designer Toys',
        status: 'DRAFT',
        tags: [
          'tanoooki',
          publicData?.brand,
          publicData?.series_collection || publicData?.series,
          publicData?.categoryLevel1,
        ].filter(Boolean),
        metafields,
      },
    };

    console.log('=== CREATE PRODUCT DEBUG ===');
    console.log('productType:', publicData?.categoryLevel1);
    console.log('barcode:', publicData?.barcode_UPC);
    console.log('metafields:', JSON.stringify(metafields, null, 2));
    console.log('vendor:', vendorUsername);

    console.log('Step 1: Creating Shopify product...');
    console.log('Step 1 variables:', JSON.stringify(createVariables, null, 2));
    const createResponse = await shopifyAdminAPI({ query: createMutation, variables: createVariables });
    console.log('Step 1 raw response:', JSON.stringify(createResponse, null, 2));

    if (!createResponse.data?.productCreate) {
      console.error('Step 1: unexpected response shape:', JSON.stringify(createResponse, null, 2));
      return res.status(500).json({ success: false, error: 'Unexpected Shopify response' });
    }

    if (createResponse.data.productCreate.userErrors.length > 0) {
      const userErrors = createResponse.data.productCreate.userErrors;
      console.error('Step 1 userErrors:', JSON.stringify(userErrors, null, 2));
      return res.status(400).json({
        success: false,
        error: userErrors.map(e => `${e.field}: ${e.message}`).join('; '),
        errors: userErrors,
      });
    }

    const product = createResponse.data.productCreate.product;
    const defaultVariant = product.variants.edges[0]?.node;
    const variantId = defaultVariant?.id;
    const inventoryItemId = defaultVariant?.inventoryItem?.id;

    if (!variantId) {
      return res.status(500).json({ success: false, error: 'No default variant returned from productCreate' });
    }

    // ─── Step 2: Update variant — price, SKU, barcode, weight ───
    const weightValue = publicData?.pub_packageWeight ?? publicData?.packageWeight ?? null;
    const weightUnitRaw = publicData?.pub_packageWeightUnit || publicData?.packageWeightUnit || 'lb';
    const weightUnit = WEIGHT_UNIT_MAP[weightUnitRaw] || 'POUNDS';

    const variantInput = {
      id: variantId,
      price: (parseFloat(price) / 100).toFixed(2),
      barcode: publicData?.barcode_UPC || '',
      inventoryItem: {
        sku: publicData?.barcode_UPC || `TAN-${Date.now()}`,
        tracked: true,
        ...(weightValue != null ? {
          measurement: {
            weight: { value: parseFloat(weightValue), unit: weightUnit },
          },
        } : {}),
      },
      inventoryPolicy: 'DENY',
    };

    const updateVariantMutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            inventoryItem { id }
          }
          userErrors { field message }
        }
      }
    `;

    console.log('Step 2: Updating variant price/SKU/weight...');
    const updateVariantResponse = await shopifyAdminAPI({
      query: updateVariantMutation,
      variables: { productId: product.id, variants: [variantInput] },
    });

    if (updateVariantResponse.data.productVariantsBulkUpdate.userErrors.length > 0) {
      console.error('Step 2 userErrors:', updateVariantResponse.data.productVariantsBulkUpdate.userErrors);
      return res.status(400).json({
        success: false,
        errors: updateVariantResponse.data.productVariantsBulkUpdate.userErrors,
      });
    }

    // ─── Step 3: Set inventory quantity ───
    if (inventoryItemId) {
      const adjustInventoryMutation = `
        mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
          inventoryAdjustQuantities(input: $input) {
            inventoryAdjustmentGroup { id }
            userErrors { field message }
          }
        }
      `;
      console.log('Step 3: Setting inventory quantity...');
      const adjustResponse = await shopifyAdminAPI({
        query: adjustInventoryMutation,
        variables: {
          input: {
            reason: 'correction',
            name: 'available',
            changes: [{ inventoryItemId, locationId: 'gid://shopify/Location/49650771', delta: 1 }],
          },
        },
      });
      if (adjustResponse.data.inventoryAdjustQuantities.userErrors.length > 0) {
        console.warn('Inventory adjustment warnings:', adjustResponse.data.inventoryAdjustQuantities.userErrors);
      }
    }

    // ─── Step 4: Attach images ───
    let imageUrl = product.featuredImage?.url || null;
    if (imageInputs.length > 0) {
      const createMediaMutation = `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage { image { url } }
              mediaContentType
              status
            }
            mediaUserErrors { field message }
          }
        }
      `;
      console.log('Step 4: Attaching images...');
      const mediaResponse = await shopifyAdminAPI({
        query: createMediaMutation,
        variables: {
          productId: product.id,
          media: imageInputs.map(img => ({ originalSource: img.src, mediaContentType: 'IMAGE' })),
        },
      });
      if (mediaResponse.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
        console.warn('Media upload warnings:', mediaResponse.data.productCreateMedia.mediaUserErrors);
      }
      const firstMedia = mediaResponse.data?.productCreateMedia?.media?.[0];
      if (firstMedia?.image?.url) imageUrl = firstMedia.image.url;
    }

    console.log('Product created successfully:', product.id);
    return res.status(200).json({
      success: true,
      data: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        imageUrl,
      },
    });

  } catch (error) {
    console.error('=== CREATE PRODUCT ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
