import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Form as FinalForm, FormSpy } from 'react-final-form';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { propTypes } from '../../../util/types';
import { numberAtLeast, required } from '../../../util/validators';
import { PURCHASE_PROCESS_NAME } from '../../../transactions/transaction';

import {
  Form,
  FieldSelect,
  FieldTextInput,
  InlineTextButton,
  PrimaryButton,
  H3,
  H6,
} from '../../../components';

import EstimatedCustomerBreakdownMaybe from '../EstimatedCustomerBreakdownMaybe';

import FetchLineItemsError from '../FetchLineItemsError/FetchLineItemsError.js';

import css from './ProductOrderForm.module.css';

// Browsers can't render huge number of select options.
// (stock is shown inside select element)
// Note: input element could allow ordering bigger quantities
const MAX_QUANTITY_FOR_DROPDOWN = 100;

const handleFetchLineItems = ({
  quantity,
  deliveryMethod,
  displayDeliveryMethod,
  listingId,
  isOwnListing,
  fetchLineItemsInProgress,
  onFetchTransactionLineItems,
  shippingAmount,
}) => {
  const stockReservationQuantity = Number.parseInt(quantity, 10);
  const deliveryMethodMaybe = deliveryMethod ? { deliveryMethod } : {};
  const shippingAmountMaybe = shippingAmount ? { shippingAmount } : {};
  const isBrowser = typeof window !== 'undefined';
  if (
    isBrowser &&
    stockReservationQuantity &&
    (!displayDeliveryMethod || deliveryMethod) &&
    !fetchLineItemsInProgress
  ) {
    onFetchTransactionLineItems({
      orderData: { stockReservationQuantity, ...deliveryMethodMaybe, ...shippingAmountMaybe },
      listingId,
      isOwnListing,
    });
  }
};

const DeliveryMethodMaybe = props => {
  const {
    displayDeliveryMethod,
    hasMultipleDeliveryMethods,
    deliveryMethod,
    hasStock,
    formId,
    intl,
  } = props;
  const showDeliveryMethodSelector = displayDeliveryMethod && hasMultipleDeliveryMethods;
  const showSingleDeliveryMethod = displayDeliveryMethod && deliveryMethod;
  return !hasStock ? null : showDeliveryMethodSelector ? (
    <FieldSelect
      id={`${formId}.deliveryMethod`}
      className={css.deliveryField}
      name="deliveryMethod"
      label={intl.formatMessage({ id: 'ProductOrderForm.deliveryMethodLabel' })}
      validate={required(intl.formatMessage({ id: 'ProductOrderForm.deliveryMethodRequired' }))}
    >
      <option disabled value="">
        {intl.formatMessage({ id: 'ProductOrderForm.selectDeliveryMethodOption' })}
      </option>
      <option value={'pickup'}>
        {intl.formatMessage({ id: 'ProductOrderForm.pickupOption' })}
      </option>
      <option value={'shipping'}>
        {intl.formatMessage({ id: 'ProductOrderForm.shippingOption' })}
      </option>
    </FieldSelect>
  ) : showSingleDeliveryMethod ? (
    <div className={css.deliveryField}>
      <H3 rootClassName={css.singleDeliveryMethodLabel}>
        {intl.formatMessage({ id: 'ProductOrderForm.deliveryMethodLabel' })}
      </H3>
      <p className={css.singleDeliveryMethodSelected}>
        {deliveryMethod === 'shipping'
          ? intl.formatMessage({ id: 'ProductOrderForm.shippingOption' })
          : intl.formatMessage({ id: 'ProductOrderForm.pickupOption' })}
      </p>
      <FieldTextInput
        id={`${formId}.deliveryMethod`}
        className={css.deliveryField}
        name="deliveryMethod"
        type="hidden"
      />
    </div>
  ) : (
    <FieldTextInput
      id={`${formId}.deliveryMethod`}
      className={css.deliveryField}
      name="deliveryMethod"
      type="hidden"
    />
  );
};

const roundToNearest9 = amount => {
  const cents = Math.ceil(amount * 100);
  const mod = cents % 10;
  if (mod === 9) return cents / 100;
  return (cents + (9 - mod)) / 100;
};

const applyMarkup = amount => {
  const markup = Math.max(amount * 0.05, 0.5);
  return roundToNearest9(amount + markup);
};

const ShippingRatesMaybe = ({ listing, formApi, deliveryMethod }) => {
  const [rateTiers, setRateTiers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [usingGeo, setUsingGeo] = useState(false);
  const [selectedTier, setSelectedTier] = useState('economy');

  const currentUser = useSelector(state => state.user.currentUser);

  const publicData = listing?.attributes?.publicData || {};
  console.log('listing publicData:', publicData);
  const {
    pub_packageWeight,
    pub_packageWeightUnit = 'lb',
    pub_packageLength,
    pub_packageWidth,
    pub_packageHeight,
    pub_packageDistanceUnit = 'in',
    pub_shipFrom,
  } = publicData;

  const hasPackageData =
    pub_packageWeight && pub_packageLength && pub_packageWidth && pub_packageHeight;
  const isShipping = deliveryMethod === 'shipping';
  const userId = currentUser?.id?.uuid;

  useEffect(() => {
    if (!isShipping || !hasPackageData) return;

    const sellerAddress = pub_shipFrom || {
      name: 'Seller',
      street1: '215 Clayton St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94117',
      country: 'US',
    };

    const fetchRates = async addressTo => {
      setLoading(true);
      setFailed(false);
      try {
        const payload = {
          addressFrom: sellerAddress,
          addressTo,
          parcel: {
            weight: pub_packageWeight,
            mass_unit: pub_packageWeightUnit,
            length: pub_packageLength,
            width: pub_packageWidth,
            height: pub_packageHeight,
            distance_unit: pub_packageDistanceUnit,
          },
        };
        console.log('ShippingRatesMaybe payload:', JSON.stringify(payload, null, 2));
        const res = await fetch('/api/shippo-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.rates && data.rates.length > 0) {
          const byPrice = [...data.rates].sort(
            (a, b) => parseFloat(a.amount) - parseFloat(b.amount)
          );
          const bySpeed = [...data.rates].sort(
            (a, b) => (a.estimatedDays || 999) - (b.estimatedDays || 999)
          );
          const economy = byPrice[0];
          const express = bySpeed[0];
          const standard = byPrice[Math.floor(byPrice.length / 2)];
          setRateTiers({ economy, standard, express });
          setSelectedTier('economy');
          formApi.change('shippingRate', {
            tier: 'economy',
            ...economy,
            displayAmount: applyMarkup(parseFloat(economy.amount)),
          });
        } else {
          setFailed(true);
        }
      } catch (e) {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    };

    const privateData = currentUser?.attributes?.profile?.privateData || {};
    const { streetAddress, city, stateProvince, postalCode, country } = privateData;
    const hasAddress = streetAddress && city && postalCode;

    if (hasAddress) {
      setUsingGeo(false);
      fetchRates({
        name: 'Buyer',
        street1: streetAddress,
        city,
        state: stateProvince || '',
        zip: postalCode,
        country: country || 'US',
      });
    } else {
      fetch('/api/geolocate')
        .then(r => r.json())
        .then(geoData => {
          const { countryCode, region, city } = geoData;
          const country = countryCode || 'US';
          const noLocation = !city && !region;

          // Fallbacks for localhost/dev where IP geolocation returns null
          const COUNTRY_FALLBACKS = {
            US: { city: 'Chicago', state: 'IL', zip: '60601' },
            CA: { city: 'Toronto', state: 'ON', zip: 'M5V 3A8' },
            GB: { city: 'London', state: '', zip: '' },
            AU: { city: 'Sydney', state: 'NSW', zip: '' },
            DE: { city: 'Berlin', state: '', zip: '' },
            FR: { city: 'Paris', state: '', zip: '' },
            JP: { city: 'Tokyo', state: '', zip: '' },
            CN: { city: 'Beijing', state: '', zip: '' },
            KR: { city: 'Seoul', state: '', zip: '' },
            MX: { city: 'Mexico City', state: '', zip: '' },
            BR: { city: 'Brasilia', state: '', zip: '' },
            IN: { city: 'New Delhi', state: '', zip: '' },
            SG: { city: 'Singapore', state: '', zip: '' },
            HK: { city: 'Hong Kong', state: '', zip: '' },
            NL: { city: 'Amsterdam', state: '', zip: '' },
            IT: { city: 'Rome', state: '', zip: '' },
            ES: { city: 'Madrid', state: '', zip: '' },
          };

          const fallback = noLocation
            ? COUNTRY_FALLBACKS[country] || { city: '', state: '', zip: '' }
            : null;

          setUsingGeo(true);
          fetchRates({
            name: 'Buyer',
            street1: '',
            city: fallback ? fallback.city : city,
            state: fallback ? fallback.state : region || '',
            zip: fallback ? fallback.zip : '',
            country,
          });
        })
        .catch(() => setFailed(true));
    }
  }, [isShipping, userId]);

  if (!isShipping || !hasPackageData) return null;

  if (loading) {
    return (
      <div className={css.shippingRates}>
        <p className={css.shippingRatesLoading}>Calculating shipping...</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={css.shippingRates}>
        <p className={css.shippingRatesUnavailable}>Shipping unavailable</p>
      </div>
    );
  }

  if (!rateTiers) return null;

  const tiers = [
    { key: 'economy', label: 'Economy', rate: rateTiers.economy },
    { key: 'standard', label: 'Standard', rate: rateTiers.standard },
    { key: 'express', label: 'Express', rate: rateTiers.express },
  ];

  const handleTierChange = e => {
    const tier = e.target.value;
    setSelectedTier(tier);
    const rate = rateTiers[tier];
    formApi.change('shippingRate', {
      tier,
      ...rate,
      displayAmount: applyMarkup(parseFloat(rate.amount)),
    });
  };

  return (
    <div className={css.shippingRates}>
      <label className={css.shippingRatesLabel}>Shipping</label>
      <select className={css.shippingRatesSelect} value={selectedTier} onChange={handleTierChange}>
        {tiers.map(({ key, label, rate }) => {
          const price = applyMarkup(parseFloat(rate.amount));
          const days = rate.estimatedDays ? ` (${rate.estimatedDays} days)` : '';
          return (
            <option key={key} value={key}>
              {label}
              {days} — ${price.toFixed(2)} {rate.currency}
            </option>
          );
        })}
      </select>
      {usingGeo ? (
        <p className={css.shippingRatesDisclaimer}>
          Estimated shipping based on your location. Sign up or add your address for exact rates.
        </p>
      ) : null}
    </div>
  );
};

const renderForm = formRenderProps => {
  const [mounted, setMounted] = useState(false);
  const {
    // FormRenderProps from final-form
    handleSubmit,
    form: formApi,

    // Custom props passed to the form component
    intl,
    formId,
    currentStock,
    allowOrdersOfMultipleItems,
    hasMultipleDeliveryMethods,
    displayDeliveryMethod,
    listingId,
    isOwnListing,
    onFetchTransactionLineItems,
    onContactUser,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    price,
    payoutDetailsWarning,
    marketplaceName,
    listing,
    values,
  } = formRenderProps;

  // Note: don't add custom logic before useEffect
  useEffect(() => {
    setMounted(true);

    // Side-effect: fetch line-items after mounting if possible
    const { quantity, deliveryMethod } = values;
    if (quantity && !formRenderProps.hasMultipleDeliveryMethods) {
      handleFetchLineItems({
        quantity,
        deliveryMethod,
        displayDeliveryMethod,
        listingId,
        isOwnListing,
        fetchLineItemsInProgress,
        onFetchTransactionLineItems,
      });
    }
  }, []);

  // If form values change, update line-items for the order breakdown
  const handleOnChange = formValues => {
    const { quantity, deliveryMethod, shippingRate } = formValues.values;
    const shippingAmount = shippingRate?.displayAmount
      ? Math.round(shippingRate.displayAmount * 100)
      : undefined;
    if (mounted) {
      handleFetchLineItems({
        quantity,
        deliveryMethod,
        listingId,
        isOwnListing,
        fetchLineItemsInProgress,
        onFetchTransactionLineItems,
        shippingAmount,
      });
    }
  };

  // In case quantity and deliveryMethod are missing focus on that select-input.
  // Otherwise continue with the default handleSubmit function.
  const handleFormSubmit = e => {
    const { quantity, deliveryMethod } = values || {};
    if (!quantity || quantity < 1) {
      e.preventDefault();
      // Blur event will show validator message
      formApi.blur('quantity');
      formApi.focus('quantity');
    } else if (displayDeliveryMethod && !deliveryMethod) {
      e.preventDefault();
      // Blur event will show validator message
      formApi.blur('deliveryMethod');
      formApi.focus('deliveryMethod');
    } else {
      handleSubmit(e);
    }
  };

  const breakdownData = {};
  const showBreakdown =
    breakdownData && lineItems && !fetchLineItemsInProgress && !fetchLineItemsError;

  const showContactUser = typeof onContactUser === 'function';

  const onClickContactUser = e => {
    e.preventDefault();
    onContactUser();
  };

  const contactSellerLink = (
    <InlineTextButton onClick={onClickContactUser}>
      <FormattedMessage id="ProductOrderForm.finePrintNoStockLinkText" />
    </InlineTextButton>
  );
  const quantityRequiredMsg = intl.formatMessage({ id: 'ProductOrderForm.quantityRequired' });

  // Listing is out of stock if currentStock is zero.
  // Undefined/null stock means that stock has never been set.
  const hasNoStockLeft = typeof currentStock != null && currentStock === 0;
  const hasStock = currentStock && currentStock > 0;
  const hasOneItemLeft = currentStock === 1;
  const selectableStock =
    currentStock > MAX_QUANTITY_FOR_DROPDOWN ? MAX_QUANTITY_FOR_DROPDOWN : currentStock;
  const quantities = hasStock ? [...Array(selectableStock).keys()].map(i => i + 1) : [];

  const submitInProgress = fetchLineItemsInProgress;
  const submitDisabled = !hasStock;

  return (
    <Form onSubmit={handleFormSubmit}>
      <FormSpy subscription={{ values: true }} onChange={handleOnChange} />

      {hasNoStockLeft ? null : hasOneItemLeft || !allowOrdersOfMultipleItems ? (
        <FieldTextInput
          id={`${formId}.quantity`}
          className={css.quantityField}
          name="quantity"
          type="hidden"
          validate={numberAtLeast(quantityRequiredMsg, 1)}
        />
      ) : (
        <FieldSelect
          id={`${formId}.quantity`}
          className={css.quantityField}
          name="quantity"
          disabled={!hasStock}
          label={intl.formatMessage({ id: 'ProductOrderForm.quantityLabel' })}
          validate={numberAtLeast(quantityRequiredMsg, 1)}
        >
          <option disabled value="">
            {intl.formatMessage({ id: 'ProductOrderForm.selectQuantityOption' })}
          </option>
          {quantities.map(quantity => (
            <option key={quantity} value={quantity}>
              {intl.formatMessage({ id: 'ProductOrderForm.quantityOption' }, { quantity })}
            </option>
          ))}
        </FieldSelect>
      )}

      <DeliveryMethodMaybe
        displayDeliveryMethod={displayDeliveryMethod}
        hasMultipleDeliveryMethods={hasMultipleDeliveryMethods}
        deliveryMethod={values?.deliveryMethod}
        hasStock={hasStock}
        formId={formId}
        intl={intl}
      />

      <ShippingRatesMaybe
        listing={listing}
        formApi={formApi}
        deliveryMethod={values?.deliveryMethod}
      />

      {showBreakdown ? (
        <div className={css.breakdownWrapper}>
          <H6 as="h3" className={css.bookingBreakdownTitle}>
            <FormattedMessage id="ProductOrderForm.breakdownTitle" />
          </H6>
          <hr className={css.totalDivider} />
          <EstimatedCustomerBreakdownMaybe
            breakdownData={breakdownData}
            lineItems={lineItems}
            currency={price.currency}
            marketplaceName={marketplaceName}
            processName={PURCHASE_PROCESS_NAME}
          />
        </div>
      ) : null}

      <FetchLineItemsError error={fetchLineItemsError} />

      <div className={css.submitButton}>
        <PrimaryButton type="submit" inProgress={submitInProgress} disabled={submitDisabled}>
          {hasStock ? (
            <FormattedMessage id="ProductOrderForm.ctaButton" />
          ) : (
            <FormattedMessage id="ProductOrderForm.ctaButtonNoStock" />
          )}
        </PrimaryButton>
      </div>
      <p className={css.finePrint}>
        {payoutDetailsWarning ? (
          payoutDetailsWarning
        ) : hasStock && isOwnListing ? (
          <FormattedMessage id="ProductOrderForm.ownListing" />
        ) : hasStock ? (
          <FormattedMessage id="ProductOrderForm.finePrint" />
        ) : showContactUser ? (
          <FormattedMessage id="ProductOrderForm.finePrintNoStock" values={{ contactSellerLink }} />
        ) : null}
      </p>
    </Form>
  );
};

/**
 * A form for ordering a product.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} props.marketplaceName - The name of the marketplace
 * @param {string} props.formId - The ID of the form
 * @param {Function} props.onSubmit - The function to handle the form submission
 * @param {propTypes.uuid} props.listingId - The ID of the listing
 * @param {propTypes.money} props.price - The price of the listing
 * @param {number} props.currentStock - The current stock of the listing
 * @param {boolean} props.isOwnListing - Whether the listing is owned by the current user
 * @param {boolean} props.pickupEnabled - Whether pickup is enabled
 * @param {boolean} props.shippingEnabled - Whether shipping is enabled
 * @param {boolean} props.displayDeliveryMethod - Whether the delivery method is displayed
 * @param {Object} props.lineItems - The line items
 * @param {Function} props.onFetchTransactionLineItems - The function to fetch the transaction line items
 * @param {boolean} props.fetchLineItemsInProgress - Whether the line items are being fetched
 * @param {propTypes.error} props.fetchLineItemsError - The error for fetching the line items
 * @param {Function} props.onContactUser - The function to contact the user
 * @returns {JSX.Element}
 */
const ProductOrderForm = props => {
  const intl = useIntl();
  const {
    price,
    currentStock,
    pickupEnabled,
    shippingEnabled,
    displayDeliveryMethod,
    allowOrdersOfMultipleItems,
  } = props;

  // Should not happen for listings that go through EditListingWizard.
  // However, this might happen for imported listings.
  if (displayDeliveryMethod && !pickupEnabled && !shippingEnabled) {
    return (
      <p className={css.error}>
        <FormattedMessage id="ProductOrderForm.noDeliveryMethodSet" />
      </p>
    );
  }

  const hasOneItemLeft = currentStock && currentStock === 1;
  const hasOneItemMode = !allowOrdersOfMultipleItems && currentStock > 0;
  const quantityMaybe = hasOneItemLeft || hasOneItemMode ? { quantity: '1' } : {};
  const deliveryMethodMaybe =
    shippingEnabled && !pickupEnabled
      ? { deliveryMethod: 'shipping' }
      : !shippingEnabled && pickupEnabled
      ? { deliveryMethod: 'pickup' }
      : !shippingEnabled && !pickupEnabled
      ? { deliveryMethod: 'none' }
      : {};
  const hasMultipleDeliveryMethods = pickupEnabled && shippingEnabled;
  const initialValues = { ...quantityMaybe, ...deliveryMethodMaybe };

  return (
    <FinalForm
      initialValues={initialValues}
      hasMultipleDeliveryMethods={hasMultipleDeliveryMethods}
      displayDeliveryMethod={displayDeliveryMethod}
      {...props}
      intl={intl}
      render={renderForm}
    />
  );
};

export default ProductOrderForm;
