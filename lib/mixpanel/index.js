
var Batch       = require('batch')
  , debug       = require('debug')('Segmentio:Mixpanel')
  , errors      = require('../errors')
  , extend      = require('extend')
  , Integration = require('../integration')
  , is          = require('is')
  , ms          = require('ms')
  , request     = require('request-retry')({ retries : 2 })
  , unixTime    = require('unix-time')
  , util        = require('util');


module.exports = Mixpanel;


function Mixpanel () {
  this.name    = 'Mixpanel';
  this.baseUrl = 'https://api.mixpanel.com';
}


util.inherits(Mixpanel, Integration);


Mixpanel.prototype.enabled = function (message, settings) {
  return Integration.enabled.call(this, message, settings) &&
         message.channel() === 'server';
};


Mixpanel.prototype.validate = function (message, settings) {
  // Check whether we should import the message, uses a different endpoint
  var imported = shouldImport(message);

  var err = this._missingSetting(settings, 'token');
  if (imported) err = err || this._missingSetting(settings, 'apiKey');

  return err;
};


/**
 * Identify the Mixpanel user.
 * https://mixpanel.com/help/reference/http#people-analytics-updates
 */

Mixpanel.prototype.identify = function (identify, settings, callback) {
  if (!settings.people) return process.nextTick(callback);

  var payload = {
    $distinct_id : identify.userId() || identify.sessionId(), // the primary id
    $token       : settings.token,
    $time        : identify.timestamp().getTime(),
    $set         : formatTraits(identify),    // set all the traits on identify
    $ip          : identify.ip(),             // use the ip passed in options
    $ignore_time : identify.proxy('options.ignoreTime'),
    mp_lib       : 'Segment.io'
  };

  var req = {
    url : this.baseUrl + '/engage/',
    qs  : {
      ip      : 0,       // pass a flag to ignore the server-ip
      verbose : 1,       // make sure that we get a valid response
      data    : b64encode(payload)
    }
  };

  debug('making identify request');
  request.get(req, this._parseResponse(callback));
};


/**
 * Track a Mixpanel event
 * https://mixpanel.com/help/reference/http#tracking-events
 */

Mixpanel.prototype.track = function (track, settings, callback) {
  var imported = shouldImport(track)
    , endpoint = imported ? '/track/' : '/import/';

  var payload = {
    event      : track.event(),
    properties : formatProperties(track, settings)
  };

  var req = {
    url : this.baseUrl + endpoint,
    qs  : {
      ip      : 0,
      verbose : 1,
      data    : b64encode(payload),
      api_key : settings.apiKey
    }
  };

  var batch = new Batch()
    , self  = this;

  debug('making track request');
  batch.push(function (done) { request.post(req, self._parseResponse(done)); });

  if (track.revenue()) {
    batch.push(function (done) { self.revenue(track, settings, done); });
  }

  batch.end(callback);
};


/**
 * Alias a user from one id to the other
 * https://mixpanel.com/help/reference/http#distinct-id-alias
 */

Mixpanel.prototype.alias = function (alias, settings, callback) {

  var payload = {
    event      : '$create_alias',
    properties : {
      distinct_id : alias.from(),
      alias       : alias.to(),
      token       : settings.token
    }
  };

  var req = {
    url : this.baseUrl + '/track/',
    qs  : {
      ip      : 0,
      verbose : 1,
      data    : b64encode(payload),
      api_key : settings.apiKey
    }
  };

  debug('making alias request');
  request.post(req, this._parseResponse(callback));
};


/**
 * Common function for parsing the response from a mixpanel call.
 */

Mixpanel.prototype._parseResponse = function (callback) {
  return this._handleResponse(function (err, body) {
    if (err) return callback(err);

    try {
      body = JSON.parse(body);
      if (!body.status) err = new errors.BadRequest(body.error);
    } catch (e) {
      debug('failed to parse body: %s', body);
      err = e;
    }
    return callback(err);
  });
};


/**
 * Track a mixpanel revenue call
 * https://mixpanel.com/help/reference/http#tracking-revenue
 */

Mixpanel.prototype.revenue = function (track, settings, callback) {
  var req = {
    url : this.baseUrl + '/engage/',
    qs  : {
      ip      : 0,
      verbose : 1,
      data    : b64encode(formatRevenue(track, settings)),
    }
  };

  debug('making revenue request');
  request.get(req, this._parseResponse(callback));
};


/**
 * Format the traits from the identify
 */

function formatTraits (identify) {

  var traits = identify.traits();

  // https://mixpanel.com/help/reference/http#people-special-properties
  extend(traits, {
    $first_name : identify.firstName(),
    $last_name  : identify.lastName(),
    $email      : identify.email(),
    $phone      : identify.phone()
  });

  if (identify.created()) traits['$created'] = formatDate(idnetify.created());

  return traits;
}


/**
 * Format the mixpanel specific properties.
 */

function formatProperties (track, settings) {

  var properties = track.properties();

  extend(properties, {
    token       : settings.token,
    distinct_id : track.userId() || track.sessionId(),
    time        : unixTime(track.timestamp()),
    mp_lib      : 'Segment.io',
    $referrer   : track.referrer(),
    $username   : track.username(),
    $query      : track.query(),
    $ip         : track.ip()
  });

  return properties;
}


/**
 * Create a revenue track call
 * https://mixpanel.com/help/reference/http#tracking-revenue
 */

function formatRevenue (track, settings) {

  return {
    $distinct_id : track.userId() || track.sessionId(),
    $token       : settings.token,
    $append : {
      $transactions : {
        $time   : formatDate(track.timestamp()),
        $amount : track.revenue()
      }
    }
  };
}


/**
 * Formats a date for Mixpanel's API, takes the first part of the iso string
 * https://mixpanel.com/help/reference/http#dates-in-updates
 */

function formatDate (date) {
  return (new Date(date)).toISOString().slice(0,19);
}


/**
 * Mixpanel uses different endpoints for historical import.
 * https://mixpanel.com/docs/api-documentation/importing-events-older-than-31-days
 * @return {Boolean}
 */

function shouldImport (message) {
  var timestamp = message.timestamp() || new Date();
  return (Date.now() - timestamp.getTime()) > ms('5d');
}

/**
 * Base64 encode the payload
 */

function b64encode (payload) {
  return new Buffer(JSON.stringify(payload)).toString('base64');
}