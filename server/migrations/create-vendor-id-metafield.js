const shopifyAdminAPI = require('../api/shopify-client');

async function createVendorIdMetafieldDefinition() {
  const mutation = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          namespace
          key
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyAdminAPI({
    query: mutation,
    variables: {
      definition: {
        name: "Vendor ID",
        namespace: "custom",
        key: "vendor_id",
        description: "Immutable Supabase UUID linking product to seller",
        type: "single_line_text_field",
        ownerType: "PRODUCT"
      }
    }
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

createVendorIdMetafieldDefinition();
