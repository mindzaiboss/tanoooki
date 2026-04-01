import React from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ListingCreatedPage.module.css';

const ListingCreatedPage = () => {
  const scrollingDisabled = useSelector(isScrollingDisabled);
  const location = useLocation();

  const { title, price, imageUrl } = location.state || {};
  const formattedPrice = price ? `$${(parseFloat(price) / 100).toFixed(2)}` : null;

  return (
    <Page title="Listing Created" scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <div className={css.card}>
            {imageUrl ? (
              <div className={css.imageWrapper}>
                <img src={imageUrl} alt={title || 'Product'} className={css.image} />
              </div>
            ) : (
              <div className={css.imagePlaceholder}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="48" height="48" rx="8" fill="#f0f0f0" />
                  <path d="M14 34l8-10 6 7 4-5 8 8H14z" fill="#ccc" />
                  <circle cx="18" cy="20" r="3" fill="#ccc" />
                </svg>
              </div>
            )}

            <div className={css.successBadge}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="10" fill="#2ECC71" />
                <path d="M6 10l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Listed successfully</span>
            </div>

            {title && <h1 className={css.title}>{title}</h1>}
            {formattedPrice && <p className={css.price}>{formattedPrice}</p>}

            <div className={css.actions}>
              <NamedLink name="NewListingPage" className={css.primaryButton}>
                Create Another Listing
              </NamedLink>
              <NamedLink name="NewListingPage" className={css.secondaryButton}>
                Edit Listing
              </NamedLink>
            </div>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default ListingCreatedPage;
