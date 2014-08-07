
/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');
var core = require('snowplow-tracker-core');

// Map of Segment.io channels to Snowplow platforms
var platformDict = {
  server: 'srv',
  mobile: 'mob',
  client: 'web'
};

/**
 * Expose `Snowplow` constructor function
 */

var Snowplow = module.exports = integration('Snowplow')
  .retries(2);

/**
 * Enabled?
 *
 * @param {Facade} msg
 * @param {Object} settings
 * @return {Boolean}
 * @api private
 */

Snowplow.prototype.enabled = function (msg, settings) {
  return !!(msg.enabled(this.name) && (msg.channel() === 'server' || msg.channel() === 'mobile'));
};

/**
 * Validate.
 *
 * @param {Facade} message
 * @param {Object} settings
 * @return {Error}
 * @api public
 */

Snowplow.prototype.validate = function(message, settings) {
  return this.ensure(settings.collectorUrl, 'collectorUrl');
};

/**
 * Track a page view event
 *
 * https://github.com/snowplow/snowplow/wiki/SnowPlow-Tracker-Protocol#31-pageview-tracking
 *
 * @param {Page} page
 * @param {Object} settings
 * @param {Function} callback
 * @api public
 */

Snowplow.prototype.page = function (page, settings, callback) {
  var track = page;
  var trackerCore = createCore(track, settings);
  return this.prepareRequest(track, settings, trackerCore.trackPageView(
    track.proxy('properties.url'),
    track.proxy('properties.title'),
    track.proxy('properties.referer') || track.proxy('properties.referrer'),
    getContext(track, settings),
    track.timestamp().getTime()
  ), callback);
};

/**
 * If a schema is found for the event name, use the properties JSON as an unstructured event.
 * Otherwise, if properties has a category field, track a structured event.
 *
 * https://github.com/snowplow/snowplow/wiki/SnowPlow-Tracker-Protocol#310-custom-unstructured-event-tracking
 * https://github.com/snowplow/snowplow/wiki/SnowPlow-Tracker-Protocol#39-custom-structured-event-tracking
 *
 * @param {Track} track
 * @param {Object} settings
 * @param {Function} callback
 * @api public
 */

Snowplow.prototype.track = function (track, settings, callback) {
  var trackerCore = createCore(track, settings);
  var evt = track.event();
  var category = track.proxy('properties.category');

  if (settings.unstructuredEvents && settings.unstructuredEvents.hasOwnProperty(evt)) {
    var innerJson = {
      schema: settings.unstructuredEvents[evt],
      data: track.properties()
    };
   
    return this.prepareRequest(track, settings, trackerCore.trackUnstructEvent(
      innerJson, 
      getContext(track, settings), 
      track.timestamp().getTime()
    ), callback);

  } else if (category) {
    return this.prepareRequest(track, settings, trackerCore.trackStructEvent(
      category,
      evt,
      track.proxy('properties.label'),
      track.proxy('properties.property'),
      track.proxy('properties.value'),
      getContext(track, settings)
     ), callback);

  } else {
    callback();
  }
};

/**
 * Fires one transaction event, plus one transaction item event
 * for each element track.products()
 *
 * https://github.com/snowplow/snowplow/wiki/SnowPlow-Tracker-Protocol#35-ecommerce-tracking
 *
 * @param {Track} track
 * @param {Object} settings
 * @param {Function} callback
 */

Snowplow.prototype.completedOrder = function (track, settings, callback) {
  var trackerCore = createCore(track, settings);
  var orderId = track.orderId();
  var total = track.total();
  var currency = track.currency();
  var items = track.products();

  if (orderId && total) {

    // Event for each item in the transaction
    for (var i=0; i<items.length; i++) {
      var item = items[i];
      var sku = item.sku;
      var price = item.price;
      var quantity = item.quantity;

      if (sku && price && quantity) {
        this.prepareRequest(track, settings, trackerCore.trackEcommerceTransactionItem(
          orderId,
          sku,
          item.name,
          item.category,
          price,
          quantity,
          currency,
          getContext(track, settings),
          track.timestamp().getTime()
        ));
      }
    }

    // The main transaction event
    this.prepareRequest(track, settings, trackerCore.trackEcommerceTransaction(
      orderId,
      track.proxy('properties.affiliation'),
      track.total(),
      track.tax(),
      track.shipping(),
      track.city(),
      track.state(),
      track.country(),
      currency,
      getContext(track, settings),
      track.timestamp().getTime()
    ), callback);
  }
};

/**
 * Creates a tracker core with the standard fields
 *
 * @param {Track} track
 * @param {Object} settings 
 * @param {Object} payload
 * @param {Function} callback
 */

Snowplow.prototype.prepareRequest = function (track, settings, payload, callback){

  // Determine the endpoint
  Snowplow.prototype.endpoint = 'http://' + settings.collectorUrl + '/i';

  return this
    .get()
    .set(track.userAgent() || 'not set')
    .query(payload)
    .end(this.handle(callback || function(){}));
};

/**
 * Creates a tracker core with the standard fields
 * 
 * https://www.npmjs.org/package/snowplow-tracker-core
 *
 * @param {Track} track
 * @param {Object} settings
 * @return {Object}
 */

function createCore(track, settings) {
  var trackerCore = core(settings.encodeBase64);

  // TODO: obtain application ID and add it using `trackerCore.setAppId(appId);`
  // The application ID should be a unique identifier for the application.
  // https://github.com/snowplow/snowplow/wiki/SnowPlow-Tracker-Protocol#1-common-parameters-platform-and-event-independent

  trackerCore.setPlatform(platformDict[track.channel()] || 'srv');
  trackerCore.setTrackerVersion('seg-0.1.0');
  trackerCore.setTrackerNamespace(settings.trackerNamespace);
  trackerCore.setUserId(track.userId());
  trackerCore.setIpAddress(track.ip());
  return trackerCore;
}

/**
 * Used to check whether the user traits object has any properties
 *
 * @param {Object} obj
 * @return {Boolean}
 */

function isEmpty(obj) {
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      return false;
    }
  }
  return true;
}

/**
 * Creates a custom context from track.traits()
 *
 * https://github.com/snowplow/snowplow/wiki/SnowPlow-Tracker-Protocol#4-custom-contexts
 *
 * @param {Track} track
 * @param {Object} settings
 * @return {Array}
 */

function getContext(track, settings) {
  var context = track.traits();
  var schema = settings.userTraits;
  if (schema && !isEmpty(context)) {
    return [{
      schema: schema,
      data: context
    }];
  }
}
