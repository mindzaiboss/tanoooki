import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import { types as sdkTypes } from '../../util/sdkLoader';
import { storableError } from '../../util/errors';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { transactionLineItems } from '../../util/api';
import * as log from '../../util/log';
import {
  bookingTimeUnits,
  findNextBoundary,
  getStartOf,
  monthIdString,
  stringifyDateToISO8601,
} from '../../util/dates';

import {
  getProcess,
  isBookingProcessAlias,
  isNegotiationProcessAlias,
  OFFER,
} from '../../transactions/transaction';
import { denormalisedResponseEntities } from '../../util/data';
import {
  hasPermissionToInitiateTransactions,
  isUserAuthorized,
} from '../../util/userHelpers';
import { fetchCurrentUser, setCurrentUserHasOrders } from '../../ducks/user.duck';

const { UUID, Money } = sdkTypes;
const MINUTE_IN_MS = 1000 * 60;

// Day-based time slots queries are cached for 1 minute.
const removeOutdatedDateData = timeSlotsForDate => {
  const now = new Date().getTime();
  const minuteAgo = now - MINUTE_IN_MS;
  return Object.fromEntries(
    Object.entries(timeSlotsForDate).filter(([dateId, data]) => {
      return data.fetchedAt && data.fetchedAt > minuteAgo;
    })
  );
};

// ================ Async Thunks ================ //

//////////////////
// Show Listing //
//////////////////
const showListingPayloadCreator = async ({ listingId, config, isOwn = false }, thunkAPI) => {
  const { dispatch, rejectWithValue } = thunkAPI;

  dispatch(fetchCurrentUser({ updateHasListings: false, updateNotifications: false }));

  try {
    const productId = decodeURIComponent(listingId.uuid);
    const response = await fetch(`/api/shopify/products/${encodeURIComponent(productId)}`);

    if (!response.ok) {
      return rejectWithValue({ status: response.status });
    }

    const json = await response.json();
    if (!json.listing) {
      return rejectWithValue({ status: 404 });
    }

    const { listing: rawListing } = json;

    // Convert plain price object to Money instance
    const rawPrice = rawListing.attributes?.price;
    const price = rawPrice ? new Money(rawPrice.amount, rawPrice.currency) : null;

    const listing = {
      ...rawListing,
      // Override id with the UUID object loadData passed in (ensures consistent lookup key)
      id: listingId,
      attributes: {
        ...rawListing.attributes,
        price,
      },
    };

    // Store under both types so getListing (entities.listing) and
    // getOwnListing (entities.ownListing) both find it regardless of auth state.
    const listingAsListing = { ...listing, type: 'listing' };
    const listingAsOwnListing = { ...listing, type: 'ownListing' };

    // Images are embedded directly on each entity (not via relationships) so
    // denormalisedEntities skips the recursive throwIfNotFound lookup.
    const sdkResponse = { data: { data: [listingAsListing, listingAsOwnListing], included: [] } };
    dispatch(addMarketplaceEntities(sdkResponse, {}));
    console.log('=== STORED LISTING DEBUG ===');
    console.log('listingId:', listingId);
    console.log('listing.id:', listing.id);
    console.log('sdkResponse:', JSON.stringify(sdkResponse, null, 2));
    console.log('============================');
    return sdkResponse;
  } catch (e) {
    return rejectWithValue(storableError(e));
  }
};

export const showListingThunk = createAsyncThunk(
  'ListingPage/showListing',
  showListingPayloadCreator
);
// Backward compatible wrapper for the thunk
export const showListing = (listingId, config, isOwn = false) => (dispatch, getState, sdk) => {
  return dispatch(showListingThunk({ listingId, config, isOwn })).unwrap();
};

///////////////////
// Fetch Reviews //
///////////////////
export const fetchReviewsThunk = createAsyncThunk(
  'ListingPage/fetchReviews',
  () => Promise.resolve([])
);

export const fetchReviews = listingId => dispatch => {
  return dispatch(fetchReviewsThunk({ listingId })).unwrap();
};

//////////////////////
// Fetch Time Slots //
//////////////////////

const timeSlotsRequest = createAsyncThunk(
  'ListingPage/timeSlotsRequest',
  (params, { extra: sdk }) => {
    return sdk.timeslots.query(params).then(response => {
      return denormalisedResponseEntities(response);
    });
  }
);

const fetchTimeSlotsPayloadCreator = ({ listingId, start, end, timeZone, options }, thunkAPI) => {
  const { dispatch, getState } = thunkAPI;
  const { extraQueryParams = null, useFetchTimeSlotsForDate = false } = options || {};

  const extraParams = extraQueryParams || { perPage: 500, page: 1 };

  if (useFetchTimeSlotsForDate) {
    const dateId = stringifyDateToISO8601(start, timeZone);
    const dateData = getState().ListingPage.timeSlotsForDate[dateId];
    const minuteAgo = new Date().getTime() - MINUTE_IN_MS;
    const hasRecentlyFetchedData = dateData?.fetchedAt > minuteAgo;
    if (hasRecentlyFetchedData) {
      return Promise.resolve(dateData?.timeSlots || []);
    }
    return dispatch(timeSlotsRequest({ listingId, start, end, ...extraParams }))
      .then(response => response.payload)
      .catch(() => []);
  } else {
    return dispatch(timeSlotsRequest({ listingId, start, end, ...extraParams }))
      .then(response => response.payload)
      .catch(() => []);
  }
};

export const fetchTimeSlotsThunk = createAsyncThunk(
  'ListingPage/fetchTimeSlots',
  fetchTimeSlotsPayloadCreator
);
// Backward compatible wrapper for the thunk
export const fetchTimeSlots = (listingId, start, end, timeZone, options) => (
  dispatch,
  getState,
  sdk
) => {
  return dispatch(fetchTimeSlotsThunk({ listingId, start, end, timeZone, options })).unwrap();
};

//////////////////
// Send Inquiry //
//////////////////
const sendInquiryPayloadCreator = (
  { listing, message },
  { dispatch, rejectWithValue, extra: sdk }
) => {
  const processAlias = listing?.attributes?.publicData?.transactionProcessAlias;
  if (!processAlias) {
    const error = new Error('No transaction process attached to listing');
    log.error(error, 'listing-process-missing', { listingId: listing?.id?.uuid });
    return rejectWithValue(storableError(error));
  }

  const listingId = listing?.id;
  const [processName] = processAlias.split('/');
  const isNegotiationProcess = isNegotiationProcessAlias(processAlias);
  const unitType = listing?.attributes?.publicData?.unitType || '';
  if (isNegotiationProcess && unitType === OFFER) {
    return rejectWithValue(
      storableError(
        new Error('Negotiation process with unit type OFFER does not support inquiry for customer role')
      )
    );
  }

  const transitions = getProcess(processName)?.transitions;
  const bodyParams = {
    transition: transitions.INQUIRE,
    processAlias,
    params: { listingId },
  };
  return sdk.transactions
    .initiate(bodyParams)
    .then(response => {
      const transactionId = response.data.data.id;
      return sdk.messages.send({ transactionId, content: message }).then(() => {
        dispatch(setCurrentUserHasOrders());
        return transactionId;
      });
    })
    .catch(e => rejectWithValue(storableError(e)));
};

export const sendInquiryThunk = createAsyncThunk(
  'ListingPage/sendInquiry',
  sendInquiryPayloadCreator
);
// Backward compatible wrapper for the thunk
export const sendInquiry = (listing, message) => (dispatch, getState, sdk) => {
  return dispatch(sendInquiryThunk({ listing, message })).unwrap();
};

// Helper function for loadData call.
const fetchMonthlyTimeSlots = (dispatch, listing) => {
  const hasWindow = typeof window !== 'undefined';
  const { availabilityPlan, publicData } = listing?.attributes || {};
  const tz = availabilityPlan?.timezone;

  if (hasWindow && listing.id && !!tz) {
    const { unitType, priceVariants, startTimeInterval } = publicData || {};
    const now = new Date();
    const startOfToday = getStartOf(now, 'day', tz);
    const isFixed = unitType === 'fixed';

    const timeUnit = startTimeInterval
      ? bookingTimeUnits[startTimeInterval]?.timeUnit
      : unitType === 'hour'
      ? 'hour'
      : 'day';
    const nextBoundary = findNextBoundary(now, 1, timeUnit, tz);
    const nextMonth = getStartOf(nextBoundary, 'month', tz, 1, 'months');
    const nextAfterNextMonth = getStartOf(nextMonth, 'month', tz, 1, 'months');

    const variants = priceVariants || [];
    const bookingLengthInMinutes = variants.reduce((min, priceVariant) => {
      return Math.min(min, priceVariant.bookingLengthInMinutes);
    }, Number.MAX_SAFE_INTEGER);

    const nextMonthEnd = isFixed
      ? getStartOf(nextMonth, 'minute', tz, bookingLengthInMinutes, 'minutes')
      : nextMonth;
    const followingMonthEnd = isFixed
      ? getStartOf(nextAfterNextMonth, 'minute', tz, bookingLengthInMinutes, 'minutes')
      : nextAfterNextMonth;

    const minDurationStartingInInterval = isFixed ? bookingLengthInMinutes : 60;
    const options = intervalAlign => {
      return ['fixed', 'hour'].includes(unitType)
        ? {
            extraQueryParams: {
              intervalDuration: 'P1D',
              intervalAlign,
              maxPerInterval: 1,
              minDurationStartingInInterval,
              perPage: 31,
              page: 1,
            },
          }
        : null;
    };

    return Promise.all([
      dispatch(fetchTimeSlots(listing.id, nextBoundary, nextMonthEnd, tz, options(startOfToday))),
      dispatch(fetchTimeSlots(listing.id, nextMonth, followingMonthEnd, tz, options(nextMonth))),
    ]);
  }

  return Promise.all([]);
};

//////////////////////////////////
// Fetch Transaction Line Items //
//////////////////////////////////
const fetchTransactionLineItemsPayloadCreator = (
  { orderData, listingId, isOwnListing },
  { rejectWithValue }
) => {
  return transactionLineItems({ orderData, listingId, isOwnListing })
    .then(response => response.data)
    .catch(e => {
      log.error(e, 'fetching-line-items-failed', {
        listingId: listingId.uuid,
        orderData,
        statusText: e.statusText,
      });
      return rejectWithValue(storableError(e));
    });
};

export const fetchTransactionLineItemsThunk = createAsyncThunk(
  'ListingPage/fetchTransactionLineItems',
  fetchTransactionLineItemsPayloadCreator
);
// Backward compatible wrapper for the thunk
export const fetchTransactionLineItems = ({ orderData, listingId, isOwnListing }) => dispatch => {
  return dispatch(fetchTransactionLineItemsThunk({ orderData, listingId, isOwnListing })).unwrap();
};

// ================ Slice ================ //

const initialState = {
  id: null,
  showListingError: null,
  reviews: [],
  fetchReviewsError: null,
  monthlyTimeSlots: {},
  timeSlotsForDate: {},
  lineItems: null,
  fetchLineItemsInProgress: false,
  fetchLineItemsError: null,
  sendInquiryInProgress: false,
  sendInquiryError: null,
  inquiryModalOpenForListingId: null,
};

const listingPageSlice = createSlice({
  name: 'ListingPage',
  initialState,
  reducers: {
    setInitialValues: (state, action) => {
      return { ...initialState, ...action.payload };
    },
  },
  extraReducers: builder => {
    builder
      .addCase(showListingThunk.pending, (state, action) => {
        state.id = action.meta.arg.listingId;
        state.showListingError = null;
      })
      .addCase(showListingThunk.fulfilled, state => {
        // Data stored via addMarketplaceEntities in the thunk
      })
      .addCase(showListingThunk.rejected, (state, action) => {
        state.showListingError = action.payload;
      })
      .addCase(fetchReviewsThunk.pending, state => {
        state.fetchReviewsError = null;
      })
      .addCase(fetchReviewsThunk.fulfilled, (state, action) => {
        state.reviews = action.payload;
      })
      .addCase(fetchReviewsThunk.rejected, (state, action) => {
        state.fetchReviewsError = action.payload;
      })
      .addCase(fetchTimeSlotsThunk.pending, (state, action) => {
        const { options, start, timeZone } = action.meta.arg;
        const { useFetchTimeSlotsForDate = false } = options || {};
        if (useFetchTimeSlotsForDate) {
          const dateId = stringifyDateToISO8601(start, timeZone);
          state.timeSlotsForDate = removeOutdatedDateData(state.timeSlotsForDate);
          if (!state.timeSlotsForDate[dateId]) state.timeSlotsForDate[dateId] = {};
          state.timeSlotsForDate[dateId].fetchTimeSlotsError = null;
          state.timeSlotsForDate[dateId].fetchedAt = null;
          state.timeSlotsForDate[dateId].fetchTimeSlotsInProgress = true;
          state.timeSlotsForDate[dateId].timeSlots = [];
        } else {
          const monthId = monthIdString(start, timeZone);
          if (!state.monthlyTimeSlots[monthId]) state.monthlyTimeSlots[monthId] = {};
          state.monthlyTimeSlots[monthId].fetchTimeSlotsError = null;
          state.monthlyTimeSlots[monthId].fetchTimeSlotsInProgress = true;
        }
      })
      .addCase(fetchTimeSlotsThunk.fulfilled, (state, action) => {
        const { options, start, timeZone } = action.meta.arg;
        const { useFetchTimeSlotsForDate = false } = options || {};
        if (useFetchTimeSlotsForDate) {
          const dateId = stringifyDateToISO8601(start, timeZone);
          if (!state.timeSlotsForDate[dateId]) state.timeSlotsForDate[dateId] = {};
          state.timeSlotsForDate[dateId].fetchTimeSlotsInProgress = false;
          state.timeSlotsForDate[dateId].fetchedAt = new Date().getTime();
          state.timeSlotsForDate[dateId].timeSlots = action.payload;
        } else {
          const monthId = monthIdString(start, timeZone);
          if (!state.monthlyTimeSlots[monthId]) state.monthlyTimeSlots[monthId] = {};
          state.monthlyTimeSlots[monthId].fetchTimeSlotsInProgress = false;
          state.monthlyTimeSlots[monthId].timeSlots = action.payload;
        }
      })
      .addCase(fetchTimeSlotsThunk.rejected, (state, action) => {
        const { options, start, timeZone } = action.meta.arg;
        const { useFetchTimeSlotsForDate = false } = options || {};
        if (useFetchTimeSlotsForDate) {
          const dateId = stringifyDateToISO8601(start, timeZone);
          if (!state.timeSlotsForDate[dateId]) state.timeSlotsForDate[dateId] = {};
          state.timeSlotsForDate[dateId].fetchTimeSlotsInProgress = false;
          state.timeSlotsForDate[dateId].fetchTimeSlotsError = action.payload;
        } else {
          const monthId = monthIdString(start, timeZone);
          if (!state.monthlyTimeSlots[monthId]) state.monthlyTimeSlots[monthId] = {};
          state.monthlyTimeSlots[monthId].fetchTimeSlotsInProgress = false;
          state.monthlyTimeSlots[monthId].fetchTimeSlotsError = action.payload;
        }
      })
      .addCase(sendInquiryThunk.pending, state => {
        state.sendInquiryInProgress = true;
        state.sendInquiryError = null;
      })
      .addCase(sendInquiryThunk.fulfilled, state => {
        state.sendInquiryInProgress = false;
        state.inquiryModalOpenForListingId = null;
      })
      .addCase(sendInquiryThunk.rejected, (state, action) => {
        state.sendInquiryInProgress = false;
        state.sendInquiryError = action.payload;
      })
      .addCase(fetchTransactionLineItemsThunk.pending, state => {
        state.fetchLineItemsInProgress = true;
        state.fetchLineItemsError = null;
      })
      .addCase(fetchTransactionLineItemsThunk.fulfilled, (state, action) => {
        state.fetchLineItemsInProgress = false;
        state.lineItems = action.payload;
      })
      .addCase(fetchTransactionLineItemsThunk.rejected, (state, action) => {
        state.fetchLineItemsInProgress = false;
        state.fetchLineItemsError = action.payload;
      });
  },
});

export const { setInitialValues } = listingPageSlice.actions;

export default listingPageSlice.reducer;

// ================ Load data ================ //

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  const decodedId = decodeURIComponent(params.id);
  const listingId = new UUID(decodedId);
  const state = getState();
  const currentUser = state.user?.currentUser;
  const inquiryModalOpenForListingId =
    isUserAuthorized(currentUser) && hasPermissionToInitiateTransactions(currentUser)
      ? state.ListingPage.inquiryModalOpenForListingId
      : null;

  dispatch(setInitialValues({ lineItems: null, inquiryModalOpenForListingId }));

  return Promise.all([
    dispatch(showListing(listingId, config)),
    dispatch(fetchReviews(listingId)),
  ]).then(response => {
    const listingResponse = response[0];
    const listing = listingResponse?.data?.data;
    const transactionProcessAlias = listing?.attributes?.publicData?.transactionProcessAlias || '';
    if (isBookingProcessAlias(transactionProcessAlias)) {
      fetchMonthlyTimeSlots(dispatch, listing);
    }
    return response;
  });
};
