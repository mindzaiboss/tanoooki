import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import { omit } from '../../util/common';
import { types as sdkTypes } from '../../util/sdkLoader';
import { denormalisedResponseEntities } from '../../util/data';
import {
  getDefaultTimeZoneOnBrowser,
  getStartOf,
  getStartOfWeek,
  monthIdString,
  parseDateFromISO8601,
  stringifyDateToISO8601,
} from '../../util/dates';
import { uniqueBy } from '../../util/generators';
import { storableError } from '../../util/errors';
import * as log from '../../util/log';
import { parse } from '../../util/urlHelpers';
import { isUserAuthorized } from '../../util/userHelpers';
import { isBookingProcessAlias } from '../../transactions/transaction';

import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import {
  createStripeAccount,
  updateStripeAccount,
  fetchStripeAccount,
} from '../../ducks/stripeConnectAccount.duck';
import { fetchCurrentUser } from '../../ducks/user.duck';

const { UUID } = sdkTypes;

// Create array of N items where indexing starts from 1
const getArrayOfNItems = n =>
  Array(n)
    .fill()
    .map((v, i) => i + 1)
    .slice(1);

// Return an array of image ids
const imageIds = images => {
  // For newly uploaded image the UUID can be found from "img.imageId"
  // and for existing listing images the id is "img.id"
  return images ? images.map(img => img.imageId || img.id) : null;
};

// After listing creation & update, we want to make sure that uploadedImages state is cleaned
const updateUploadedImagesState = (state, payload) => {
  const { uploadedImages, uploadedImagesOrder } = state;

  // Images attached to listing entity
  const attachedImages = payload?.data?.relationships?.images?.data || [];
  const attachedImageUUIDStrings = attachedImages.map(img => img.id.uuid);

  // Uploaded images (which are propably not yet attached to listing)
  const unattachedImages = Object.values(state.uploadedImages);
  const duplicateImageEntities = unattachedImages.filter(unattachedImg =>
    attachedImageUUIDStrings.includes(unattachedImg.imageId?.uuid)
  );
  return duplicateImageEntities.length > 0
    ? {
        uploadedImages: {},
        uploadedImagesOrder: [],
      }
    : {
        uploadedImages,
        uploadedImagesOrder,
      };
};


const sortExceptionsByStartTime = (a, b) => {
  return a.attributes.start.getTime() - b.attributes.start.getTime();
};

// ================ Async Thunks ================ //

//////////////////
// Show Listing //
//////////////////
export const showListingThunk = createAsyncThunk(
  'EditListingPage/SHOW_LISTING',
  async ({ listingId, config }, { getState }) => {
    const state = getState().EditListingPage;
    const { listingDraft } = state;

    // For new drafts, return from Redux state
    if (listingId?.uuid?.startsWith('draft-')) {
      if (listingDraft && listingId.uuid === listingDraft.id?.uuid) {
        return {
          data: {
            data: listingDraft,
            included: [],
          },
        };
      }

      console.error('Draft not found in Redux! listingId:', listingId);
      throw new Error(`Draft ${listingId.uuid} not found in Redux state`);
    }

    // For existing listings, fetch from Shopify
    const res = await fetch(`/api/shopify/products/${listingId.uuid}`);
    if (!res.ok) throw new Error(`Failed to fetch product ${listingId.uuid}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Product fetch failed');

    const p = json.data;
    return {
      data: {
        data: {
          id: { uuid: p.id },
          type: 'ownListing',
          attributes: {
            title: p.title,
            description: p.description,
            price: p.price ? { amount: p.price, currency: 'USD' } : null,
            state: p.status === 'ACTIVE' ? 'published' : 'draft',
            publicData: p.publicData || {},
            privateData: {
              shopifyVariantId: p.variantId || null,
            },
          },
          images: p.images || [],
        },
        included: [],
      },
    };
  }
);
// Backward compatible wrappers for the thunks
export const requestShowListing = (actionPayload, config) => (dispatch, getState, sdk) => {
  return dispatch(showListingThunk({ actionPayload, config })).unwrap();
};

///////////////
// Set Stock //
///////////////
export const setStockThunk = createAsyncThunk(
  'EditListingPage/setStock',
  ({ listingId, oldTotal, newTotal }, { dispatch, rejectWithValue, extra: sdk }) => {
    return sdk.stock
      .compareAndSet({ listingId, oldTotal, newTotal }, { expand: true })
      .then(response => {
        // NOTE: compareAndSet returns the stock resource of the listing.
        // We update client app's internal state with these updated API entities.
        dispatch(addMarketplaceEntities(response));
        return response;
      })
      .catch(e => {
        log.error(e, 'update-stock-failed', { listingId, oldTotal, newTotal });
        return rejectWithValue(storableError(e));
      });
  }
);
// Backward compatible wrappers for the thunks
// Set stock if requested among listing update info
export const compareAndSetStock = (listingId, oldTotal, newTotal) => (dispatch, getState, sdk) => {
  return dispatch(setStockThunk({ listingId, oldTotal, newTotal }));
};

// Helper function to make compareAndSetStock call if stock update is needed.
const updateStockOfListingMaybe = (listingId, stockTotals, dispatch) => {
  const { oldTotal, newTotal } = stockTotals || {};
  // Note: newTotal and oldTotal must be given, but oldTotal can be null
  const hasStockTotals = newTotal >= 0 && typeof oldTotal !== 'undefined';

  if (listingId && hasStockTotals) {
    return dispatch(compareAndSetStock(listingId, oldTotal, newTotal));
  }
  return Promise.resolve();
};

//////////////////////////
// Create Listing Draft //
//////////////////////////

// Create listing in draft state
// NOTE: We DON'T create in Shopify yet - just store in Redux
// Product will be created when user publishes
export const createListingDraftThunk = createAsyncThunk(
  'EditListingPage/createListingDraft',
  ({ data, config }, { dispatch, getState, rejectWithValue, extra: sdk }) => {

    const { stockUpdate, images, ...rest } = data;

    // DON'T create in Shopify yet - just return success
    // This allows the wizard to continue to the next tab
    
    // Format response to match Sharetribe structure (for compatibility with existing UI)
    // NOTE: Do NOT include relationships.images here — it causes updateUploadedImagesState
    // to falsely detect duplicates and wipe uploadedImages from Redux.
    const formattedResponse = {
      data: {
        data: {
          id: { uuid: 'draft-' + Date.now() }, // Temporary draft ID
          type: 'listing',
          attributes: {
            title: data.title,
            description: data.description,
            price: data.price,
            publicData: data.publicData,
            state: 'draft',
          },
          relationships: {},
        },
      },
    };

    // Store the draft data in Redux for later
    return Promise.resolve(formattedResponse);
  }
);
// Backward compatible wrappers for the thunks
export const requestCreateListingDraft = (data, config) => (dispatch, getState, sdk) => {
  return dispatch(createListingDraftThunk({ data, config })).unwrap();
};

////////////////////
// Update Listing //
////////////////////

// Update the given tab of the wizard with the given data. This saves
// the data to the listing, and marks the tab updated so the UI can
// display the state.
// NOTE: We DON'T update Shopify yet - just update Redux state
export const updateListingThunk = createAsyncThunk(
  'EditListingPage/updateListing',
  async ({ tab, data }, { rejectWithValue, getState }) => {
    const { id, stockUpdate, images, ...rest } = data;
    const isEditMode = !!(id?.uuid && !String(id?.uuid).startsWith('draft-'));

    // For edit mode, persist changes to Shopify immediately
    if (isEditMode) {
      const shopifyProductId = id?.uuid;
      // Get variantId from listingDraft (stored when we fetched the product)
      const listingDraft = getState().EditListingPage.listingDraft;
      const variantId = listingDraft?.attributes?.privateData?.shopifyVariantId || null;
      const res = await fetch('/api/shopify/update-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: `gid://shopify/Product/${shopifyProductId}`,
          title: rest.title,
          description: rest.description,
          price: rest.price?.amount,
          variantId,
          publicData: rest.publicData,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        return rejectWithValue(storableError(new Error(json.error || 'Update failed')));
      }
    }

    const formattedResponse = {
      data: {
        data: {
          id: id,
          type: 'listing',
          attributes: rest,
        },
      },
    };

    return { response: formattedResponse, tab };
  }
);
// Backward compatible wrappers for the thunks
export const requestUpdateListing = (tab, data) => (dispatch, getState, sdk) => {
  return dispatch(updateListingThunk({ tab, data }))
    .unwrap()
    .then(({ response, tab }) => {
      return response;
    });
};

/////////////////////
// Publish Listing //
/////////////////////

const publishListingPayloadCreator = ({ listingId }, { dispatch, getState, rejectWithValue, extra: sdk }) => {
  const state = getState();
  const currentUser = state.user.currentUser;
  const vendorId = currentUser?.id?.uuid;
  const vendorUsername = getState().user.currentUser?.attributes?.profile?.username || 'anonymous';

  // Get the draft listing data from Redux state
  const listingDraft = state.EditListingPage.listingDraft;
  
  if (!listingDraft) {
    return rejectWithValue(storableError(new Error('No draft listing found')));
  }

  // Collect all the data from the wizard tabs
  const title = listingDraft?.attributes?.title;
  const description = listingDraft?.attributes?.description;
  const publicData = listingDraft?.attributes?.publicData || {};
  const price = listingDraft?.attributes?.price; // From pricing tab
  console.log('[publish] publicData at publish time:', JSON.stringify(publicData, null, 2));
  
  // Get uploaded images from Redux state
  const images = state.EditListingPage.uploadedImages;
  console.log('[publish] uploadedImages from state:', JSON.stringify(images));
  console.log('[publish] uploadedImages keys:', Object.keys(images));
  const imageArray = Object.values(images)
    .filter(img => img.url || img.imageUrl)
    .map(img => ({ id: img.id || img.imageId, url: img.imageUrl || img.url }));
  console.log('[publish] imageArray being sent:', JSON.stringify(imageArray));
  console.log('[publish] vendorUsername:', vendorUsername);

  // NOW create the product in Shopify with ALL collected data
  return fetch('/api/shopify/create-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vendorId,
      vendorUsername,
      title,
      description,
      price: price?.amount,
      publicData,
      images: imageArray,
    }),
  })
    .then(res => res.json())
    .then(shopifyData => {
      console.log('[publish] create-product response:', JSON.stringify(shopifyData));
      if (!shopifyData.success) {
        const errMsg = shopifyData.error || (shopifyData.errors ? JSON.stringify(shopifyData.errors) : 'Product creation failed');
        console.error('[publish] create-product failed:', errMsg);
        throw new Error(errMsg);
      }

      // Immediately publish the product (set to ACTIVE)
      console.log('[publish] shopifyData.data.id:', shopifyData.data.id);
      return fetch('/api/shopify/publish-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: shopifyData.data.id,
          vendorId,
        }),
      })
        .then(res => res.json())
        .then(publishData => {
          if (!publishData.success) {
            throw new Error(publishData.error || 'Product publish failed');
          }

          // Extract numeric Shopify product ID from GID (e.g. "gid://shopify/Product/12345" → "12345")
          const shopifyGid = publishData.data?.id || '';
          const shopifyNumericId = shopifyGid.split('/').pop();

          // Format response
          const formattedResponse = {
            data: {
              data: {
                id: { uuid: shopifyNumericId },
                type: 'listing',
                attributes: {
                  state: 'published',
                },
              },
            },
            shopifyProduct: {
              id: shopifyNumericId,
              title: shopifyData.data?.title || title,
              handle: shopifyData.data?.handle,
              price: price?.amount,
              sku: publicData?.barcode_UPC,
              imageUrl: shopifyData.data?.imageUrl || imageArray[0]?.url || null,
            },
          };

          return formattedResponse;
        });
    })
    .catch(e => {
      console.error('Publish error:', e);
      return rejectWithValue(storableError(e));
    });
};

export const publishListingThunk = createAsyncThunk(
  'EditListingPage/publishListing',
  publishListingPayloadCreator
);
// Backward compatible wrappers for the thunks
export const requestPublishListingDraft = listingId => (dispatch, getState, sdk) => {
  return dispatch(publishListingThunk({ listingId })).unwrap();
};

//////////////////
// Upload Image //
//////////////////

// Images return imageId which we need to map with previously generated temporary id
export const uploadImageThunk = createAsyncThunk(
  'EditListingPage/uploadImage',
  async ({ actionPayload }, { rejectWithValue }) => {
    const { id, file } = actionPayload;

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: base64,
          mimeType: file.type,
          vendorId: 'anonymous',
        }),
      });

      const data = await response.json();

      if (!data.success) throw new Error(data.error || 'Upload failed');

      return { id, imageId: id, url: data.url, file };

    } catch (error) {
      console.error('Image upload failed:', error.message);
      return rejectWithValue({ id, error: storableError(error) });
    }
  }
);
// Backward compatible wrappers for the thunks
export const requestImageUpload = (actionPayload, listingImageConfig) => (
  dispatch,
  getState,
  sdk
) => {
  return dispatch(uploadImageThunk({ actionPayload, listingImageConfig })).unwrap();
};

///////////////////////////////
// Add AvailabilityException //
///////////////////////////////
const addAvailabilityExceptionPayloadCreator = ({ params }, { rejectWithValue, extra: sdk }) => {
  return sdk.availabilityExceptions
    .create(params, { expand: true })
    .then(response => {
      const availabilityException = response.data.data;
      return { data: availabilityException };
    })
    .catch(e => {
      return rejectWithValue({ error: storableError(e) });
    });
};

export const addAvailabilityExceptionThunk = createAsyncThunk(
  'EditListingPage/addAvailabilityException',
  addAvailabilityExceptionPayloadCreator
);
// Backward compatible wrappers for the thunks
export const requestAddAvailabilityException = params => (dispatch, getState, sdk) => {
  return dispatch(addAvailabilityExceptionThunk({ params })).unwrap();
};

//////////////////////////////////
// Delete AvailabilityException //
//////////////////////////////////
const deleteAvailabilityExceptionPayloadCreator = ({ params }, { rejectWithValue, extra: sdk }) => {
  return sdk.availabilityExceptions
    .delete(params, { expand: true })
    .then(response => {
      const availabilityException = response.data.data;
      return { data: availabilityException };
    })
    .catch(e => {
      return rejectWithValue({ error: storableError(e) });
    });
};

export const deleteAvailabilityExceptionThunk = createAsyncThunk(
  'EditListingPage/deleteAvailabilityException',
  deleteAvailabilityExceptionPayloadCreator
);
// Backward compatible wrappers for the thunks
export const requestDeleteAvailabilityException = params => (dispatch, getState, sdk) => {
  return dispatch(deleteAvailabilityExceptionThunk({ params })).unwrap();
};

//////////////////////////////////
// Fetch AvailabilityExceptions //
//////////////////////////////////
const fetchAvailabilityExceptionsPayloadCreator = (
  { params },
  { dispatch, rejectWithValue, extra: sdk }
) => {
  const { listingId, start, end, timeZone, page, isWeekly } = params;
  const fetchParams = { listingId, start, end };
  const timeUnitIdProp = isWeekly
    ? { weekStartId: stringifyDateToISO8601(start) }
    : { monthId: monthIdString(start, timeZone) };

  return sdk.availabilityExceptions
    .query(fetchParams)
    .then(response => {
      const availabilityExceptions = denormalisedResponseEntities(response);

      // Fetch potential extra exceptions pagination pages per month.
      const totalPages = response.data.meta.totalPages;
      if (totalPages > 1 && !page) {
        const extraPages = getArrayOfNItems(totalPages);

        Promise.all(
          extraPages.map(page => {
            return sdk.availabilityExceptions.query({ ...fetchParams, page });
          })
        ).then(responses => {
          const denormalizedFlatResults = (all, r) => all.concat(denormalisedResponseEntities(r));
          const exceptions = responses.reduce(denormalizedFlatResults, []);
          dispatch(
            fetchExtraAvailabilityExceptionsThunk.fulfilled({
              data: { ...timeUnitIdProp, exceptions },
            })
          );
        });
      }

      return {
        ...timeUnitIdProp,
        exceptions: availabilityExceptions,
      };
    })
    .catch(e => {
      return rejectWithValue({ ...timeUnitIdProp, error: storableError(e) });
    });
};

export const fetchAvailabilityExceptionsThunk = createAsyncThunk(
  'EditListingPage/fetchAvailabilityExceptions',
  fetchAvailabilityExceptionsPayloadCreator
);
// Backward compatible wrappers for the thunks
export const requestFetchAvailabilityExceptions = params => (dispatch, getState, sdk) => {
  return dispatch(fetchAvailabilityExceptionsThunk({ params })).unwrap();
};

export const fetchExtraAvailabilityExceptionsThunk = createAsyncThunk(
  'EditListingPage/fetchExtraAvailabilityExceptions',
  ({ data }) => data
);

/////////////////////////
// Save Payout Details //
/////////////////////////
const savePayoutDetailsPayloadCreator = (
  { values, isUpdateCall },
  { dispatch, rejectWithValue }
) => {
  const upsertThunk = isUpdateCall ? updateStripeAccount : createStripeAccount;

  return dispatch(upsertThunk(values, { expand: true }))
    .then(response => {
      return response;
    })
    .catch(() => {
      return rejectWithValue();
    });
};

export const savePayoutDetailsThunk = createAsyncThunk(
  'EditListingPage/savePayoutDetails',
  savePayoutDetailsPayloadCreator
);
// Backward compatible wrappers for the thunks
export const savePayoutDetails = (values, isUpdateCall) => dispatch => {
  return dispatch(savePayoutDetailsThunk({ values, isUpdateCall })).unwrap();
};

////////////////////////////////
// Fetch Load Data Exceptions //
////////////////////////////////

// Helper function for loadData call.
const fetchLoadDataExceptions = (dispatch, listing, search, firstDayOfWeek) => {
  const hasWindow = typeof window !== 'undefined';
  // Listing could be ownListing entity too, so we just check if attributes key exists
  const hasTimeZone = listing?.attributes?.availabilityPlan?.timezone;

  // Fetch time-zones on client side only.
  // Note: listing needs to have time zone set!
  if (hasWindow && listing.id && hasTimeZone) {
    const listingId = listing.id;
    // If the listing doesn't have availabilityPlan yet
    // use the defaul timezone
    const timezone = listing.attributes.availabilityPlan?.timezone || getDefaultTimeZoneOnBrowser();
    const todayInListingsTZ = getStartOf(new Date(), 'day', timezone);

    const locationSearch = parse(search);
    const selectedDate = locationSearch?.d
      ? parseDateFromISO8601(locationSearch.d, timezone)
      : todayInListingsTZ;
    const startOfWeek = getStartOfWeek(selectedDate, timezone, firstDayOfWeek);
    const prevWeek = getStartOf(startOfWeek, 'day', timezone, -7, 'days');
    const nextWeek = getStartOf(startOfWeek, 'day', timezone, 7, 'days');
    const nextAfterNextWeek = getStartOf(nextWeek, 'day', timezone, 7, 'days');

    const nextMonth = getStartOf(todayInListingsTZ, 'month', timezone, 1, 'months');
    const nextAfterNextMonth = getStartOf(nextMonth, 'month', timezone, 1, 'months');

    const sharedData = { listingId, timeZone: timezone };

    // Fetch data for selected week and nearest weeks for WeeklyCalendar
    // Plus current month and month after that for EditListingAvailabilityForm
    //
    // NOTE: This is making 5 different Thunk calls, which update store 2 times each
    //       It would make sense to make on thunk function that fires 5 sdk calls/promises,
    //       but for the time being, it's clearer to push all the calls through
    //       requestFetchAvailabilityExceptions
    return Promise.all([
      dispatch(
        requestFetchAvailabilityExceptions({
          ...sharedData,
          isWeekly: true,
          start: prevWeek,
          end: startOfWeek,
        })
      ),
      dispatch(
        requestFetchAvailabilityExceptions({
          ...sharedData,
          isWeekly: true,
          start: startOfWeek,
          end: nextWeek,
        })
      ),
      dispatch(
        requestFetchAvailabilityExceptions({
          ...sharedData,
          isWeekly: true,
          start: nextWeek,
          end: nextAfterNextWeek,
        })
      ),
      dispatch(
        requestFetchAvailabilityExceptions({
          ...sharedData,
          start: todayInListingsTZ,
          end: nextMonth,
        })
      ),
      dispatch(
        requestFetchAvailabilityExceptions({
          ...sharedData,
          start: nextMonth,
          end: nextAfterNextMonth,
        })
      ),
    ]);
  }

  // By default return an empty array
  return Promise.all([]);
};

// ================ Slice ================ //

const initialState = {
  // Error instance placeholders for each endpoint
  createListingDraftError: null,
  listingId: null,
  publishListingError: null,
  updateListingError: null,
  showListingsError: null,
  uploadImageError: null,
  setStockError: null,
  setStockInProgress: false,
  createListingDraftInProgress: false,
  submittedListingId: null,
  redirectToListing: false,
  publishSuccess: false,
  publishedProduct: null,
  uploadedImages: {},
  uploadedImagesOrder: [],
  removedImageIds: [],
  addExceptionError: null,
  addExceptionInProgress: false,
  weeklyExceptionQueries: {
    // '2022-12-12': { // Note: id/key is the start of the week in given time zone
    //   fetchExceptionsError: null,
    //   fetchExceptionsInProgress: null,
    // },
  },
  monthlyExceptionQueries: {
    // '2022-12': {
    //   fetchExceptionsError: null,
    //   fetchExceptionsInProgress: null,
    // },
  },
  allExceptions: [],
  deleteExceptionError: null,
  deleteExceptionInProgress: false,
  listingDraft: null,
  updatedTab: null,
  updateInProgress: false,
  payoutDetailsSaveInProgress: false,
  payoutDetailsSaved: false,
};

const editListingPageSlice = createSlice({
  name: 'EditListingPage',
  initialState,
  reducers: {
    markTabUpdated: (state, action) => {
      state.updatedTab = action.payload;
    },
    clearUpdatedTab: state => {
      state.updatedTab = null;
      state.updateListingError = null;
    },
    clearPublishError: state => {
      state.publishListingError = null;
    },
    resetWizard: state => {
      state.listingDraft = null;
      state.uploadedImages = {};
      state.uploadedImagesOrder = [];
      state.submittedListingId = null;
      state.listingId = null;
      state.publishSuccess = false;
      state.publishedProduct = null;
      state.redirectToListing = false;
      state.publishListingError = null;
      state.createListingDraftError = null;
      state.updateListingError = null;
      state.updatedTab = null;
    },
    removeListingImage: (state, action) => {
      const id = action.payload;

      // Only mark the image removed if it hasn't been added to the
      // listing already
      const removedImageIds = state.uploadedImages[id]
        ? state.removedImageIds
        : state.removedImageIds.concat(id);

      // Always remove from the draft since it might be a new image to
      // an existing listing.
      const uploadedImages = omit(state.uploadedImages, id);
      const uploadedImagesOrder = state.uploadedImagesOrder.filter(i => i !== id);

      state.uploadedImages = uploadedImages;
      state.uploadedImagesOrder = uploadedImagesOrder;
      state.removedImageIds = removedImageIds;
    },
  },
  extraReducers: builder => {
    builder
      // createListingDraft cases
      .addCase(createListingDraftThunk.pending, state => {
        state.createListingDraftInProgress = true;
        state.createListingDraftError = null;
        state.submittedListingId = null;
        state.listingDraft = null;
      })
      .addCase(createListingDraftThunk.fulfilled, (state, action) => {
        const updatedImagesState = updateUploadedImagesState(state, action.payload.data);
        state.uploadedImages = updatedImagesState.uploadedImages;
        state.uploadedImagesOrder = updatedImagesState.uploadedImagesOrder;
        state.createListingDraftInProgress = false;
        state.submittedListingId = action.payload.data.data.id;
        state.listingDraft = action.payload.data.data;
      })
      .addCase(createListingDraftThunk.rejected, (state, action) => {
        state.createListingDraftInProgress = false;
        state.createListingDraftError = action.payload;
      })
      // publishListing cases
      .addCase(publishListingThunk.pending, (state, action) => {
        state.listingId = action.meta.arg.listingId;
        state.publishListingError = null;
      })
      .addCase(publishListingThunk.fulfilled, (state, action) => {
        state.publishSuccess = true;
        state.publishedProduct = action.payload?.shopifyProduct || null;
        // Clear all wizard state — next listing starts fresh
        state.listingDraft = null;
        state.uploadedImages = {};
        state.uploadedImagesOrder = [];
        state.submittedListingId = null;
        state.listingId = null;
        state.createListingDraftError = null;
        state.updateListingError = null;
        state.showListingsError = null;
        state.uploadImageError = null;
        state.createListingDraftInProgress = false;
        state.updateInProgress = false;
      })
      .addCase(publishListingThunk.rejected, (state, action) => {
        // eslint-disable-next-line no-console
        console.error(action.payload);
        state.publishListingError = {
          listingId: state.listingId,
          error: action.payload,
        };
      })
      // updateListing cases
      .addCase(updateListingThunk.pending, state => {
        state.updateInProgress = true;
        state.updateListingError = null;
      })
      .addCase(updateListingThunk.fulfilled, (state, action) => {
        if (state.listingDraft && action.payload?.response?.data?.data?.attributes) {
          const newAttributes = action.payload.response.data.data.attributes;
          // Deep-merge publicData so each tab's fields accumulate rather than overwrite.
          // Without this, the Delivery tab's { shippingEnabled, pub_packageWeight, ... }
          // would replace the Details tab's { brand, series, condition, ... } entirely.
          const mergedPublicData = {
            ...(state.listingDraft.attributes.publicData || {}),
            ...(newAttributes.publicData || {}),
          };
          state.listingDraft.attributes = {
            ...state.listingDraft.attributes,
            ...newAttributes,
            publicData: mergedPublicData,
          };
        }
        state.updateInProgress = false;
      })
      .addCase(updateListingThunk.rejected, (state, action) => {
        state.updateInProgress = false;
        state.updateListingError = action.payload;
      })
      // showListing cases
      .addCase(showListingThunk.pending, state => {
        state.showListingsError = null;
      })
      .addCase(showListingThunk.fulfilled, (state, action) => {
        const listingIdFromPayload = action.payload.data.data.id;

        // For draft listings, preserve all state including listingDraft
        if (listingIdFromPayload?.uuid && listingIdFromPayload.uuid.startsWith('draft-')) {
          state.listingId = listingIdFromPayload;
          return;
        }

        // For real listings, reset state as before but preserve listingDraft and uploadedImages
        const { listingId, allExceptions, weeklyExceptionQueries, monthlyExceptionQueries, listingDraft, uploadedImages, uploadedImagesOrder } = state;
        if (listingIdFromPayload?.uuid === state.listingId?.uuid) {
          Object.assign(state, initialState);
          state.listingId = listingId;
          state.allExceptions = allExceptions;
          state.weeklyExceptionQueries = weeklyExceptionQueries;
          state.monthlyExceptionQueries = monthlyExceptionQueries;
          state.listingDraft = listingDraft;
          state.uploadedImages = uploadedImages;
          state.uploadedImagesOrder = uploadedImagesOrder;
        } else {
          Object.assign(state, initialState);
          state.listingId = listingIdFromPayload;
          // Store fetched listing as listingDraft so the wizard can populate from it
          state.listingDraft = action.payload.data.data;
          state.uploadedImages = uploadedImages;
          state.uploadedImagesOrder = uploadedImagesOrder;
        }
      })
      .addCase(showListingThunk.rejected, (state, action) => {
        // eslint-disable-next-line no-console
        console.error(action.payload);
        state.showListingsError = action.payload;
        state.redirectToListing = false;
      })
      // uploadImage cases
      .addCase(uploadImageThunk.pending, (state, action) => {
        const params = action.meta.arg.actionPayload;
        const id = params.id;
        // payload.params: { id: 'tempId', file }
        const uploadedImages = {
          ...state.uploadedImages,
          [id]: { ...params },
        };
        state.uploadedImages = uploadedImages;
        state.uploadedImagesOrder = state.uploadedImagesOrder.concat([id]);
        state.uploadImageError = null;
      })
      .addCase(uploadImageThunk.fulfilled, (state, action) => {
        console.log('[uploadImage] fulfilled - action.payload:', JSON.stringify(action.payload));
        const { id, imageId, url, file } = action.payload;
        state.uploadedImages[id] = { id, imageId, url, file };
        console.log('[uploadImage] stored at id:', id, '- uploadedImages keys:', Object.keys(state.uploadedImages));
      })
      .addCase(uploadImageThunk.rejected, (state, action) => {
        console.log('[uploadImage] REJECTED - action.payload:', action.payload);
        const { id, error } = action.payload;
        state.uploadedImagesOrder = state.uploadedImagesOrder.filter(i => i !== id);
        state.uploadedImages = omit(state.uploadedImages, id);
        state.uploadImageError = error;
      })
      // setStock cases
      .addCase(setStockThunk.pending, state => {
        state.setStockInProgress = true;
        state.setStockError = null;
      })
      .addCase(setStockThunk.fulfilled, state => {
        state.setStockInProgress = false;
      })
      .addCase(setStockThunk.rejected, (state, action) => {
        state.setStockInProgress = false;
        state.setStockError = action.payload;
      })
      // fetchAvailabilityExceptions cases
      .addCase(fetchAvailabilityExceptionsThunk.pending, (state, action) => {
        const { isWeekly, start, timeZone } = action.meta.arg.params;
        const weekStartId = isWeekly ? stringifyDateToISO8601(start) : null;
        const monthId = !isWeekly ? monthIdString(start, timeZone) : null;
        const newData = { fetchExceptionsError: null, fetchExceptionsInProgress: true };

        if (monthId) {
          state.monthlyExceptionQueries[monthId] = {
            ...state.monthlyExceptionQueries[monthId],
            ...newData,
          };
        } else if (weekStartId) {
          state.weeklyExceptionQueries[weekStartId] = {
            ...state.weeklyExceptionQueries[weekStartId],
            ...newData,
          };
        }
      })
      .addCase(fetchAvailabilityExceptionsThunk.fulfilled, (state, action) => {
        const { exceptions, monthId, weekStartId } = action.payload;
        const combinedExceptions = state.allExceptions.concat(exceptions);
        const selectId = x => x.id.uuid;
        state.allExceptions = uniqueBy(combinedExceptions, selectId).sort(
          sortExceptionsByStartTime
        );

        const newData = { fetchExceptionsInProgress: false };
        if (monthId) {
          state.monthlyExceptionQueries[monthId] = {
            ...state.monthlyExceptionQueries[monthId],
            ...newData,
          };
        } else if (weekStartId) {
          state.weeklyExceptionQueries[weekStartId] = {
            ...state.weeklyExceptionQueries[weekStartId],
            ...newData,
          };
        }
      })
      .addCase(fetchAvailabilityExceptionsThunk.rejected, (state, action) => {
        const { monthId, weekStartId, error } = action.payload;
        const newData = { fetchExceptionsInProgress: false, fetchExceptionsError: error };

        if (monthId) {
          state.monthlyExceptionQueries[monthId] = {
            ...state.monthlyExceptionQueries[monthId],
            ...newData,
          };
        } else if (weekStartId) {
          state.weeklyExceptionQueries[weekStartId] = {
            ...state.weeklyExceptionQueries[weekStartId],
            ...newData,
          };
        }
      })
      // fetchExtraAvailabilityExceptions cases
      .addCase(fetchExtraAvailabilityExceptionsThunk.fulfilled, (state, action) => {
        const combinedExceptions = state.allExceptions.concat(action.payload.exceptions);
        const selectId = x => x.id.uuid;
        state.allExceptions = uniqueBy(combinedExceptions, selectId).sort(
          sortExceptionsByStartTime
        );
      })
      // addAvailabilityException cases
      .addCase(addAvailabilityExceptionThunk.pending, state => {
        state.addExceptionError = null;
        state.addExceptionInProgress = true;
      })
      .addCase(addAvailabilityExceptionThunk.fulfilled, (state, action) => {
        const exception = action.payload.data;
        const combinedExceptions = state.allExceptions.concat(exception);
        state.allExceptions = combinedExceptions.sort(sortExceptionsByStartTime);
        state.addExceptionInProgress = false;
      })
      .addCase(addAvailabilityExceptionThunk.rejected, (state, action) => {
        state.addExceptionError = action.payload.error;
        state.addExceptionInProgress = false;
      })
      // deleteAvailabilityException cases
      .addCase(deleteAvailabilityExceptionThunk.pending, state => {
        state.deleteExceptionError = null;
        state.deleteExceptionInProgress = true;
      })
      .addCase(deleteAvailabilityExceptionThunk.fulfilled, (state, action) => {
        const exception = action.payload.data;
        const id = exception.id.uuid;
        state.allExceptions = state.allExceptions.filter(e => e.id.uuid !== id);
        state.deleteExceptionInProgress = false;
      })
      .addCase(deleteAvailabilityExceptionThunk.rejected, (state, action) => {
        state.deleteExceptionError = action.payload.error;
        state.deleteExceptionInProgress = false;
      })
      // savePayoutDetails cases
      .addCase(savePayoutDetailsThunk.pending, state => {
        state.payoutDetailsSaveInProgress = true;
      })
      .addCase(savePayoutDetailsThunk.fulfilled, state => {
        state.payoutDetailsSaveInProgress = false;
        state.payoutDetailsSaved = true;
      })
      .addCase(savePayoutDetailsThunk.rejected, state => {
        state.payoutDetailsSaveInProgress = false;
      });
  },
});

export const {
  markTabUpdated,
  clearUpdatedTab,
  clearPublishError,
  removeListingImage,
  resetWizard,
} = editListingPageSlice.actions;
export default editListingPageSlice.reducer;

// ================ Load data ================ //

// loadData is run for each tab of the wizard. When editing an
// existing listing, the listing must be fetched first.
export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  dispatch(clearUpdatedTab());
  dispatch(clearPublishError());
  const { id, type } = params;
  const fetchCurrentUserOptions = {
    updateNotifications: false,
  };

  if (type === 'new') {
    // No need to listing data when creating a new listing
    return Promise.all([dispatch(fetchCurrentUser(fetchCurrentUserOptions))])
      .then(response => {
        const currentUser = getState().user.currentUser;
        if (currentUser && currentUser.stripeAccount) {
          dispatch(fetchStripeAccount());
        }
        return response;
      })
      .catch(e => {
        throw e;
      });
  }

  // For draft tabs, skip showListingThunk if the draft already exists in Redux
  if (type === 'draft' && id?.startsWith('draft-')) {
    const existingDraft = getState().EditListingPage.listingDraft;
    if (existingDraft && existingDraft.id?.uuid === id) {
      console.log('Draft already in Redux, skipping showListingThunk for:', id);
      return Promise.all([dispatch(fetchCurrentUser(fetchCurrentUserOptions))])
        .then(response => {
          const currentUser = getState().user.currentUser;
          if (currentUser && currentUser.stripeAccount) {
            dispatch(fetchStripeAccount());
          }
          return response;
        })
        .catch(e => {
          throw e;
        });
    }
  }

  // For draft or edit mode, use showListingThunk instead of Sharetribe
  const listingId = { uuid: id };
  return Promise.all([
    dispatch(showListingThunk({ listingId, config })),
    dispatch(fetchCurrentUser(fetchCurrentUserOptions)),
  ])
    .then(response => {
      const currentUser = getState().user.currentUser;

      // Do not fetch extra information if user is in pending-approval state.
      if (isUserAuthorized(currentUser)) {
        if (currentUser && currentUser.stripeAccount) {
          dispatch(fetchStripeAccount());
        }

        // Response from showListingThunk
        const listing = response[0]?.data?.data;
        const transactionProcessAlias = listing?.attributes?.publicData?.transactionProcessAlias;
        if (listing && isBookingProcessAlias(transactionProcessAlias)) {
          fetchLoadDataExceptions(dispatch, listing, search, config.localization.firstDayOfWeek);
        }
      }

      return response;
    })
    .catch(e => {
      throw e;
    });
};