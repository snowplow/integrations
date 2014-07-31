
/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');
var uuid = require('uuid');
var core = require('snowplow-core');

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
  return !!(msg.enabled(this.name) && 'server' === msg.channel());
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
  return this.ensure(settings.collectorUri, 'collectorUri');
};

/**
 * Track a page view event
 *
 * @param {Page} page
 * @param {Object} settings
 * @param {Function} callback
 * @api public
 */

Snowplow.prototype.page = function (page, settings, callback) {
  var track = page.track()
  var tracker = createCore(track, settings);
  return this.prepareRequest(track, settings, tracker.trackPageView(
    track.proxy('properties.url'),
    track.proxy('properties.title'),
    track.proxy('properties.referer') || track.proxy('properties.referrer'),
    getContext(track, settings)
  ), callback);
};

/**
 * If a schema is found for the event name, use the properties JSON as an unstructured event.
 * Otherwise, if properties has a category field, track a structured event.
 *
 * @param {Track} track
 * @param {Object} settings
 * @param {Function} callback
 * @api public
 */

Snowplow.prototype.track = function (track, settings, callback) {
  var tracker = createCore(track, settings);
  var evt = track.event();
  var category = track.proxy('properties.category');
  if (settings.unstructuredEvents && settings.unstructuredEvents.hasOwnProperty(evt)) {
    var innerJson = {
      schema: settings.unstructuredEvents[evt],
      data: track.properties()
    };
   
    return this.prepareRequest(track, settings, tracker.trackUnstructEvent(innerJson, getContext(track, settings)), callback);
  } else if (category) {
    return this.prepareRequest(track, settings, tracker.trackStructEvent(
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
 * @param {Track} track
 * @param {Object} settings
 * @param {Function} callback
 */

Snowplow.prototype.completedOrder = function (track, settings, callback) {
  var tracker = createCore(track, settings);
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
      tracker.addEnvironmentPair('eid', uuid.v4());

      if (sku && price && quantity) {
        this.prepareRequest(track, settings, tracker.trackEcommerceTransactionItem(
          orderId,
          sku,
          item.name,
          item.category,
          price,
          quantity,
          currency,
          getContext(track, settings)
        ));
      }
    }

    // The main transaction event
    tracker.addEnvironmentPair('eid', uuid.v4());   
    this.prepareRequest(track, settings, tracker.trackEcommerceTransaction(
      orderId,
      track.proxy('properties.affiliation'),
      track.total(),
      track.tax(),
      track.shipping(),
      track.city(),
      track.state(),
      track.country(),
      currency,
      getContext(track, settings)
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
  Snowplow.prototype.endpoint = 'http://' + settings.collectorUri + '/i';

  return this
    .get()
    .set(track.userAgent() || 'not set')
    .query(payload)
    .end(this.handle(callback || function(){}));
};

/**
 * Creates a tracker core with the standard fields
 *
 * @param {Track} track
 * @param {Object} settings
 * @return {Object}
 */

function createCore(track, settings) {
  var tracker = core(settings.encodeBase64, console.log);
  tracker.resetEnvironment({
    tna: settings.trackerNamespace,
    aid: settings.appId,
    p: settings.platform,
    tv: 'seg-1.0.0',
    dtm: track.timestamp().getTime(),
    uid: track.userId() || track.sessionId(),
    ip: track.ip(),
    eid: uuid.v4()
  });

  return tracker;
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
