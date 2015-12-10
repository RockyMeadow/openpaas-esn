'use strict';

var chai = require('chai');
var expect = chai.expect;
var q = require('q');

describe('The contact import controller', function() {

  var deps = {
    logger: {
      debug: console.log,
      info: console.log,
      error: console.log
    }
  };

  var dependencies = function(name) {
    return deps[name];
  };

  describe('The importContacts function', function() {

    var req;
    beforeEach(function() {
      req = {
        body: {
          account_id: '321'
        },
        token: {
          token: '123'
        },
        user: {
          _id: 1
        },
        params: {
          type: 'twitter'
        }
      };
    });

    var getController = function(lib) {
      return require('../../../../backend/webserver/api/controller')(dependencies, lib);
    };

    it('should send back HTTP 500 when import rejects', function(done) {
      var lib = {
        importContacts: function(options) {
          expect(options.esnToken).to.equal(req.token.token);
          expect(options.user).to.deep.equal(req.user);
          expect(options.accountId).to.deep.equal(req.body.account_id);
          return q.reject(new Error('Import failure'));
        }
      };

      getController(lib).importContacts(req, {
        status: function(code) {
          expect(code).to.equal(500);
          return {
            json: function(data) {
              expect(data.error.status).to.equal(500);
              expect(data.error.message).to.equal('Server Error');
              expect(data.error.details).to.equal('Error while importing contacts');
              done();
            }
          };
        }
      });
    });

    it('should send back HTTP 202 when import is resolved', function(done) {
      var lib = {
        importContacts: function(options) {
          expect(options.esnToken).to.equal(req.token.token);
          expect(options.user).to.deep.equal(req.user);
          expect(options.accountId).to.deep.equal(req.body.account_id);
          return q.when({});
        }
      };

      getController(lib).importContacts(req, {
        status: function(code) {
          expect(code).to.equal(202);
          return {
            json: function() {
              done();
            }
          };
        }
      });
    });
  });
});