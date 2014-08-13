var test            = require('segmentio-integration-tester')
  , auth            = require('./auth.json')
  , facade          = require('segmentio-facade')
  , Snowplow        = require('..')['Snowplow']
  , snowplow        = new Snowplow()
  , helpers         = require('./helpers')
  , should          = require('should');
  
describe('Snowplow', function () {

  var settings = auth['Snowplow'];

  describe('.enabled()', function () {
    it('should only be enabled for server side messages', function () {
      snowplow.enabled(new facade.Track({ channel : 'server' }), settings).should.be.ok;
      snowplow.enabled(new facade.Track({ channel : 'mobile' }), settings).should.be.ok;
      snowplow.enabled(new facade.Track({ channel : 'client' }), settings).should.not.be.ok;
      snowplow.enabled(new facade.Track({}), {}).should.not.be.ok;
    });
  });

  describe('.validate()', function () {
    it('should require a collectorUrl', function () {
      snowplow.validate({}, { collectorUrl: '' }).should.be.an.instanceOf(Error);
      snowplow.validate({}, {}).should.be.an.instanceOf(Error);
      should.not.exist(snowplow.validate({}, { collectorUrl : 'd3rkrsqld9gmqf.cloudfront.net' }));
    });
  });

  describe('.page()', function () {
    it('should get a good response from the API', function (done) {
      var page = helpers.page();
      snowplow.page(page, settings, done);
    });
  });


  describe('.screen()', function () {
    it('should get a good response from the API', function (done) {
      var screen = helpers.screen();
      snowplow.screen(screen, settings, done);
    });
  });

  describe('.track()', function () {
    it('should get a good response from the API', function (done) {
      var track = helpers.track();
      snowplow.track(track, settings, done);
    });
  });

  describe('ecommerce', function () {
    it('should send ecommerce data', function (done) {
      var track = helpers.transaction();
      snowplow.track(track, settings, done);
    });
  });

  describe('.identify()', function () {
    it('should do nothing', function (done) {
      snowplow.identify({}, settings, function (err) {
        should.not.exist(err);
        done();
      });
    });
  });

  describe('.alias()', function () {
    it('should do nothing', function (done) {
      snowplow.alias({}, settings, function (err) {
        should.not.exist(err);
        done();
      });
    });
  });

});
