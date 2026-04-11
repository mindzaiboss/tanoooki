import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';

const EXCLUDED_PATHS = ['/onboarding', '/login', '/signup', '/confirm'];

const OnboardingGuard = ({ children }) => {
  const history = useHistory();
  const location = useLocation();
  const currentUser = useSelector(state => state.user.currentUser);
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && currentUser?.id) {
      const hasShippingAddress = currentUser?.attributes?.profile?.delivery_address;
      const isExcluded = EXCLUDED_PATHS.some(p => location.pathname.startsWith(p));

      const justCompletedOnboarding = sessionStorage.getItem('onboarding_completed') === 'true';
      const hasSkipped = sessionStorage.getItem('onboarding_skipped') === 'true';

      if (justCompletedOnboarding) {
        sessionStorage.removeItem('onboarding_completed');
        return;
      }

      if (hasSkipped) {
        return;
      }

      if (!hasShippingAddress && !isExcluded) {
        history.push('/onboarding');
      }
    }
  }, [isAuthenticated, currentUser, location.pathname, history]);

  return children;
};

export default OnboardingGuard;
