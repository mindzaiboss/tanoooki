import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useParams } from 'react-router-dom';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { resetWizard } from '../EditListingPage/EditListingPage.duck';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ListingCreatedPage.module.css';

const ListingCreatedPage = () => {
  const scrollingDisabled = useSelector(isScrollingDisabled);
  const dispatch = useDispatch();
  const location = useLocation();
  const { productId } = useParams();

  // Reset wizard state on mount so the next "New Listing" starts fresh
  useEffect(() => {
    dispatch(resetWizard());
  }, [dispatch]);

  const { title, price, imageUrl, handle } = location.state || {};
  const formattedPrice = price ? `$${(parseFloat(price) / 100).toFixed(2)}` : null;

  // Edit URL: /l/:slug/:id/edit/details
  const editSlug = handle || 'listing';
  const editId = productId;

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
              {editId ? (
                <NamedLink
                  name="EditListingPage"
                  params={{ slug: editSlug, id: editId, type: 'edit', tab: 'details' }}
                  className={css.secondaryButton}
                >
                  Edit Listing
                </NamedLink>
              ) : null}
            </div>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default ListingCreatedPage;
