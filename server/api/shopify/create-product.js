// server/api/shopify/create-product.js
const { createClient } = require('@supabase/supabase-js');
const shopifyAdminAPI = require('../shopify-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  console.log('Request Content-Type:', req.headers['content-type']);
  console.log('Full req.body:', JSON.stringify(req.body, null, 2));
  console.log('req.body.images:', JSON.stringify(req.body.images, null, 2));

  try {
    const { vendorId, title, description, price, publicData, images } = req.body;
    console.log('Raw images from request:', JSON.stringify(images, null, 2));

    if (!title || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, price',
      });
    }

    // TEMPORARY: Use fake vendor for testing
    const vendor = {
      id: vendorId || 'test-vendor-123',
      name: 'Test Vendor',
      product_count: 0,
      product_limit: 100,
    };

    // Prepare metafields
    const metafields = [
      { namespace: 'custom', key: 'vendor_id', value: vendor.id, type: 'single_line_text_field' },
      { namespace: 'custom', key: 'vendor_name', value: vendor.name || 'Vendor', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'brand', value: publicData?.brand || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'series', value: publicData?.series || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'artist', value: publicData?.artist || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'condition', value: publicData?.itemcondition || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'edition', value: publicData?.edition || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'barcode', value: publicData?.barcode_UPC || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'original_packaging', value: publicData?.original_packaging_included || '', type: 'single_line_text_field' },
      { namespace: 'custom', key: 'condition_notes', value: publicData?.condition_notes || '', type: 'multi_line_text_field' },
      { namespace: 'shipping', key: 'weight', value: publicData?.packageWeight?.toString() || '', type: 'number_decimal' },
      { namespace: 'shipping', key: 'weight_unit', value: publicData?.packageWeightUnit || 'kg', type: 'single_line_text_field' },
      { namespace: 'shipping', key: 'length', value: publicData?.packageLength?.toString() || '', type: 'number_decimal' },
      { namespace: 'shipping', key: 'width', value: publicData?.packageWidth?.toString() || '', type: 'number_decimal' },
      { namespace: 'shipping', key: 'height', value: publicData?.packageHeight?.toString() || '', type: 'number_decimal' },
      { namespace: 'shipping', key: 'distance_unit', value: publicData?.packageDistanceUnit || 'cm', type: 'single_line_text_field' },
    ].filter(m => m.value);

    // Prepare images — new format: [{ id, url, file }]
    console.log('Raw images from request:', JSON.stringify(images, null, 2));
    const imageInputs = images?.length > 0
      ? images.map(img => ({ src: img.url })).filter(img => img.src)
      : [];

    // ─── Step 1: Create product (without variants — required for API 2024-10+) ───
    const createMutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  inventoryItem {
                    id
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createVariables = {
      input: {
        title,
        descriptionHtml: description || '',
        vendor: publicData?.brand || vendor.name || 'Tanoooki',
        productType: publicData?.categoryLevel1 || 'Designer Toys',
        status: 'DRAFT',
        tags: [
          'tanoooki',
          publicData?.brand,
          publicData?.series,
          publicData?.categoryLevel1,
        ].filter(Boolean),
        metafields,
      },
    };

    console.log('Step 1: Creating Shopify product...');
    const createResponse = await shopifyAdminAPI({ query: createMutation, variables: createVariables });
    console.log('Step 1 response:', JSON.stringify(createResponse, null, 2));

    if (createResponse.data.productCreate.userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: createResponse.data.productCreate.userErrors,
      });
    }

    const product = createResponse.data.productCreate.product;
    const defaultVariant = product.variants.edges[0]?.node;
    const variantId = defaultVariant?.id;
    const inventoryItemId = defaultVariant?.inventoryItem?.id;

    if (!variantId) {
      return res.status(500).json({
        success: false,
        error: 'No default variant returned from productCreate',
      });
    }

    // ─── Step 2: Update price, SKU, inventoryPolicy on the default variant ───
    const updateVariantMutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            inventoryItem {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateVariantVariables = {
      productId: product.id,
      variants: [{
        id: variantId,
        price: (parseFloat(price) / 100).toFixed(2),
        inventoryItem: {
          sku: publicData?.barcode_UPC || `TAN-${Date.now()}`,
        },
        inventoryPolicy: 'DENY',
      }],
    };

    console.log('Step 2: Updating default variant price/SKU...');
    const updateVariantResponse = await shopifyAdminAPI({ query: updateVariantMutation, variables: updateVariantVariables });
    console.log('Step 2 response:', JSON.stringify(updateVariantResponse, null, 2));

    if (updateVariantResponse.data.productVariantsBulkUpdate.userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: updateVariantResponse.data.productVariantsBulkUpdate.userErrors,
      });
    }

    // ─── Step 3: Set inventory quantity via inventoryAdjustQuantities ───
    if (inventoryItemId) {
      const adjustInventoryMutation = `
        mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
          inventoryAdjustQuantities(input: $input) {
            inventoryAdjustmentGroup {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const adjustInventoryVariables = {
        input: {
          reason: 'correction',
          name: 'available',
          changes: [{
            inventoryItemId,
            locationId: 'gid://shopify/Location/49650771',
            delta: 1,
          }],
        },
      };

      console.log('Step 3: Setting inventory quantity...');
      const adjustResponse = await shopifyAdminAPI({ query: adjustInventoryMutation, variables: adjustInventoryVariables });
      console.log('Step 3 response:', JSON.stringify(adjustResponse, null, 2));

      if (adjustResponse.data.inventoryAdjustQuantities.userErrors.length > 0) {
        console.warn('Inventory adjustment warnings:', adjustResponse.data.inventoryAdjustQuantities.userErrors);
      }
    }

    // ─── Step 4: Attach images via productCreateMedia (required for API 2024-10+) ───
    let imageUrl = product.featuredImage?.url || null;

    console.log('Step 4 check - imageInputs:', JSON.stringify(imageInputs));
    console.log('Step 4 check - imageInputs.length:', imageInputs.length);
    console.log('Step 4 check - condition (imageInputs.length > 0):', imageInputs.length > 0);

    if (imageInputs.length > 0) {
      console.log('Step 4: REACHED - starting productCreateMedia...');
      const createMediaMutation = `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage {
                image {
                  url
                }
              }
              mediaContentType
              status
            }
            mediaUserErrors {
              field
              message
            }
          }
        }
      `;

      const mediaVariables = {
        productId: product.id,
        media: imageInputs.map(img => ({
          originalSource: img.src,
          mediaContentType: 'IMAGE',
        })),
      };

      console.log('Step 4: Attaching images via productCreateMedia...');
      const mediaResponse = await shopifyAdminAPI({ query: createMediaMutation, variables: mediaVariables });
      console.log('Step 4 response:', JSON.stringify(mediaResponse, null, 2));

      if (mediaResponse.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
        console.warn('Media upload warnings:', mediaResponse.data.productCreateMedia.mediaUserErrors);
      }

      const firstMedia = mediaResponse.data?.productCreateMedia?.media?.[0];
      if (firstMedia?.image?.url) {
        imageUrl = firstMedia.image.url;
      }
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
    console.error('Create product error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
