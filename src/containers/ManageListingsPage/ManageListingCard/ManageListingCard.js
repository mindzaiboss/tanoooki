import React from 'react';
import { useHistory } from 'react-router-dom';
import classNames from 'classnames';

import { useRouteConfiguration } from '../../../context/routeConfigurationContext';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { formatMoney } from '../../../util/currency';
import { types as sdkTypes } from '../../../util/sdkLoader';
import {
  LISTING_PAGE_PARAM_TYPE_EDIT,
  createSlug,
} from '../../../util/urlHelpers';
import { createResourceLocatorString } from '../../../util/routes';

import {
  AspectRatioWrapper,
  NamedLink,
  ResponsiveImage,
} from '../../../components';

import css from './ManageListingCard.module.css';

const { Money } = sdkTypes;

const MAX_LENGTH_FOR_WORDS_IN_TITLE = 7;

const priceData = (price, intl) => {
  if (!price) return {};
  const moneyPrice = price instanceof Money ? price : new Money(price.amount, price.currency);
  const formattedPrice = formatMoney(intl, moneyPrice);
  return { formattedPrice, priceTitle: formattedPrice };
};

const createListingURL = (routes, listing) => {
  const id = listing.id.uuid;
  const slug = createSlug(listing.attributes.title);
  return createResourceLocatorString('ListingPage', routes, { id, slug }, {});
};

const formatTitle = (title, maxLength) => {
  const nonWhiteSpaceSequence = /([^\s]+)/gi;
  return title.split(nonWhiteSpaceSequence).map((word, index) =>
    word.length > maxLength ? (
      <span key={index} style={{ wordBreak: 'break-all' }}>
        {word}
      </span>
    ) : (
      word
    )
  );
};

export const ManageListingCard = props => {
  const routeConfiguration = useRouteConfiguration();
  const intl = props.intl || useIntl();
  const history = useHistory();
  const { className, rootClassName, listing, renderSizes } = props;

  const classes = classNames(rootClassName || css.root, className);
  const id = listing.id.uuid;
  const { title = '', price } = listing.attributes;
  const slug = createSlug(title);
  const firstImage = listing.images && listing.images.length > 0 ? listing.images[0] : null;
  const variants = firstImage
    ? Object.keys(firstImage.attributes.variants).filter(k => k.startsWith('listing-card'))
    : [];

  const { formattedPrice } = priceData(price, intl);

  return (
    <div className={classes}>
      <div
        className={css.clickWrapper}
        tabIndex={0}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          history.push(createListingURL(routeConfiguration, listing));
        }}
      >
        <AspectRatioWrapper width={1} height={1}>
          <ResponsiveImage
            rootClassName={css.rootForImage}
            alt={title}
            image={firstImage}
            variants={variants}
            sizes={renderSizes}
          />
        </AspectRatioWrapper>
      </div>

      <div className={css.info}>
        {formattedPrice && (
          <div className={css.price}>
            <span className={css.priceValue}>{formattedPrice}</span>
          </div>
        )}

        <div className={css.mainInfo}>
          <div className={css.titleWrapper}>
            <span className={css.title}>
              {formatTitle(title, MAX_LENGTH_FOR_WORDS_IN_TITLE)}
            </span>
          </div>
        </div>

        <div className={css.manageLinks}>
          <NamedLink
            className={css.manageLink}
            name="EditListingPage"
            params={{ id, slug, type: LISTING_PAGE_PARAM_TYPE_EDIT, tab: 'details' }}
          >
            <FormattedMessage id="ManageListingCard.editListing" />
          </NamedLink>
        </div>
      </div>
    </div>
  );
};

export default ManageListingCard;
