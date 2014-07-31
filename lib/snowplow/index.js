
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

Snowplow.prototype.page = function (track, settings, callback) {
  var tracker = createCore(track, settings);
  return this.prepareRequest(track, settings, tracker.trackPageView(
    track.proxy('properties.uri'),
    track.proxy('properties.title'),
    track.proxy('properties.referer') || track.proxy('properties.referrer'),
    getContext(track, settings)
  ), callback);
};

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
      tracker.addEnvironmentPair('eid', uuid.v4());

      if (sku) {
        this.prepareRequest(track, settings, tracker.trackEcommerceTransactionItem(
          orderId,
          sku,
          item.name,
          item.category,
          item.price,
          item.quantity,
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
 * Creates a tracker core with the standard fieldss
 */

function createCore(track, settings) {
  var tracker = core(settings.encodeBase64, console.log);
  tracker.resetEnvironment({
    tna: settings.trackerNamespace,
    aid: settings.appId,
    p: settings.platform,
    tv: 'seg-1.0.0',
    dtm: track.timestamp().getTime(),
    eid: uuid.v4()
  });
  return tracker;
}

/**
 * Used to check whether the user traits object has any properties
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
