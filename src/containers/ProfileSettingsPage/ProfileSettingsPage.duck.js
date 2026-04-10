import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { fetchCurrentUser } from '../../ducks/user.duck';
import { updateUserProfile } from '../../util/api';

// ================ Async Thunks ================ //

//////////////////
// Upload Image //
//////////////////
export const uploadImageThunk = createAsyncThunk(
  'ProfileSettingsPage/uploadImage',
  ({ id, file }, { rejectWithValue, extra: sdk }) => {
    const bodyParams = {
      image: file,
    };
    const queryParams = {
      expand: true,
      'fields.image': ['variants.square-small', 'variants.square-small2x'],
    };

    return sdk.images
      .upload(bodyParams, queryParams)
      .then(resp => {
        const uploadedImage = resp.data.data;
        return { id, uploadedImage };
      })
      .catch(e => {
        return rejectWithValue({ id, error: storableError(e) });
      });
  }
);
// Backward compatible wrapper for the uploadImage thunk
export const uploadImage = actionPayload => dispatch => {
  return dispatch(uploadImageThunk(actionPayload));
};

////////////////////
// Update Profile //
////////////////////
export const updateProfileThunk = createAsyncThunk(
  'ProfileSettingsPage/updateProfile',
  async (actionPayload, { dispatch, rejectWithValue, getState }) => {
    const { user } = getState();
    const currentUser = user?.currentUser;

    if (!currentUser?.id?.uuid) {
      return rejectWithValue({ error: 'User not authenticated' });
    }

    try {
      const response = await updateUserProfile({
        userId: currentUser.id.uuid,
        username: actionPayload.username,
        firstName: actionPayload.firstName,
        lastName: actionPayload.lastName,
        bio: actionPayload.bio,
        phoneNumber: actionPayload.phoneNumber,
      });

      if (response.success) {
        await dispatch(fetchCurrentUser({ enforce: true }));
        return response;
      } else {
        return rejectWithValue({ error: 'Profile update failed' });
      }
    } catch (e) {
      return rejectWithValue(storableError(e));
    }
  }
);
// Backward compatible wrapper for the updateProfile thunk
export const updateProfile = actionPayload => dispatch => {
  return dispatch(updateProfileThunk(actionPayload));
};

// ================ Slice ================ //

const profileSettingsPageSlice = createSlice({
  name: 'ProfileSettingsPage',
  initialState: {
    image: null,
    uploadImageError: null,
    uploadInProgress: false,
    updateInProgress: false,
    updateProfileError: null,
  },
  reducers: {
    clearUpdatedForm: state => {
      state.updateProfileError = null;
      state.uploadImageError = null;
    },
  },
  extraReducers: builder => {
    builder
      // uploadImage cases
      .addCase(uploadImageThunk.pending, (state, action) => {
        const { id, file } = action.meta.arg;
        state.image = { id, file };
        state.uploadInProgress = true;
        state.uploadImageError = null;
      })
      .addCase(uploadImageThunk.fulfilled, (state, action) => {
        const { id, uploadedImage } = action.payload;
        const { file } = state.image || {};
        state.image = { id, imageId: uploadedImage.id, file, uploadedImage };
        state.uploadInProgress = false;
      })
      .addCase(uploadImageThunk.rejected, (state, action) => {
        state.image = null;
        state.uploadInProgress = false;
        state.uploadImageError = action.payload.error;
      })
      // updateProfile cases
      .addCase(updateProfileThunk.pending, state => {
        state.updateInProgress = true;
        state.updateProfileError = null;
      })
      .addCase(updateProfileThunk.fulfilled, state => {
        state.image = null;
        state.updateInProgress = false;
      })
      .addCase(updateProfileThunk.rejected, (state, action) => {
        state.image = null;
        state.updateInProgress = false;
        state.updateProfileError = action.payload;
      });
  },
});

export const { clearUpdatedForm } = profileSettingsPageSlice.actions;
export default profileSettingsPageSlice.reducer;
