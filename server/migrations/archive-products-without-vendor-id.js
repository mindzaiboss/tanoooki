const shopifyAdminAPI = require('../api/shopify-client');

async function archiveProductsWithoutVendorId() {
  console.log('=== ARCHIVING PRODUCTS WITHOUT VENDOR_ID ===');
  
  const query = `
    query getProducts {
      products(first: 250, query: "status:active OR status:draft") {
        edges {
          node {
            id
            title
            status
            vendorIdMetafield: metafield(namespace: "custom", key: "vendor_id") {
              value
            }
          }
        }
      }
    }
  `;

  const { data, errors } = await shopifyAdminAPI({ query });
  
  if (errors) {
    console.error('GraphQL errors:', errors);
    return;
  }

  const productsToArchive = data.products.edges
    .filter(edge => !edge.node.vendorIdMetafield?.value)
    .map(edge => edge.node);

  console.log(`Found ${productsToArchive.length} products without vendor_id`);
  console.log('Products to archive:');
  productsToArchive.forEach(p => console.log(`  - ${p.title}`));

  if (productsToArchive.length === 0) {
    console.log('No products to archive!');
    return;
  }

  console.log('\n⚠️  Archiving in 5 seconds... (Ctrl+C to cancel)');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const archiveMutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  for (const product of productsToArchive) {
    console.log(`Archiving: ${product.title}...`);
    
    const result = await shopifyAdminAPI({
      query: archiveMutation,
      variables: {
        input: {
          id: product.id,
          status: 'ARCHIVED'
        }
      }
    });

    if (result.data.productUpdate.userErrors.length > 0) {
      console.error(`  ❌ Error:`, result.data.productUpdate.userErrors);
    } else {
      console.log(`  ✅ Archived`);
    }
  }

  console.log('\n✅ Done! All old products archived.');
}

archiveProductsWithoutVendorId();
