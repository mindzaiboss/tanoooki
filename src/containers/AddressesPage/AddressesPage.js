import React from 'react';
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

  const handleSubmit = values => {
    const profile = {
      privateData: {
        ...pickUserFieldsData(values, 'private', userType, addressFields),
      },
    };
    onUpdateProfile(profile);
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
            <PrivateDetailsForm
              className={css.form}
              currentUser={currentUser}
              initialValues={{
                ...initialValuesForUserFields(privateData, 'private', userType, addressFields),
              }}
              updateProfileError={updateProfileError}
              updateInProgress={updateProfileInProgress}
              onSubmit={handleSubmit}
              marketplaceName={config.marketplaceName}
              userFields={addressFields}
              userTypeConfig={userTypeConfig}
              intl={intl}
            />
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
