
/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');

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

  return this.prepareRequest(track, settings, {
    e: 'pv',
    page: track.proxy('properties.title')
  }, callback);
  
};

Snowplow.prototype.track = function (track, settings, callback) {

  var evt = track.event();
  var category = track.proxy('properties.category');
  var b64 = settings.encodeBase64 !== false;

  if (settings.unstructuredEvents && settings.unstructuredEvents.hasOwnProperty(evt)) {
    var ueFieldName = b64 ? 'ue_px' : 'ue_pr';
    var querystringPairs = {
      e: 'ue'
    };

    var outerJson = {
      schema: 'iglu:com.snowplowanalytics.snowplowanalytics/unstruct_event/jsonschema/1-0-0',
      data: {
        schema: settings.unstructuredEvents[evt],
        data: track.properties()
      }
    };

    querystringPairs[ueFieldName] = b64 ? b64encode(outerJson) : JSON.stringify(outerJson);

    return this.prepareRequest(track, settings, querystringPairs, callback);

  } else if (category) {

    return this.prepareRequest(track, settings, {
      e: 'se',
      se_ca: category,
      se_ac: track.event(),
      se_la: track.proxy('properties.label'),
      se_ac: track.proxy('properties.property'),
      se_ac: track.proxy('properties.label')
    }, callback);
  }

  callback();

};

Snowplow.prototype.completedOrder = function(track, settings, callback) {

  var orderId = track.orderId();
  var total = track.total();
  var currency = track.currency();
  var items = track.products();

  if (orderId && total) {
    this.prepareRequest(track, settings, {
      e: 'tr',
      tr_id: orderId,
      tr_af: track.proxy('properties.affiliation'),
      tr_tt: track.total(),
      tr_tx: track.tax(),
      tr_sh: track.shipping(),
      tr_ci: track.city(),
      tr_cu: track.state(),
      tr_cu: track.country(),
      tr_cu: currency
    });

    for (var i=0; i<items.length; i++) {
      var item = items[i];
      var sku = item.sku;


      if (sku) {
        this.prepareRequest(track, settings, {
          e: 'ti',
          ti_sk: sku,
          ti_na: item.name,
          ti_ca: item.category,
          ti_pr: item.price,
          ti_qu: item.quantity,
          ti_cu: currency
        }, i === items.length - 1 ? callback : function(){});
      }
    }
  }
};

/**
 * Removes all keys with whose value is undefined, null or ""
 */
function cleanQuerystring(payload) {
  for (var k in payload) {
    if (k === '' || k === null || typeof k === 'undefined') {
      delete payload[k];
    }
  }
  return payload;
}

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
    .query(cleanQuerystring(payload))
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
