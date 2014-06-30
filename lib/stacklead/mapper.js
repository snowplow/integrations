
var time = require('unix-time');

/**
 * Map identify.
 *
 * @param {Identify} identify
 * @param {Object} settings
 * @return {Object}
 * @api private
 */

exports.identify = function(identify, settings){
  var payload = {
    address: identify.address(),
    created: time(identify.created()),
    duplicates: false,
    email: identify.email(),
    user_ip: identify.ip(),
    city: identify.proxy('traits.city'),
    state: identify.proxy('traits.state'),
    website: identify.website(),
    phone: identify.phone(),
    name: identify.name(),
    first_name: identify.firstName(),
    last_name: identify.lastName(),
    user_agent: identify.userAgent(),
    delivery_method: settings.deliveryMethod
  };
  var opts = identify.options('StackLead');
  if (opts && opts.html) payload.custom_html = opts.html;
  return clean(payload);
};

/**
 * Remove all the non-null and undefined keys from `obj`
 *
 * @param {Object} obj
 * @return {Object} ret
 */

function clean(obj){
  var ret = {};
  Object.keys(obj).forEach(function(key){
    if (obj[key] != null) ret[key] = obj[key];
  });
  return ret;
}
