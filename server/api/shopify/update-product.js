// server/api/shopify/update-product.js
const shopifyAdminAPI = require('../shopify-client');

module.exports = async (req, res) => {
  try {
    const { productId, title, description, price, publicData } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Missing productId',
      });
    }

    const metafields = [
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

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: productId,
        title: title,
        descriptionHtml: description,
        vendor: publicData?.brand,
        tags: [
          'tanoooki',
          publicData?.brand,
          publicData?.series,
          publicData?.categoryLevel1,
        ].filter(Boolean),
        metafields: metafields,
      }
    };

    const shopifyResponse = await shopifyAdminAPI({ query: mutation, variables });

    if (shopifyResponse.data.productUpdate.userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: shopifyResponse.data.productUpdate.userErrors,
      });
    }

    return res.status(200).json({
      success: true,
      data: shopifyResponse.data.productUpdate.product,
    });

  } catch (error) {
    console.error('Update product error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};