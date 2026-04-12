// server/api/shopify/getUserListings.js
const { createAdminApiClient } = require('@shopify/admin-api-client');

module.exports = async (req, res) => {
  const { username, userId } = req.query;

  if (!username || !userId) {
    return res.status(400).json({ error: 'username and userId are required' });
  }

  console.log('=== GET USER LISTINGS DEBUG ===');
  console.log('Username:', username);
  console.log('UserId:', userId);

  try {
    const client = createAdminApiClient({
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
      apiVersion: '2026-01',
      accessToken: process.env.SHOPIFY_ADMIN_API_TOKEN,
    });

    const query = `
      query getProductsByVendor($query: String!) {
        products(first: 50, query: $query) {
          edges {
            node {
              id
              title
              handle
              description
              status
              createdAt
              updatedAt
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              totalInventory
              featuredImage {
                url
                altText
              }
              vendorIdMetafield: metafield(namespace: "custom", key: "vendor_id") {
                value
              }
              vendorUsernameMetafield: metafield(namespace: "custom", key: "vendor_username") {
                value
              }
            }
          }
        }
      }
    `;

    const { data, errors } = await client.request(query, {
      variables: {
        query: `status:active OR status:draft`,
      },
    });

    if (errors) {
      console.error('Shopify GraphQL errors:', errors);
      return res.status(500).json({ error: 'Failed to fetch listings from Shopify' });
    }

    console.log('Shopify returned products count:', data.products.edges.length);
    if (data.products.edges.length > 0) {
      console.log('First product:', data.products.edges[0].node.title);
    }

    data.products.edges.forEach(edge => {
      const product = edge.node;
      console.log(`Product "${product.title}" → vendor_id: ${product.vendorIdMetafield?.value || '(none)'}`);
    });

    const listings = data.products.edges.map(edge => {
      const product = edge.node;
      return {
        id: { uuid: product.id },
        type: 'listing',
        attributes: {
          title: product.title,
          description: product.description || '',
          state: product.status === 'ACTIVE' ? 'published' : 'draft',
          createdAt: new Date(product.createdAt),
          price: product.priceRangeV2?.minVariantPrice?.amount
            ? {
                amount: Math.round(parseFloat(product.priceRangeV2.minVariantPrice.amount) * 100),
                currency: product.priceRangeV2.minVariantPrice.currencyCode || 'USD',
              }
            : { amount: 0, currency: 'USD' },
          publicData: {
            vendorId: product.vendorIdMetafield?.value || null,
          },
        },
        images: product.featuredImage
          ? [
              {
                id: { uuid: product.featuredImage.url },
                type: 'image',
                attributes: {
                  variants: {
                    'listing-card': { url: product.featuredImage.url, width: 400, height: 400 },
                    'listing-card-2x': { url: product.featuredImage.url, width: 800, height: 800 },
                  },
                },
              },
            ]
          : [],
        currentStock: {
          attributes: {
            quantity: product.totalInventory || 0,
          },
        },
      };
    }).filter(listing => listing.attributes.publicData.vendorId === userId);

    console.log('Total listings after filtering:', listings.length);

    return res.status(200).json({
      data: listings,
      meta: {
        totalItems: listings.length,
        totalPages: 1,
        page: 1,
        perPage: 50,
      },
    });
  } catch (e) {
    console.error('Error fetching user listings:', e);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching listings',
    });
  }
};
