// server/api/shopify/create-product.js
const shopifyAdminAPI = require('../shopify-client');

async function findOrCreateBrandMetaobject(brandName) {
  if (!brandName) return null;

  // Search for existing brand metaobject by name field
  const searchResult = await shopifyAdminAPI({
    query: `
      query searchBrands($query: String!) {
        metaobjects(type: "brand", first: 1, query: $query) {
          edges {
            node {
              id
              handle
              fields { key value }
            }
          }
        }
      }
    `,
    variables: { query: `name:${brandName}` },
  });

  const existing = searchResult.data?.metaobjects?.edges?.[0]?.node;
  if (existing) {
    console.log(`[brand] found existing metaobject: ${existing.id}`);
    return existing.id;
  }

  // Not found — create it
  const createResult = await shopifyAdminAPI({
    query: `
      mutation createBrand($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { field message }
        }
      }
    `,
    variables: {
      metaobject: {
        type: 'brand',
        fields: [{ key: 'name', value: brandName }],
      },
    },
  });

  const errors = createResult.data?.metaobjectCreate?.userErrors;
  if (errors?.length > 0) {
    console.error('[brand] failed to create metaobject:', errors);
    return null;
  }

  const created = createResult.data.metaobjectCreate.metaobject;
  console.log(`[brand] created new metaobject: ${created.id}`);
  return created.id;
}

// Frontend category display name → slug
const CATEGORY_DISPLAY_NAMES = {
  'blind-boxes': 'Blind Boxes',
  'figures-collectibles': 'Figures & Collectibles',
  'plush': 'Plush',
  'tcg-trading-cards': 'TCG & Trading Cards',
  'accessories': 'Accessories',
  'other': 'Other',
};

// Weight unit slug → Shopify WeightUnit enum
const WEIGHT_UNIT_MAP = {
  'lb': 'POUNDS',
  'oz': 'OUNCES',
  'kg': 'KILOGRAMS',
  'g': 'GRAMS',
};

// Edition slug → Shopify enum value
const EDITION_VALUE_MAP = {
  'standard_edition': 'Standard Item',
  'limited_edition': 'Limited Edition',
  'convention_exclusive': 'Convention Exclusive',
  'artist_proof': 'Artist Proof',
  'signed': 'Signed / Autographed',
};

// Frontend category slug → Shopify standard taxonomy GID (Toys & Games tree)
const SHOPIFY_CATEGORY_MAP = {
  'blind-boxes': 'gid://shopify/TaxonomyCategory/tg-5-8',
  'figures-collectibles': 'gid://shopify/TaxonomyCategory/tg-5-8-1-1',
  'plush': 'gid://shopify/TaxonomyCategory/tg-5-8-6',
  'tcg-trading-cards': 'gid://shopify/TaxonomyCategory/ae-2-2-3-2',
  'art-toys': 'gid://shopify/TaxonomyCategory/tg-5-8-1-1',
  'vinyl-figures': 'gid://shopify/TaxonomyCategory/tg-5-8-1-1',
  'designer-toys': 'gid://shopify/TaxonomyCategory/tg-5-8-1-1',
  // 'accessories' - intentionally no mapping (catch-all)
  // 'other' - intentionally no mapping (catch-all)
};

module.exports = async (req, res) => {
  console.log('=== CREATE PRODUCT ROUTE HIT ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    const {
      vendorUsername,
      vendorId,
      title,
      description,
      price,
      images,
      publicData,
    } = req.body;

    if (!title || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, price',
      });
    }

    // Extract category from publicData.categoryLevel1
    const categorySlug = publicData?.categoryLevel1;
    const categoryGid = SHOPIFY_CATEGORY_MAP[categorySlug] || null;
    const productType = CATEGORY_DISPLAY_NAMES[categorySlug] || 'Designer Toys';

    // Map publicData fields (no pub_ prefix)
    const brand = publicData?.brand || '';
    const brandGid = await findOrCreateBrandMetaobject(brand);
    const condition = publicData?.itemcondition === 'new-sealed' ? 'New / Sealed'
      : publicData?.itemcondition === 'opened-used' ? 'Opened / Used'
      : '';
    const conditionNotes = publicData?.condition_notes || '';
    const seriesCollection = publicData?.series_collection || '';
    const artist = publicData?.artist || '';
    const editionInfo = EDITION_VALUE_MAP[publicData?.edition_size_exclusivity] || '';
    const includesOriginalPackaging = publicData?.original_packaging_included === 'yes-original-packaging';
    const includesCard = publicData?.includes_card === 'true' || publicData?.includes_card === true;

    const metafields = [
      brandGid ? { namespace: 'custom', key: 'brand', value: brandGid, type: 'metaobject_reference' } : null,
      condition ? { namespace: 'custom', key: 'condition', value: condition, type: 'single_line_text_field' } : null,
      conditionNotes ? { namespace: 'custom', key: 'condition_notes', value: conditionNotes, type: 'multi_line_text_field' } : null,
      seriesCollection ? { namespace: 'custom', key: 'series_collection', value: seriesCollection, type: 'single_line_text_field' } : null,
      artist ? { namespace: 'custom', key: 'artist', value: artist, type: 'single_line_text_field' } : null,
      editionInfo ? { namespace: 'custom', key: 'edition_size_exclusivity', value: editionInfo, type: 'single_line_text_field' } : null,
      { namespace: 'custom', key: 'includes_original_packaging', value: includesOriginalPackaging ? 'Yes' : 'No', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'includes_card', value: includesCard ? 'Yes' : 'No', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'fulfillment_method', value: 'Fulfilled by Seller', type: 'single_line_text_field' },
      vendorId ? { namespace: 'custom', key: 'vendor_id', value: vendorId, type: 'single_line_text_field' } : null,
      vendorUsername ? { namespace: 'custom', key: 'vendor_username', value: vendorUsername, type: 'single_line_text_field' } : null,
    ].filter(m => m && m.value);

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
        vendor: brand || 'Tanoooki',
        productType,
        ...(categoryGid ? { category: categoryGid } : {}),
        status: 'DRAFT',
        tags: ['tanoooki', categorySlug, brand || null].filter(Boolean),
        metafields,
      },
    };

    console.log('=== CREATE PRODUCT DEBUG ===');
    console.log('categorySlug:', categorySlug, '| productType:', productType, '| categoryGid:', categoryGid);
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
    const barcode = publicData?.barcode_UPC || '';
    const weight = parseFloat(publicData?.pub_packageWeight) || 0;
    const weightUnit = WEIGHT_UNIT_MAP[publicData?.pub_packageWeightUnit] || 'POUNDS';

    const variantInput = {
      id: variantId,
      price: (parseFloat(price) / 100).toFixed(2),
      barcode,
      inventoryItem: {
        sku: `TAN-${Date.now()}`,
        tracked: true,
        countryCodeOfOrigin: 'CN',
        harmonizedSystemCode: '950300',
        ...(weight > 0 ? { measurement: { weight: { value: weight, unit: weightUnit } } } : {}),
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
