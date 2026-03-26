import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { setCurrentUser } from '../../ducks/user.duck';
import { denormalisedResponseEntities } from '../../util/data';

// ================ Async Thunks ================ //

export const updateProfileThunk = createAsyncThunk(
  'AddressesPage/updateProfile',
  (actionPayload, { dispatch, rejectWithValue, extra: sdk }) => {
    const queryParams = {
      expand: true,
    };

    return sdk.currentUser
      .updateProfile(actionPayload, queryParams)
      .then(response => {
        const entities = denormalisedResponseEntities(response);
        if (entities.length !== 1) {
          throw new Error('Expected a resource in the sdk.currentUser.updateProfile response');
        }
        const currentUser = entities[0];
        dispatch(setCurrentUser(currentUser));
        return response;
      })
      .catch(e => {
        return rejectWithValue(storableError(e));
      });
  }
);

export const updateProfile = actionPayload => dispatch => {
  return dispatch(updateProfileThunk(actionPayload));
};

// ================ Slice ================ //

const addressesPageSlice = createSlice({
  name: 'AddressesPage',
  initialState: {
    updateProfileInProgress: false,
    updateProfileError: null,
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(updateProfileThunk.pending, state => {
        state.updateProfileInProgress = true;
        state.updateProfileError = null;
      })
      .addCase(updateProfileThunk.fulfilled, state => {
        state.updateProfileInProgress = false;
      })
      .addCase(updateProfileThunk.rejected, (state, action) => {
        state.updateProfileInProgress = false;
        state.updateProfileError = action.payload;
      });
  },
});

export default addressesPageSlice.reducer;
