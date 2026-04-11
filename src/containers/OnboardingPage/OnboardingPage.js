import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { connect } from 'react-redux';
import { FormattedMessage } from '../../util/reactIntl';
import { saveShippingAddress } from '../../util/api';
import { fetchCurrentUser } from '../../ducks/user.duck';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import ShippingAddressForm from './ShippingAddressForm/ShippingAddressForm';

import css from './OnboardingPage.module.css';

const OnboardingPageComponent = props => {
  const history = useHistory();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const { currentUser, onFetchCurrentUser } = props;

  if (!currentUser || !currentUser.id) {
    history.push('/login');
    return null;
  }

  const handleSubmit = async values => {
    setSaving(true);
    setError(null);

    try {
      await saveShippingAddress({
        userId: currentUser.id.uuid,
        shippingAddress: {
          street: values.street,
          city: values.city,
          state: values.state,
          zip: values.zip,
          country: values.country || 'US',
        },
      });

      // Set flag to prevent OnboardingGuard redirect
      console.log('🏁 Setting onboarding_completed flag');
      sessionStorage.setItem('onboarding_completed', 'true');

      // Refresh currentUser
      if (onFetchCurrentUser) {
        await onFetchCurrentUser({ enforce: true });
      }

      // Redirect to homepage
      history.push('/');
    } catch (e) {
      console.error('Failed to save shipping address:', e);
      setError('Failed to save shipping address. Please try again.');
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
            <NamedLink name="LandingPage">
              <FormattedMessage id="OnboardingPage.skipForNow" />
            </NamedLink>
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
