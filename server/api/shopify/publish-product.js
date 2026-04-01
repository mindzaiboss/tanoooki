// server/api/shopify/publish-product.js
const { createClient } = require('@supabase/supabase-js');
const shopifyAdminAPI = require('../shopify-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  try {
    const { productId, vendorId } = req.body;

    if (!productId || !vendorId) {
      return res.status(400).json({
        success: false,
        error: 'Missing productId or vendorId',
      });
    }

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            status
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
        status: 'ACTIVE',
      }
    };

    const shopifyResponse = await shopifyAdminAPI({ query: mutation, variables });

    if (shopifyResponse.data.productUpdate.userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: shopifyResponse.data.productUpdate.userErrors,
      });
    }

    // Update status in Supabase
    await supabase
      .from('vendor_products')
      .update({ status: 'active' })
      .eq('shopify_product_id', productId)
      .eq('vendor_id', vendorId);

    return res.status(200).json({
      success: true,
      data: {
        id: productId,
        status: 'ACTIVE',
      },
    });

  } catch (error) {
    console.error('Publish product error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};