import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ensureOwnListing } from '../util/data';
import * as log from '../util/log';
import { LISTING_STATE_DRAFT } from '../util/types';
import { storableError } from '../util/errors';
import { isUserAuthorized } from '../util/userHelpers';
import { getAccessToken, refreshAccessToken } from '../util/authTokens';

import { authInfo } from './auth.duck';
import { updateStripeConnectAccount } from './stripeConnectAccount.duck';

// Map a Supabase user object to the Sharetribe-compatible shape expected by the UI
const formatSupabaseUser = supabaseUser => {
  const metadata = supabaseUser.user_metadata || {};
  const profile = supabaseUser.profile || {};
  return {
    id: { uuid: supabaseUser.id },
    type: 'currentUser',
    attributes: {
      email: supabaseUser.email,
      emailVerified: !!supabaseUser.email_confirmed_at,
      profile: {
        displayName: metadata.display_name || supabaseUser.email?.split('@')[0] || '',
        firstName: metadata.first_name || '',
        lastName: metadata.last_name || '',
        abbreviatedName: (() => {
          const parts = (metadata.display_name || '').trim().split(/\s+/).filter(Boolean);
          if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          if (parts.length === 1) return parts[0][0].toUpperCase();
          return (supabaseUser.email || '')[0]?.toUpperCase() || '';
        })(),
        bio: profile.bio || null,
        publicData: profile.publicData || {},
        privateData: profile.privateData || {},
        protectedData: profile.protectedData || {},
        metadata: {},
      },
      createdAt: supabaseUser.created_at ? new Date(supabaseUser.created_at) : null,
      state: 'active',
      permissions: { postListings: { allowed: true }, initiateTransactions: { allowed: true } },
    },
    relationships: {
      effectivePermissionSet: {
        data: {
          id: { uuid: 'default-permission-set' },
          type: 'permissionSet',
        },
      },
    },
    effectivePermissionSet: {
      id: { uuid: 'default-permission-set' },
      type: 'permissionSet',
      attributes: {
        postListings: 'permission/allow',
        initiateTransactions: 'permission/allow',
        viewData: 'permission/allow',
      },
    },
  };
};

// ================ Helper Functions ================ //

const mergeCurrentUser = (oldCurrentUser, newCurrentUser) => {
  const { id: oId, type: oType, attributes: oAttr, ...oldRelationships } = oldCurrentUser || {};
  const { id, type, attributes, ...relationships } = newCurrentUser || {};

  // Passing null will remove currentUser entity.
  // Only relationships are merged.
  // TODO figure out if sparse fields handling needs a better handling.
  return newCurrentUser === null
    ? null
    : oldCurrentUser === null
    ? newCurrentUser
    : { id, type, attributes, ...oldRelationships, ...relationships };
};

// ================ Async Thunks ================ //

//////////////////////////////////////////////////////////////////////
// Fetch ownListings to check if currentUser has published listings //
//////////////////////////////////////////////////////////////////////

const fetchCurrentUserHasListingsPayloadCreator = (_, thunkAPI) => {
  // TODO: replace with Shopify product count query for this vendor
  return Promise.resolve({ hasListings: false });
};

export const fetchCurrentUserHasListingsThunk = createAsyncThunk(
  'user/fetchCurrentUserHasListings',
  fetchCurrentUserHasListingsPayloadCreator
);

// Backward compatible wrapper for the thunk
export const fetchCurrentUserHasListings = () => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserHasListingsThunk()).unwrap();
};

///////////////////////////////////////////////////////////
// Fetch transactions to check if currentUser has orders //
///////////////////////////////////////////////////////////

const fetchCurrentUserHasOrdersPayloadCreator = () => {
  // TODO: replace with Shopify order count query for this vendor
  return Promise.resolve({ hasOrders: false });
};

export const fetchCurrentUserHasOrdersThunk = createAsyncThunk(
  'user/fetchCurrentUserHasOrders',
  fetchCurrentUserHasOrdersPayloadCreator
);

// Backward compatible wrapper for the thunk
export const fetchCurrentUserHasOrders = () => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserHasOrdersThunk()).unwrap();
};

/////////////////////////////////////////////////////////////////////////////////////
// Fetch transactions in specific states to check if currentUser has notifications //
/////////////////////////////////////////////////////////////////////////////////////

// Notificaiton page size is max (100 items on page)
const NOTIFICATION_PAGE_SIZE = 100;

const fetchCurrentUserNotificationsPayloadCreator = () => {
  // TODO: replace with Shopify/Supabase notification query
  return Promise.resolve({ saleNotificationsCount: 0, orderNotificationsCount: 0 });
};

export const fetchCurrentUserNotificationsThunk = createAsyncThunk(
  'user/fetchCurrentUserNotifications',
  fetchCurrentUserNotificationsPayloadCreator
);

// Backward compatible wrapper for the thunk
export const fetchCurrentUserNotifications = () => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserNotificationsThunk()).unwrap();
};

const fetchCurrentUserPayloadCreator = (options, thunkAPI) => {
  const { getState, dispatch, extra: sdk, rejectWithValue } = thunkAPI;
  const state = getState();
  const { currentUserHasListings, currentUserShowTimestamp } = state.user || {};
  const { isAuthenticated } = state.auth;
  const {
    updateHasListings = true,
    updateNotifications = true,
    afterLogin,
    enforce = false, // Automatic emailVerification might be called too fast
  } = options || {};

  // Double fetch might happen when e.g. profile page is making a full page load
  const aSecondAgo = new Date().getTime() - 1000;
  if (!enforce && currentUserShowTimestamp > aSecondAgo) {
    return Promise.resolve(state.user.currentUser);
  }

  if (!isAuthenticated && !afterLogin) {
    // Make sure current user is null
    return Promise.resolve(null);
  }

  const token = getAccessToken();
  if (!token && !afterLogin) {
    return Promise.resolve(null);
  }

  const fetchUser = accessToken =>
    fetch('/api/auth/current-user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

  return fetchUser(token)
    .then(async res => {
      if (res.status === 401) {
        // Token expired — try refresh
        const newToken = await refreshAccessToken();
        if (!newToken) return null;
        const retryRes = await fetchUser(newToken);
        if (!retryRes.ok) return null;
        return retryRes.json();
      }
      if (!res.ok) return null;
      return res.json();
    })
    .then(data => {
      if (!data?.user) return null;
      const currentUser = formatSupabaseUser(data.user);
      log.setUserId(currentUser.id.uuid);
      return currentUser;
    })
    .then(currentUser => {
      if (!currentUser) return null;
      if (isUserAuthorized(currentUser)) {
        if (currentUserHasListings === false && updateHasListings !== false) {
          dispatch(fetchCurrentUserHasListings());
        }
        if (updateNotifications !== false) {
          dispatch(fetchCurrentUserNotifications());
        }
      }
      dispatch(authInfo());
      return currentUser;
    })
    .catch(e => {
      dispatch(authInfo());
      log.error(e, 'fetch-current-user-failed');
      return rejectWithValue(storableError(e));
    });
};

export const fetchCurrentUserThunk = createAsyncThunk(
  'user/fetchCurrentUser',
  fetchCurrentUserPayloadCreator
);
// Backward compatible wrapper for the thunk
/**
 * Fetch currentUser API entity.
 *
 * @param {Object} options
 * @param {Object} [options.callParams]           Optional parameters for the currentUser.show().
 * @param {boolean} [options.updateHasListings]   Make extra call for fetchCurrentUserHasListings()?
 * @param {boolean} [options.updateNotifications] Make extra call for fetchCurrentUserNotifications()?
 * @param {boolean} [options.afterLogin]          Fetch is no-op for unauthenticated users except after login() call
 * @param {boolean} [options.enforce]             Enforce the call even if the currentUser entity is freshly fetched.
 */
export const fetchCurrentUser = options => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserThunk(options)).unwrap();
};

/////////////////////////////////////////////
// Send verification email to currentUser //
/////////////////////////////////////////////

const sendVerificationEmailPayloadCreator = () => {
  // TODO: trigger Supabase email verification resend
  return Promise.resolve({});
};
export const sendVerificationEmailThunk = createAsyncThunk(
  'user/sendVerificationEmail',
  sendVerificationEmailPayloadCreator,
  {
    condition: (_, { getState }) => {
      return !getState()?.user?.sendVerificationEmailInProgress;
    },
  }
);

// Backward compatible wrapper for the thunk
export const sendVerificationEmail = () => (dispatch, getState, sdk) => {
  return dispatch(sendVerificationEmailThunk()).unwrap();
};

// ================ Slice ================ //

const userSlice = createSlice({
  name: 'user',
  initialState: {
    currentUser: null,
    currentUserShowTimestamp: 0,
    currentUserShowError: null,
    currentUserHasListings: false,
    currentUserHasListingsError: null,
    currentUserSaleNotificationCount: 0,
    currentUserOrderNotificationCount: 0,
    currentUserNotificationCountError: null,
    currentUserHasOrders: null, // This is not fetched unless unverified emails exist
    currentUserHasOrdersError: null,
    sendVerificationEmailInProgress: false,
    sendVerificationEmailError: null,
  },
  reducers: {
    clearCurrentUser: state => {
      state.currentUser = null;
      state.currentUserShowError = null;
      state.currentUserHasListings = false;
      state.currentUserHasListingsError = null;
      state.currentUserSaleNotificationCount = 0;
      state.currentUserOrderNotificationCount = 0;

      state.currentUserNotificationCountError = null;
    },
    setCurrentUser: (state, action) => {
      state.currentUser = mergeCurrentUser(state.currentUser, action.payload);
    },
    setCurrentUserHasOrders: state => {
      state.currentUserHasOrders = true;
    },
  },
  extraReducers: builder => {
    builder
      // fetchCurrentUser
      .addCase(fetchCurrentUserThunk.pending, state => {
        state.currentUserShowError = null;
      })
      .addCase(fetchCurrentUserThunk.fulfilled, (state, action) => {
        state.currentUser = mergeCurrentUser(state.currentUser, action.payload);
        state.currentUserShowTimestamp = action.payload ? new Date().getTime() : 0;
      })
      .addCase(fetchCurrentUserThunk.rejected, (state, action) => {
        // eslint-disable-next-line no-console
        console.error(action.payload);
        state.currentUserShowError = action.payload;
      })
      // fetchCurrentUserHasListings
      .addCase(fetchCurrentUserHasListingsThunk.pending, state => {
        state.currentUserHasListingsError = null;
      })
      .addCase(fetchCurrentUserHasListingsThunk.fulfilled, (state, action) => {
        state.currentUserHasListings = action.payload.hasListings;
      })
      .addCase(fetchCurrentUserHasListingsThunk.rejected, (state, action) => {
        console.error(action.payload); // eslint-disable-line
        state.currentUserHasListingsError = action.payload;
      })
      // fetchCurrentUserNotifications
      .addCase(fetchCurrentUserNotificationsThunk.pending, state => {
        state.currentUserNotificationCountError = null;
      })
      .addCase(fetchCurrentUserNotificationsThunk.fulfilled, (state, action) => {
        state.currentUserSaleNotificationCount = action.payload.saleNotificationsCount;
        state.currentUserOrderNotificationCount = action.payload.orderNotificationsCount;
      })
      .addCase(fetchCurrentUserNotificationsThunk.rejected, (state, action) => {
        console.error(action.payload); // eslint-disable-line
        state.currentUserNotificationCountError = action.payload;
      })
      // fetchCurrentUserHasOrders
      .addCase(fetchCurrentUserHasOrdersThunk.pending, state => {
        state.currentUserHasOrdersError = null;
      })
      .addCase(fetchCurrentUserHasOrdersThunk.fulfilled, (state, action) => {
        state.currentUserHasOrders = action.payload.hasOrders;
      })
      .addCase(fetchCurrentUserHasOrdersThunk.rejected, (state, action) => {
        console.error(action.payload); // eslint-disable-line
        state.currentUserHasOrdersError = action.payload;
      })
      // sendVerificationEmail
      .addCase(sendVerificationEmailThunk.pending, state => {
        state.sendVerificationEmailInProgress = true;
        state.sendVerificationEmailError = null;
      })
      .addCase(sendVerificationEmailThunk.fulfilled, state => {
        state.sendVerificationEmailInProgress = false;
      })
      .addCase(sendVerificationEmailThunk.rejected, (state, action) => {
        state.sendVerificationEmailInProgress = false;
        state.sendVerificationEmailError = action.payload;
      });
  },
});

export default userSlice.reducer;

export const { clearCurrentUser, setCurrentUser, setCurrentUserHasOrders } = userSlice.actions;

// ================ Selectors ================ //

export const hasCurrentUserErrors = state => {
  const { user } = state;
  return (
    user.currentUserShowError ||
    user.currentUserHasListingsError ||
    user.currentUserNotificationCountError ||
    user.currentUserHasOrdersError
  );
};
