
/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');
var core = require('snowplow-core');

var tracker = core(false, console.log); // console.log for debugging

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

Snowplow.prototype.enabled = function(msg, settings){
  return !! (msg.enabled(this.name) && 'server' === msg.channel());
};

Snowplow.prototype.page = function (track, settings, callback) {
  return this.prepareRequest(track, settings, tracker.trackPageView(track.proxy('properties.uri'), track.proxy('properties.title')), callback);
};

Snowplow.prototype.track = function(track, settings, callback) {
  var evt = track.event();
  var category = track.proxy('properties.category');
  if (settings.unstructuredEvents && settings.unstructuredEvents.hasOwnProperty(evt)) {
    var innerJson = {
      schema: settings.unstructuredEvents[evt],
      data: track.properties()
    };
    
    // TODO: set environment
    return this.prepareRequest(track, settings, tracker.trackUnstructEvent(innerJson), callback);
  } else if (category) {
    return this.prepareRequest(track, settings, tracker.trackStructEvent(category, evt, track.proxy('properties.label'), track.proxy('properties.property'), track.proxy('properties.value')), callback);
  } else {
    callback();
  }
}

Snowplow.prototype.completedOrder = function(track, settings, callback) {

  var orderId = track.orderId();
  var total = track.total();
  var currency = track.currency();
  var items = track.products();

  if (orderId && total) {

    // Event for each item in the transaction
    for (var i=0; i<items.length; i++) {
      var item = items[i];
      var sku = item.sku;

      if (sku) {
        this.prepareRequest(track, settings, tracker.trackEcommerceTransactionItem(
          orderId,
          sku,
          item.name,
          item.category,
          item.price,
          item.quantity,
          currency
        ));
      }
    }

    // The main transaction event
    this.prepareRequest(track, settings, tracker.trackEcommerceTransaction(
      orderId,
      track.proxy('properties.affiliation'),
      track.total(),
      track.tax(),
      track.shipping(),
      track.city(),
      track.state(),
      track.country(),
      currency
    ), callback);
  }
};

Snowplow.prototype.prepareRequest = function(track, settings, payload, callback){

  // Determine the endpoint
  Snowplow.prototype.endpoint = 'http://' + settings.collectorUri + '/i';

  // Add context if necessary
  var context = track.traits();
  var b64 = settings.encodeBase64;
  var contextFieldName = b64 !== false ? 'cx' : 'co';
  if (settings.userTraits && !isEmpty(context)) {
    var contextsJson = {
      schema: 'iglu:com.snowplowanalytics.snowplow/contexts/jsonschema/1-0-0',
      data: [{
        schema: settings.userTraits,
        data: context
      }]
    };
    payload[contextFieldName] = b64 ? JSON.stringify(contextsJson) : b64encode(contextsJson);
  }

  // Add timestamp
  payload['dtm'] = track.timestamp().getTime();

  // Add "tracker version"
  payload['tv'] = 'seg-1.0.0';

  return this
    .get()
    .set(track.userAgent() || 'not set')
    .query(payload)
    .end(this.handle(callback || function(){}));
};

/**
 * Base64 encode contexts and unstructured events
 *
 * @param {Object} payload
 * @return {String}
 * @api private
 */

function b64encode(payload){
  return new Buffer(JSON.stringify(payload)).toString('base64');
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
