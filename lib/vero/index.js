
var debug       = require('debug')('Segmentio:Vero')
  , Integration = require('../integration')
  , request     = require('request-retry')({ retries : 2 })
  , util        = require('util');


module.exports = Vero;


function Vero () {
  this.name = 'Vero';
  this.baseUrl = 'https://api.getvero.com/api/v2';
}


util.inherits(Vero, Integration);


/**
 * Decide whether the message is enabled.
 */

Vero.prototype.enabled = function (message, settings) {
  return Integration.enabled.call(this, message, settings) &&
         message.channel() === 'server';
};


/**
 * Validate the message and settings
 */

Vero.prototype.validate = function (message, settings) {
  return this._missingSetting(settings, 'authToken');
};


/**
 * Track an action in Vero
 * https://github.com/getvero/vero-api/blob/master/sections/api/events.md
 */

Vero.prototype.track = function (track, settings, callback) {

  var payload = {
    auth_token : settings.authToken,
    event_name : track.event(),
    data       : track.properties(),
    identity   : {
      id    : track.userId() || track.sessionId(),
      email : track.email()
    }
  };

  var req = {
    url  : this.baseUrl + '/events/track',
    json : payload
  };

  debug('making track request');
  request.post(req, this._handleResponse(callback));
};


/**
 * Identify a Vero user
 * https://github.com/getvero/vero-api/blob/master/sections/api/users.md
 */

Vero.prototype.identify = function (identify, settings, callback) {

  var payload = {
    auth_token : settings.authToken,
    id         : identify.userId() || identify.sessionId(),
    email      : identify.email(),
    data       : identify.traits()
  };

  var req = {
    url  : this.baseUrl + '/users/track',
    json : payload
  };

  debug('making identify request');
  request.post(req, this._handleResponse(callback));
};