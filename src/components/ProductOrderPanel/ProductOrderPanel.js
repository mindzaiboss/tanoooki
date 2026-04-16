import React, { useState, useEffect } from 'react';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { PrimaryButton } from '../../components';
import config from '../../config/configDefault';

import { types as sdkTypes } from '../../util/sdkLoader';

import css from './ProductOrderPanel.module.css';

const abbreviateCarrier = (carrier) => {
  const abbreviations = {
    'Canada Post': 'CP',
    'UPS': 'UPS',
    'DHL Express': 'DHL',
    'USPS': 'USPS',
  };
  return abbreviations[carrier] || carrier;
};

const formatShippingOption = (rate) => {
  const carrier = abbreviateCarrier(rate.provider);
  let service = rate.servicelevel.name;

  // Abbreviate service names for readability
  if (rate.provider === 'USPS') {
    service = service
      .replace('Priority Mail International', 'Priority Intl.')
      .replace('Priority Mail Express International', 'Priority Express Intl.');
  }

  const days = rate.estimatedDays;
  const price = rate.amount;
  const currency = rate.currency;

  const daysText = typeof days === 'number' ? `${days} ${days === 1 ? 'day' : 'days'}` : `${days} days`;
  return `${carrier} ${service} (${daysText}) - $${price}`;
};

const ProductOrderPanel = props => {
  const {
    className,
    listing,
    onSubmit,
    title,
    subTitle,
    authorDisplayName,
    isOwnListing,
    currentUser,
  } = props;

  const intl = useIntl();
  const [quantity, setQuantity] = useState(1);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [shippingRates, setShippingRates] = useState([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState(null);

  // Get data from listing
  const price = listing?.attributes?.price;
  const publicData = listing?.attributes?.publicData || {};
  const currentStock = listing.currentStock?.attributes?.quantity || 0;

  // Get vendor username from publicData
  const vendorUsername = publicData.vendor_username;

  // Get package dimensions from publicData
  const packageDimensions = {
    weight: publicData.packageWeight || publicData.weight || 1,
    weightUnit: publicData.packageWeightUnit || publicData.weightUnit || 'lb',
    length: publicData.length || 6,
    width: publicData.width || 6,
    height: publicData.height || 6,
    distanceUnit: publicData.distanceUnit || 'in',
  };

  // Fetch shipping rates when quantity changes or on mount
  useEffect(() => {
    const fetchShippingRates = async () => {
      setLoadingRates(true);
      setRatesError(null);

      if (!vendorUsername) {
        console.log('No vendor username available');
        setRatesError('Seller information not available');
        setLoadingRates(false);
        return;
      }

      try {
        const response = await fetch('/api/shippo-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorUsername,
            buyerId: currentUser?.id?.uuid || null,
            weight: packageDimensions.weight,
            weightUnit: packageDimensions.weightUnit,
            length: packageDimensions.length,
            width: packageDimensions.width,
            height: packageDimensions.height,
            distanceUnit: packageDimensions.distanceUnit,
            ...(publicData.origin_country ? { originCountry: publicData.origin_country } : {}),
            productPrice: price?.amount ? (price.amount / 100).toFixed(2) : undefined,
            productTitle: listing?.attributes?.title,
          }),
        });

        const data = await response.json();

        if (data.success && data.rates) {
          setShippingRates(data.rates);
          if (data.rates.length > 0) {
            const cheapest = data.rates.reduce((min, rate) =>
              parseFloat(rate.amount) < parseFloat(min.amount) ? rate : min
            );
            setSelectedShipping(cheapest);
          }
        } else {
          setRatesError('Failed to load shipping rates');
        }
      } catch (error) {
        console.error('Error fetching shipping rates:', error);
        setRatesError('Failed to load shipping rates');
      } finally {
        setLoadingRates(false);
      }
    };

    fetchShippingRates();
  }, [vendorUsername, currentUser]);

  // Calculate prices
  const unitPrice = price ? price.amount : 0;
  const subtotal = unitPrice * quantity;

  const shippingAmount = selectedShipping
    ? Math.round(parseFloat(selectedShipping.amount) * 100) // Convert to cents
    : 0;

  const ddpFeesAmount = selectedShipping?.ddpFees
    ? Math.round(parseFloat(selectedShipping.ddpFees) * 100) // Convert to cents
    : 0;

  const subtotalWithShipping = subtotal + shippingAmount + ddpFeesAmount;

  const commissionPercentage = config.marketplaceCommissionPercentage || 10;
  const commissionAmount = Math.round(subtotalWithShipping * (commissionPercentage / 100));

  // TODO: Implement proper tax calculation based on buyer's address
  const taxAmount = 0;

  const totalAmount = subtotalWithShipping + commissionAmount + taxAmount;

  // Format money helper
  const formatPrice = (amount) => {
    if (!price) return null;
    // Use SDK Money constructor
    const moneyObject = new sdkTypes.Money(amount, price.currency);
    return formatMoney(intl, moneyObject);
  };

  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (value > 0 && value <= currentStock) {
      setQuantity(value);
    }
  };

  const handleShippingChange = (e) => {
    const objectId = e.target.value;
    const rate = shippingRates.find(r => r.objectId === objectId);
    setSelectedShipping(rate);
  };

  const handleAddToCart = () => {
    if (onSubmit) {
      onSubmit({
        quantity,
        shipping: selectedShipping,
        totalAmount,
      });
    }
  };

  const isOutOfStock = currentStock === 0;
  const maxQuantity = Math.min(currentStock, 10); // Cap at 10 for UI

  return (
    <div className={className}>
      {title}
      {subTitle}

      {isOwnListing ? (
        <p className={css.ownListingMessage}>
          <FormattedMessage id="ProductOrderPanel.ownListing" />
        </p>
      ) : isOutOfStock ? (
        <p className={css.outOfStockMessage}>
          <FormattedMessage id="ProductOrderPanel.outOfStock" />
        </p>
      ) : (
        <>
          {/* Quantity Selector */}
          <div className={css.quantitySection}>
            <label htmlFor="quantity" className={css.quantityLabel}>
              <FormattedMessage id="ProductOrderPanel.quantity" />
            </label>
            <select
              id="quantity"
              value={quantity}
              onChange={handleQuantityChange}
              className={css.quantitySelect}
            >
              {[...Array(maxQuantity)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>

          {/* Shipping Selector */}
          {loadingRates ? (
            <div className={css.shippingSection}>
              <p className={css.loadingText}>Loading shipping options...</p>
            </div>
          ) : ratesError ? (
            <div className={css.shippingSection}>
              <p className={css.errorText}>{ratesError}</p>
            </div>
          ) : shippingRates.length > 0 ? (
            <div className={css.shippingSection}>
              <label htmlFor="shipping" className={css.shippingLabel}>
                <FormattedMessage id="ProductOrderPanel.shipping" />
              </label>
              <select
                id="shipping"
                value={selectedShipping?.objectId || ''}
                onChange={handleShippingChange}
                className={css.shippingSelect}
              >
                {console.log('=== SHIPPING RATES ===', JSON.stringify(shippingRates, null, 2))}
                {shippingRates.map((rate) => (
                  <option key={rate.objectId} value={rate.objectId}>
                    {formatShippingOption(rate)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Order Breakdown */}
          <div className={css.breakdown}>
            <h3 className={css.breakdownTitle}>
              <FormattedMessage id="ProductOrderPanel.orderBreakdown" />
            </h3>

            <div className={css.breakdownRow}>
              <span className={css.breakdownLabel}>
                <FormattedMessage id="ProductOrderPanel.unitPrice" />
              </span>
              <span className={css.breakdownValue}>{formatPrice(unitPrice)}</span>
            </div>

            {quantity > 1 && (
              <div className={css.breakdownRow}>
                <span className={css.breakdownLabel}>
                  <FormattedMessage
                    id="ProductOrderPanel.quantity"
                    values={{ quantity }}
                  />
                </span>
                <span className={css.breakdownValue}>× {quantity}</span>
              </div>
            )}

            {selectedShipping && (
              <div className={css.breakdownRow}>
                <span className={css.breakdownLabel}>
                  <FormattedMessage id="ProductOrderPanel.shipping" />
                </span>
                <span className={css.breakdownValue}>{formatPrice(shippingAmount)}</span>
              </div>
            )}

            {ddpFeesAmount > 0 && (
              <div className={css.breakdownRow}>
                <span className={css.breakdownLabel}>
                  <FormattedMessage id="ProductOrderPanel.ddpFees" />
                </span>
                <span className={css.breakdownValue}>{formatPrice(ddpFeesAmount)}</span>
              </div>
            )}

            <div className={css.breakdownRow}>
              <span className={css.breakdownLabel}>
                <FormattedMessage id="ProductOrderPanel.subtotal" />
              </span>
              <span className={css.breakdownValue}>{formatPrice(subtotalWithShipping)}</span>
            </div>

            <div className={css.breakdownRow}>
              <span className={css.breakdownLabel}>
                <FormattedMessage
                  id="ProductOrderPanel.tanookiFee"
                  values={{ percentage: commissionPercentage }}
                />
                *
              </span>
              <span className={css.breakdownValue}>{formatPrice(commissionAmount)}</span>
            </div>

            <div className={css.breakdownRow + ' ' + css.totalRow}>
              <span className={css.breakdownLabel}>
                <FormattedMessage id="ProductOrderPanel.totalPrice" />
              </span>
              <span className={css.breakdownValue}>{formatPrice(totalAmount)}</span>
            </div>

            <p className={css.feeExplanation}>
              <FormattedMessage id="ProductOrderPanel.feeExplanation" />
            </p>
          </div>

          {/* Add to Cart Button */}
          <PrimaryButton
            onClick={handleAddToCart}
            disabled={!selectedShipping}
            className={css.addToCartButton}
          >
            <FormattedMessage id="ProductOrderPanel.addToCart" />
          </PrimaryButton>
        </>
      )}
    </div>
  );
};

export default ProductOrderPanel;
