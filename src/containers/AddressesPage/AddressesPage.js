import React, { useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { useConfiguration } from '../../context/configurationContext';

import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { ensureCurrentUser } from '../../util/data';
import {
  showCreateListingLinkForUser,
  showPaymentDetailsForUser,
  initialValuesForUserFields,
  pickUserFieldsData,
} from '../../util/userHelpers';

import { isScrollingDisabled } from '../../ducks/ui.duck';

import { H3, Page, UserNav, LayoutSideNavigation } from '../../components';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import PrivateDetailsForm from '../ManageAccountPage/PrivateDetailsForm/PrivateDetailsForm';

import { updateProfile } from './AddressesPage.duck';
import css from './AddressesPage.module.css';

/**
 * @param {Object} props
 * @param {propTypes.currentUser} [props.currentUser] - The current user
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @param {boolean} [props.updateProfileInProgress] - Whether the update is in progress
 * @param {propTypes.error} [props.updateProfileError] - The update profile error
 * @param {Function} props.onUpdateProfile - The update profile function
 * @returns {JSX.Element}
 */
export const AddressesPageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const {
    currentUser,
    scrollingDisabled,
    onUpdateProfile,
    updateProfileInProgress = false,
    updateProfileError,
  } = props;

  const user = ensureCurrentUser(currentUser);
  const { publicData, protectedData, privateData } = user?.attributes.profile;
  const { userType } = publicData || {};

  const { userFields, userTypes = [] } = config.user;
  const addressFieldKeys = ['country', 'streetAddress', 'streetAddress2', 'city', 'stateProvince', 'postalCode'];
  const addressFields = userFields.filter(uf => addressFieldKeys.includes(uf.key));
  const userTypeConfig = userTypes.find(c => c.userType === userType);

  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [pendingValues, setPendingValues] = useState(null);

  // Internal save: transforms form values → profile shape → onUpdateProfile
  const onSubmit = values => {
    const profile = {
      privateData: {
        ...pickUserFieldsData(values, 'private', userType, addressFields),
      },
    };
    onUpdateProfile(profile);
  };

  const handleSubmit = async (values) => {
    setValidationResult(null);
    setPendingValues(null);
    setValidating(true);

    try {
      console.log('Validation payload values:', values);
      const res = await fetch('/api/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          street1: (values.priv_streetAddress || '').trim(),
          street2: (values.priv_streetAddress2 || '').trim(),
          city: (values.priv_city || '').trim(),
          state: (values.priv_stateProvince || '').trim(),
          zip: (values.priv_postalCode || '').trim(),
          country: (values.priv_country || '').trim(),
        }),
      });
      const data = await res.json();

      // Guard: if server returned an error, show generic invalid state
      if (!res.ok || data.error) {
        setPendingValues(values);
        setValidationResult({ isValid: false, hasSuggestion: false, messages: [{ text: data.error || 'Address validation failed. Please check your address and try again.' }] });
        setValidating(false);
        return;
      }

      if (data.hasSuggestion) {
        setPendingValues(values);
        setValidationResult(data);
        setValidating(false);
        return;
      }

      if (!data.isValid && !data.hasSuggestion) {
        setPendingValues(values);
        setValidationResult({ ...data, isWarningOnly: true });
        setValidating(false);
        return;
      }

      setValidating(false);
      onSubmit({
        ...values,
        priv_streetAddress: (values.priv_streetAddress || '').trim(),
        priv_streetAddress2: (values.priv_streetAddress2 || '').trim(),
        priv_city: (values.priv_city || '').trim(),
        priv_stateProvince: (values.priv_stateProvince || '').trim(),
        priv_postalCode: (values.priv_postalCode || '').trim(),
      });

    } catch (e) {
      // If validation API fails, allow save anyway
      setValidating(false);
      onSubmit(values);
    }
  };

  const handleAcceptSuggestion = () => {
    const s = validationResult.suggested;
    onSubmit({
      ...pendingValues,
      priv_streetAddress: s.street1,
      priv_streetAddress2: s.street2,
      priv_city: s.city,
      priv_stateProvince: s.state,
      priv_postalCode: s.zip,
    });
    setValidationResult(null);
    setPendingValues(null);
  };

  const handleKeepOriginal = () => {
    onSubmit(pendingValues);
    setValidationResult(null);
    setPendingValues(null);
  };

  const title = intl.formatMessage({ id: 'AddressesPage.title' });

  const showManageListingsLink = showCreateListingLinkForUser(config, currentUser);
  const { showPayoutDetails, showPaymentMethods } = showPaymentDetailsForUser(config, currentUser);
  const accountSettingsNavProps = {
    currentPage: 'AddressesPage',
    showPaymentMethods,
    showPayoutDetails,
  };

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSideNavigation
        topbar={
          <>
            <TopbarContainer
              desktopClassName={css.desktopTopbar}
              mobileClassName={css.mobileTopbar}
            />
            <UserNav
              currentPage="AddressesPage"
              showManageListingsLink={showManageListingsLink}
            />
          </>
        }
        sideNav={null}
        useAccountSettingsNav
        accountSettingsNavProps={accountSettingsNavProps}
        footer={<FooterContainer />}
        intl={intl}
      >
        <div className={css.content}>
          <H3 as="h1">
            <FormattedMessage id="AddressesPage.heading" />
          </H3>
          <p className={css.subtitle}>
            <FormattedMessage id="AddressesPage.subtitle" />
          </p>
          {user.id ? (
            <>
              {validating && (
                <p className={css.validating}>Validating address...</p>
              )}

              {validationResult && !validationResult.isValid && !validationResult.hasSuggestion && (
                <div className={css.validationError}>
                  <p>⚠️ We couldn't verify this address:</p>
                  <ul>
                    {(validationResult.messages || []).map((m, i) => (
                      <li key={i}>{m.text}</li>
                    ))}
                  </ul>
                  <div className={css.validationErrorActions}>
                    <button
                      type="button"
                      className={css.saveAnywayButton}
                      onClick={() => {
                        onSubmit(pendingValues);
                        setValidationResult(null);
                        setPendingValues(null);
                      }}
                    >
                      Save anyway
                    </button>
                    <span className={css.saveAnywayHint}>or correct your address above and save again</span>
                  </div>
                </div>
              )}

              {validationResult && validationResult.hasSuggestion && (
                <div className={css.validationSuggestion}>
                  <p>📬 Please double check your address. There might be an error. Here is a suggested correction for you to review:</p>
                  <div className={css.suggestedAddress}>
                    <strong>Suggested:</strong><br />
                    {validationResult.suggested.street1}
                    {validationResult.suggested.street2 ? `, ${validationResult.suggested.street2}` : ''}<br />
                    {validationResult.suggested.city}, {validationResult.suggested.state} {validationResult.suggested.zip}<br />
                    {validationResult.suggested.country}
                  </div>
                  <div className={css.suggestionActions}>
                    <button
                      type="button"
                      className={css.acceptButton}
                      onClick={handleAcceptSuggestion}
                    >
                      Use suggested address
                    </button>
                    <button
                      type="button"
                      className={css.keepButton}
                      onClick={handleKeepOriginal}
                    >
                      Keep my address
                    </button>
                  </div>
                </div>
              )}

              <PrivateDetailsForm
                className={css.form}
                currentUser={currentUser}
                initialValues={{
                  ...initialValuesForUserFields(privateData, 'private', userType, addressFields),
                }}
                updateProfileError={updateProfileError}
                updateInProgress={updateProfileInProgress || validating}
                onSubmit={handleSubmit}
                marketplaceName={config.marketplaceName}
                userFields={addressFields}
                userTypeConfig={userTypeConfig}
                intl={intl}
              />
            </>
          ) : null}
        </div>
      </LayoutSideNavigation>
    </Page>
  );
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const { updateProfileInProgress, updateProfileError } = state.AddressesPage;
  return {
    currentUser,
    scrollingDisabled: isScrollingDisabled(state),
    updateProfileInProgress,
    updateProfileError,
  };
};

const mapDispatchToProps = dispatch => ({
  onUpdateProfile: values => dispatch(updateProfile(values)),
});

const AddressesPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(AddressesPageComponent);

export default AddressesPage;
