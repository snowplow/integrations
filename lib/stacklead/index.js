
/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');
var fmt = require('util').format;
var mapper = require('./mapper');
var ValidationError = integration.errors.Validation;

/**
 * Delivery methods
 */

var methods = ['email', 'webhook'];

/**
 * Expose `StackLead`
 */

var StackLead = module.exports = integration('StackLead')
  .endpoint('https://stacklead.com/api')
  .mapper(mapper)
  .retries(2);

/**
 * Validate.
 *
 * @param {Facade} message
 * @param {Object} settings
 * @return {Error}
 * @api public
 */

StackLead.prototype.validate = function(_, settings){
  var err = this.ensure(settings.apiKey, 'apiKey');
  if (err) return err;

  var method = settings.deliveryMethod;
  if (!method || methods.indexOf(method) > -1) return;

  var msg = '%s requires `deliveryMethod` to be one of %s but was %s';
  return new ValidationError(fmt(msg, this.name, methods, method));
};

/**
 * Enabled.
 *
 * @param {Facade} message
 * @param {Object} settings
 * @return {Boolean}
 * @api public
 */

StackLead.prototype.enabled = function(message){
  return !! (message.enabled(this.name)
    && message.email
    && message.email());
};

/**
 * Identify.
 *
 * @param {Identify} identify
 * @param {Object} settings
 * @param {Function} fn
 * @api private
 */

StackLead.prototype.identify = function(payload, settings, fn){
  return this
    .post('/leads')
    // To prevent StackLead from sending duplicates where no
    // created is set
    .set('User-Agent', 'Segment')
    .auth(settings.apiKey, '')
    .type('json')
    .send(payload)
    .end(this.handle(fn));
};
