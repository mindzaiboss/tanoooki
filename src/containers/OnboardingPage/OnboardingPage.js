import React, { useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { connect } from 'react-redux';
import { FormattedMessage } from '../../util/reactIntl';
import { saveShippingAddress } from '../../util/api';
import { fetchCurrentUser } from '../../ducks/user.duck';
import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import ShippingAddressForm from './ShippingAddressForm/ShippingAddressForm';

import css from './OnboardingPage.module.css';

const OnboardingPageComponent = props => {
  const history = useHistory();
  const location = useLocation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const { currentUser, onFetchCurrentUser } = props;

  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo');

  if (!currentUser || !currentUser.id) {
    history.push('/login');
    return null;
  }

  const handleSkip = () => {
    sessionStorage.setItem('onboarding_skipped', 'true');
    history.push(returnTo || '/');
  };

  const handleSubmit = async addressData => {
    setSaving(true);
    setError(null);

    try {
      // addressData comes from ShippingAddressForm with deliveryAddress and shippingAddress
      await saveShippingAddress({
        userId: currentUser.id.uuid,
        ...addressData,
      });

      // Set flag to prevent OnboardingGuard redirect
      sessionStorage.setItem('onboarding_completed', 'true');

      // Refresh currentUser
      if (onFetchCurrentUser) {
        await onFetchCurrentUser({ enforce: true });
      }

      // Redirect to return path or homepage
      history.push(returnTo || '/');
    } catch (e) {
      console.error('Failed to save addresses:', e);
      setError('Failed to save addresses. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Page title="Complete Your Profile" scrollingDisabled={false}>
      <LayoutSingleColumn
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.content}>
          <h1 className={css.title}>
            <FormattedMessage id="OnboardingPage.title" />
          </h1>
          <p className={css.description}>
            <FormattedMessage id="OnboardingPage.description" />
          </p>

          {error && <div className={css.error}>{error}</div>}

          <ShippingAddressForm onSubmit={handleSubmit} inProgress={saving} />

          <div className={css.skipLink}>
            <button type="button" onClick={handleSkip} className={css.skipButton}>
              <FormattedMessage id="OnboardingPage.skipForNow" />
            </button>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  currentUser: state.user.currentUser,
});

const mapDispatchToProps = dispatch => ({
  onFetchCurrentUser: params => dispatch(fetchCurrentUser(params)),
});

const OnboardingPage = connect(mapStateToProps, mapDispatchToProps)(OnboardingPageComponent);

export default OnboardingPage;
