'use strict';

/* global chai: false, sinon: false */

var expect = chai.expect;

describe('The Unified Inbox Angular module providers', function() {

  var $rootScope, inboxProviders, newInboxTwitterProvider, inboxHostedMailMessagesProvider, inboxHostedMailAttachmentProvider, inboxHostedMailThreadsProvider, inboxSearchResultsProvider,
      $httpBackend, jmapClient, inboxMailboxesService, jmap, ELEMENTS_PER_PAGE, ELEMENTS_PER_REQUEST, AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE;

  function elements(id, length, offset) {
    var array = [], start = offset || 0;

    for (var i = start; i < (start + length); i++) {
      array.push({
        id: id + '_' + i,
        date: new Date(2016, 1, 1, 1, 1, 1, i), // The variable millisecond is what allows us to check ordering in the tests
        mailboxIds: ['id_inbox'],
        threadId: 'thread_' + i,
        hasAttachment: true,
        templateUrl: 'templateUrl'
      });
    }

    return array;
  }

  beforeEach(function() {
    angular.mock.module('esn.core');
    angular.mock.module('esn.configuration');
    angular.mock.module('linagora.esn.unifiedinbox', function($provide) {
      jmapClient = {
        getMailboxes: function() {
          return $q.when([new jmap.Mailbox({}, 'id_inbox', 'name_inbox', { role: 'inbox' })]);
        },
        getMessageList: function(options) {
          expect(options.filter.inMailboxes).to.deep.equal(['id_inbox']);

          return $q.when({
            messageIds: [1],
            getMessages: function() {
              return $q.when(elements('message', options.limit, options.position));
            },
            getThreads: function() {
              return $q.when(elements('thread', options.limit, options.position));
            }
          });
        }
      };

      $provide.value('withJmapClient', function(cb) {
        return cb(jmapClient);
      });
      $provide.decorator('inboxMailboxesService', function($delegate) {
        $delegate.flagIsUnreadChanged = sinon.spy($delegate.flagIsUnreadChanged);

        return $delegate;
      });

      $provide.constant('ELEMENTS_PER_PAGE', ELEMENTS_PER_PAGE = 20);
    });
  });

  beforeEach(angular.mock.inject(function(_$rootScope_, _inboxProviders_, _newInboxTwitterProvider_, _inboxHostedMailMessagesProvider_, _inboxSearchResultsProvider_,
                                          _inboxHostedMailAttachmentProvider_, _inboxHostedMailThreadsProvider_, _$httpBackend_, _inboxMailboxesService_, _jmap_,
                                          _ELEMENTS_PER_PAGE_, _ELEMENTS_PER_REQUEST_, _AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE_) {
    $rootScope = _$rootScope_;
    inboxProviders = _inboxProviders_;
    newInboxTwitterProvider = _newInboxTwitterProvider_;
    inboxHostedMailMessagesProvider = _inboxHostedMailMessagesProvider_;
    inboxSearchResultsProvider = _inboxSearchResultsProvider_;
    inboxHostedMailAttachmentProvider = _inboxHostedMailAttachmentProvider_;
    inboxHostedMailThreadsProvider = _inboxHostedMailThreadsProvider_;
    $httpBackend = _$httpBackend_;
    inboxMailboxesService = _inboxMailboxesService_;
    jmap = _jmap_;

    ELEMENTS_PER_REQUEST = _ELEMENTS_PER_REQUEST_;
    AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE = _AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE_;
  }));

  describe('The inboxHostedMailMessagesProvider factory', function() {

    it('should request the backend using the JMAP client, and return pages of messages', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailMessagesProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(messages[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'message_160',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/message'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_PAGE);
        expect(messages[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'message_140',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/message'
        });

        done();
      });
      $rootScope.$digest();
    });

    it('should paginate requests to the backend', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailMessagesProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(messages[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'message_160',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/message'
        });
      });
      $rootScope.$digest();

      for (var i = ELEMENTS_PER_PAGE; i < ELEMENTS_PER_REQUEST; i += ELEMENTS_PER_PAGE) {
        fetcher();
        $rootScope.$digest();
      }

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_PAGE);
        expect(messages[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'message_360',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/message'
        });

        done();
      });
      $rootScope.$digest();
    });

    it('should support fetching recent items once an initial fetch has been done', function(done) {
      var fetcher = inboxHostedMailMessagesProvider.fetch({ inMailboxes: ['id_inbox'] });

      fetcher();
      $rootScope.$digest();

      jmapClient = {
        getMailboxWithRole: function(role) {
          return $q.when({ id: 'id_' + role.value });
        },
        getMessageList: function(options) {
          expect(options.filter).to.deep.equal({
            inMailboxes: ['id_inbox'],
            after: new Date(2016, 1, 1, 1, 1, 2, 199) // Second is 2 because the provider bumps it
          });
          expect(options.position).to.equal(0);

          done();
        }
      };

      fetcher.loadRecentItems();
      $rootScope.$digest();
    });

    it('should update mailbox badge when fetching unread recent items', function() {
      var fetcher = inboxHostedMailMessagesProvider.fetch({ inMailboxes: ['id_inbox'] });

      fetcher();
      $rootScope.$digest();

      jmapClient.getMessageList = function() {
        return $q.when({
          messageIds: ['id1', 'id2'],
          getMessages: function() {
            return $q.when([
              {
                id: 'id1',
                date: new Date(2016, 1, 1, 1, 1, 1, 0),
                mailboxIds: ['id_inbox'],
                isUnread: true
              },
              {
                id: 'id2',
                date: new Date(2016, 1, 1, 1, 1, 1, 0),
                mailboxIds: ['id_inbox', 'id_otherMailbox'],
                isUnread: true
              },
              {
                id: 'id3',
                date: new Date(2016, 1, 1, 1, 1, 1, 0),
                mailboxIds: ['id_inbox']
              }
            ]);
          }
        });
      };

      fetcher.loadRecentItems();
      $rootScope.$digest();

      expect(inboxMailboxesService.flagIsUnreadChanged).to.have.been.calledWith(sinon.match({ id: 'id1' }));
      expect(inboxMailboxesService.flagIsUnreadChanged).to.have.been.calledWith(sinon.match({ id: 'id2' }));
      expect(inboxMailboxesService.flagIsUnreadChanged).to.have.not.been.calledWith(sinon.match({ id: 'id3' }));
    });

  });

   describe('The inboxSearchResultsProvider factory', function() {

    it('should request the backend using the JMAP client, and return pages of messages', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxSearchResultsProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(messages[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'message_160',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/search'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_PAGE);
        expect(messages[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'message_140',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/search'
        });

        done();
      });
      $rootScope.$digest();
    });

    it('should paginate requests to the backend', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxSearchResultsProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(messages[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'message_160',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/search'
        });
      });
      $rootScope.$digest();

      for (var i = ELEMENTS_PER_PAGE; i < ELEMENTS_PER_REQUEST; i += ELEMENTS_PER_PAGE) {
        fetcher();
        $rootScope.$digest();
      }

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_PAGE);
        expect(messages[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'message_360',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/search'
        });

        done();
      });
      $rootScope.$digest();
    });

  });

  describe('The inboxHostedMailAttachmentProvider factory', function() {

    it('should request the backend using the JMAP client, and return pages of messages', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailAttachmentProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(messages[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'message_39',
          templateUrl: '/unifiedinbox/views/components/sidebar/attachment/sidebar-attachment-item'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_PAGE);
        expect(messages[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'message_59',
          templateUrl: '/unifiedinbox/views/components/sidebar/attachment/sidebar-attachment-item'
        });

        done();
      });
      $rootScope.$digest();
    });

    it('should paginate requests to the backend', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailAttachmentProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(messages[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'message_39',
          templateUrl: '/unifiedinbox/views/components/sidebar/attachment/sidebar-attachment-item'
        });
      });
      $rootScope.$digest();

      for (var i = ELEMENTS_PER_PAGE; i < ELEMENTS_PER_REQUEST; i += ELEMENTS_PER_PAGE) {
        fetcher();
        $rootScope.$digest();
      }

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_PAGE);
        expect(messages[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'message_239',
          templateUrl: '/unifiedinbox/views/components/sidebar/attachment/sidebar-attachment-item'
        });

        done();
      });
      $rootScope.$digest();
    });
  });

  describe('The inboxHostedMailThreadsProvider factory', function() {

    it('should have fetch function to resolve an array of thread', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailThreadsProvider.fetch(filter);

      fetcher().then(function(threads) {
        expect(threads).to.be.an.instanceof(Array);
        expect(threads[0].emails).to.be.an.instanceof(Array);
        done();
      });

      $rootScope.$digest();
    });

    it('should request the backend using the JMAP client, and return pages of threads', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailThreadsProvider.fetch(filter);

      fetcher().then(function(threads) {
        expect(threads.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(threads[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'thread_39',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/thread'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(threads) {
        expect(threads.length).to.equal(ELEMENTS_PER_PAGE);
        expect(threads[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'thread_59',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/thread'
        });

        done();
      });
      $rootScope.$digest();
    });

    it('should paginate requests to the backend', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailThreadsProvider.fetch(filter);

      fetcher().then(function(threads) {
        expect(threads.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(threads[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'thread_39',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/thread'
        });
      });
      $rootScope.$digest();

      for (var i = ELEMENTS_PER_PAGE; i < ELEMENTS_PER_REQUEST; i += ELEMENTS_PER_PAGE) {
        fetcher();
        $rootScope.$digest();
      }

      fetcher().then(function(threads) {
        expect(threads.length).to.equal(ELEMENTS_PER_PAGE);
        expect(threads[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'thread_239',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/thread'
        });

        done();
      });
      $rootScope.$digest();
    });

  });

  describe('The newInboxTwitterProvider factory', function() {

    it('should generate an ID containing the Account ID', function() {
      expect(newInboxTwitterProvider('providerId', 'Account1', '').id).to.equal('providerIdAccount1');
    });

    it('should request tweets from the  backend, and return pages of tweets', function(done) {
      var fetcher = newInboxTwitterProvider('id', 'myTwitterAccount', '/unifiedinbox/api/inbox/tweets').fetch();

      $httpBackend.expectGET('/unifiedinbox/api/inbox/tweets?account_id=myTwitterAccount&count=400').respond(200, elements('tweet', ELEMENTS_PER_REQUEST));

      fetcher().then(function(tweets) {
        expect(tweets.length).to.equal(AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE);
        expect(tweets[AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE - 1]).to.shallowDeepEqual({
          id: 'tweet_39',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/tweet'
        });
      });
      $httpBackend.flush();

      fetcher().then(function(tweets) {
        expect(tweets.length).to.equal(ELEMENTS_PER_PAGE);
        expect(tweets[ELEMENTS_PER_PAGE - 1]).to.shallowDeepEqual({
          id: 'tweet_59',
          templateUrl: '/unifiedinbox/views/unified-inbox/elements/tweet'
        });

        done();
      });
      $rootScope.$digest();
    });

    it('should paginate requests to the backend', function(done) {
      var fetcher = newInboxTwitterProvider('id', 'myTwitterAccount', '/unifiedinbox/api/inbox/tweets').fetch();

      $httpBackend.expectGET('/unifiedinbox/api/inbox/tweets?account_id=myTwitterAccount&count=400').respond(200, elements('tweet', ELEMENTS_PER_REQUEST));

      fetcher();
      $httpBackend.flush();

      for (var i = AGGREGATOR_DEFAULT_FIRST_PAGE_SIZE; i < ELEMENTS_PER_REQUEST; i += ELEMENTS_PER_PAGE) {
        fetcher();
        $rootScope.$digest();
      }

      $httpBackend.expectGET('/unifiedinbox/api/inbox/tweets?account_id=myTwitterAccount&count=400&max_id=tweet_199').respond(200, [{
        id: 'tweet_200',
        date: '2016-01-01T01:01:01.001Z'
      }]);

      fetcher().then(function(tweets) {
        expect(tweets.length).to.equal(1);
        expect(tweets[0].date).to.equalTime(new Date(Date.UTC(2016, 0, 1, 1, 1, 1, 1)));

        done();
      });
      $httpBackend.flush();
    });

    it('should support fetching recent items once an initial fetch has been done', function(done) {
      var fetcher = newInboxTwitterProvider('id', 'myTwitterAccount', '/unifiedinbox/api/inbox/tweets').fetch();

      $httpBackend.expectGET('/unifiedinbox/api/inbox/tweets?account_id=myTwitterAccount&count=400').respond(200, elements('tweet', ELEMENTS_PER_REQUEST));

      fetcher();
      $httpBackend.flush();

      $httpBackend.expectGET('/unifiedinbox/api/inbox/tweets?account_id=myTwitterAccount&count=400&since_id=tweet_0').respond(200, [
        {
          id: 'tweet_-1',
          date: '2016-01-01T01:01:00.999Z'
        },
        {
          id: 'tweet_0',
          date: '2016-01-01T01:01:01.001Z'
        }
      ]);

      fetcher.loadRecentItems().then(function(tweets) {
        expect(tweets.length).to.equal(1); // Because tweet_0 should be filtered out
        expect(tweets[0].date).to.equalTime(new Date(Date.UTC(2016, 0, 1, 1, 1, 0, 999)));

        done();
      });
      $httpBackend.flush();
    });

  });

  describe('The inboxProviders factory', function() {

    describe('The getAll function', function() {

      it('should return an array of providers, with the "loadNextItems" property initialized', function(done) {
        inboxProviders.add({
          buildFetchContext: sinon.spy(function() { return $q.when('container'); }),
          fetch: sinon.spy(function(container) {
            expect(container).to.equal('container');

            return function() {
              return $q.when(elements('id', 2));
            };
          }),
          templateUrl: 'templateUrl'
        });
        inboxProviders.add({
          buildFetchContext: sinon.spy(function() { return $q.when('container_2'); }),
          fetch: sinon.spy(function(container) {
            expect(container).to.equal('container_2');

            return function() {
              return $q.when(elements('id', ELEMENTS_PER_REQUEST));
            };
          }),
          templateUrl: 'templateUrl'
        });

        inboxProviders.getAll().then(function(providers) {
          $q.all(providers.map(function(provider) {
            return provider.loadNextItems();
          })).then(function(results) {
            expect(results[0]).to.deep.equal({ data: elements('id', 2), lastPage: true });
            expect(results[1]).to.deep.equal({ data: elements('id', ELEMENTS_PER_REQUEST), lastPage: false });

            done();
          });
        });
        $rootScope.$digest();
      });

    });

  });

  describe('The inboxJmapProviderContextBuilder', function() {

    var inboxJmapProviderContextBuilder;

    beforeEach(inject(function(_inboxJmapProviderContextBuilder_) {
      inboxJmapProviderContextBuilder = _inboxJmapProviderContextBuilder_;
    }));

    it('should build default context as a filter to get message list in Inbox folder', function() {
      inboxJmapProviderContextBuilder({ filterByType: {} }).then(function(context) {
        expect(context).to.deep.equal({
          inMailboxes: ['id_inbox']
        });
      });

      $rootScope.$digest();
    });

    it('should extend the JMAP filter when its is given', function() {
      inboxJmapProviderContextBuilder({
        filterByType: {
          JMAP: { isUnread: true }
        }
      }).then(function(context) {
        expect(context).to.deep.equal({
          inMailboxes: ['id_inbox'],
          isUnread: true
        });
      });

      $rootScope.$digest();
    });

    it('should build search context when query is passed as an option', function() {
      inboxJmapProviderContextBuilder({ query: 'query' }).then(function(context) {
        expect(context).to.deep.equal({
          text: 'query'
        });
      });

      $rootScope.$digest();
    });

  });

});
