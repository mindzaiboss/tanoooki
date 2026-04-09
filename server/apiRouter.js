/**
 * This file contains server side endpoints that can be used to perform backend
 * tasks that can not be handled in the browser.
 *
 * The endpoints should not clash with the application routes. Therefore, the
 * endpoints are prefixed in the main server where this file is used.
 */

const generateListing = require('./api/generate-listing');

const fxRates = require('./api/fx-rates');
const geolocate = require('./api/geolocate');

const shippoRates = require('./api/shippo-rates');

const validateAddress = require('./api/validate-address');

const sellerLocation = require('./api/seller-location');
const uploadImage = require('./api/upload-image');

// Auth API routes
const authSignUp = require('./api/auth/signup');
const authSignIn = require('./api/auth/signin');
const authSignOut = require('./api/auth/signout');
const authCurrentUser = require('./api/auth/current-user');
const authRefresh = require('./api/auth/refresh');
const adminListUsers = require('./api/auth/admin/list-users');
const adminUpdateUserStatus = require('./api/auth/admin/update-user-status');

// Shopify API routes
const createProduct = require('./api/shopify/create-product');
const updateProduct = require('./api/shopify/update-product');
const publishProduct = require('./api/shopify/publish-product');
const getProduct = require('./api/shopify/get-product');

const express = require('express');
const bodyParser = require('body-parser');
const { deserialize } = require('./api-util/sdk');

const initiateLoginAs = require('./api/initiate-login-as');
const loginAs = require('./api/login-as');
const transactionLineItems = require('./api/transaction-line-items');
const initiatePrivileged = require('./api/initiate-privileged');
const transitionPrivileged = require('./api/transition-privileged');
const deleteAccount = require('./api/delete-account');

const createUserWithIdp = require('./api/auth/createUserWithIdp');

const { authenticateFacebook, authenticateFacebookCallback } = require('./api/auth/facebook');
const { authenticateGoogle, authenticateGoogleCallback } = require('./api/auth/google');

const router = express.Router();

// ================ API router middleware: ================ //

// Parse JSON bodies (e.g. /api/generate-listing)
// 50mb limit to support base64 image uploads
router.use(bodyParser.json({ limit: '50mb' }));
router.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Parse Transit body first to a string
router.use(
  bodyParser.text({
    type: 'application/transit+json',
  })
);

// Deserialize Transit body string to JS data
router.use((req, res, next) => {
  if (req.get('Content-Type') === 'application/transit+json' && typeof req.body === 'string') {
    try {
      req.body = deserialize(req.body);
    } catch (e) {
      console.error('Failed to parse request body as Transit:');
      console.error(e);
      res.status(400).send('Invalid Transit in request body.');
      return;
    }
  }
  next();
});

// ================ API router endpoints: ================ //

router.get('/initiate-login-as', initiateLoginAs);
router.get('/login-as', loginAs);
router.post('/transaction-line-items', transactionLineItems);
router.post('/initiate-privileged', initiatePrivileged);
router.post('/transition-privileged', transitionPrivileged);
router.post('/delete-account', deleteAccount);
router.post('/generate-listing', generateListing);
router.get('/fx-rates', fxRates);
router.get('/geolocate', geolocate);
router.post('/shippo-rates', shippoRates);
router.post('/seller-location', sellerLocation);
router.post('/validate-address', validateAddress);
router.post('/upload-image', uploadImage);

// Auth API endpoints
router.post('/auth/signup', authSignUp);
router.post('/auth/signin', authSignIn);
router.post('/auth/signout', authSignOut);
router.get('/auth/current-user', authCurrentUser);
router.post('/auth/refresh', authRefresh);
router.get('/auth/admin/list-users', adminListUsers);
router.post('/auth/admin/update-user-status', adminUpdateUserStatus);

// Shopify API endpoints
router.post('/shopify/create-product', createProduct);
router.post('/shopify/update-product', updateProduct);
router.post('/shopify/publish-product', publishProduct);
router.get('/shopify/products/:productId', getProduct);

// Create user with identity provider (e.g. Facebook or Google)
// This endpoint is called to create a new user after user has confirmed
// they want to continue with the data fetched from IdP (e.g. name and email)
router.post('/auth/create-user-with-idp', createUserWithIdp);

// Facebook authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Facebook
router.get('/auth/facebook', authenticateFacebook);

// This is the route for callback URL the user is redirected after authenticating
// with Facebook. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/facebook/callback', authenticateFacebookCallback);

// Google authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Google
router.get('/auth/google', authenticateGoogle);

// This is the route for callback URL the user is redirected after authenticating
// with Google. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/google/callback', authenticateGoogleCallback);

module.exports = router;