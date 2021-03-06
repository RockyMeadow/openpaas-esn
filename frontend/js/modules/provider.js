'use strict';

angular.module('esn.provider', [
  'esn.constants',
  'esn.aggregator',
  'esn.lodash-wrapper',
  'esn.infinite-list',
  'uuid4'
])

  .factory('Providers', function($q, _, toAggregatorSource) {

    function Providers() {
      this.providersPromises = [];
    }

    Providers.prototype = {
      add: function(providerPromise) {
        this.providersPromises.push($q.when(providerPromise));
      },

      /**
       * @param {Object} [options] - should follow the following template,
       *   all fields are optional.
       *   {
       *     query: 'keyword to search for',
       *     acceptedTypes: ['providerType1', 'providerType2'],
       *     acceptedIds: ['id1', 'id2',...],
       *     filterByType: {
       *       providerType1: { custom: 'object' },
       *       providerType2: { custom: 'object' }
       *     }
       *   }
       */
      remove: function(predicate) {
        var defer = $q.defer();
        var resolved = false;
        var numProviderPromiseNotResolved = this.providersPromises.length;
        var self = this;

        this.providersPromises.forEach(function(providerPromise) {
          providerPromise.then(function(provider) {
            if (resolved) return;

            numProviderPromiseNotResolved--;
            if (_.isArray(provider) && _.any(provider, predicate)) {
              var newProviders = _.reject(provider, predicate).map($q.when);

              for (var i = 0; i < self.providersPromises.length; i++) {
                if (self.providersPromises[i] === providerPromise) {
                  Array.prototype.splice.bind(self.providersPromises, i, 1).apply(null, newProviders);
                }
              }
            } else if (predicate(provider)) {
              resolved = true;
              defer.resolve(!!_.remove(self.providersPromises, function(_providerPromise_) {
                return _providerPromise_ === providerPromise;
              }));
            } else if (!numProviderPromiseNotResolved) {
              resolved = true;
              defer.resolve(false);
            }
          });
        });

        return defer.promise;
      },
      getAll: function(options) {
        options = options || {};

        return $q.all(this.providersPromises).then(function(providers) {
          return $q.all(_.flatten(providers)
            .filter(function(provider) {
              return !provider.types || !options.acceptedTypes || _.some(provider.types, function(type) {
                return _.contains(options.acceptedTypes, type);
              });
            })
            .filter(function(provider) {
              return !provider.id || !options.acceptedIds || _.contains(options.acceptedIds, provider.id);
            })
            .map(function(provider) {
              options.filterByType = options.filterByType || {};

              // Provider will be skipped if we cannot build its fetch context
              return provider.buildFetchContext(options).then(toAggregatorSource.bind(null, provider), angular.noop);
            })
          ).then(function(providers) {
            return providers.filter(Boolean);
          });
        });
      },
      getAllProviderDefinitions: function() {
        return $q.all(this.providersPromises).then(function(providers) {
          return _.map(_.flatten(providers), function(provider) {
            return {
              id: provider.id,
              name: provider.name
            };
          });
        });
      }
    };

    return Providers;
  })

  .factory('toAggregatorSource', function($q, _, ELEMENTS_PER_REQUEST) {
    return function(provider, context) {
      var fetcher = provider.fetch(context),
          mostRecentItem;

      function updateMostRecentItem(results) {
        // We store the most recent item if:
        //  - This is the first time we fetch data from this provider (poviders are supposed to return data sorted
        //    by date in descending order (most recent first) so subsequent fetches would return older elements,
        //    no need to update mostRecentItem).
        //  - The returned results contains a more recent item than what we have already
        //
        // Note that we blindly trust the provider with regards to the ordering of the resulted items
        if (results && results.length > 0) {
          var firstReturnedItem = results[0];

          if (!mostRecentItem || mostRecentItem.date < firstReturnedItem.date) {
            mostRecentItem = results[0];
          }
        }

        return results;
      }

      function normalizeResults(results) {
        return _.map(results, function(result) {
          if (!(result.date instanceof Date)) {
            result.date = new Date(result.date);
          }
          result.templateUrl = provider.templateUrl;

          return result;
        });
      }

      provider.loadNextItems = function() {
        return fetcher()
          .then(normalizeResults)
          .then(updateMostRecentItem)
          .then(function(results) {
            return { data: results, lastPage: results.length < ELEMENTS_PER_REQUEST };
          });
      };

      provider.loadRecentItems = function() {
        // Providers are not required to support fetching recent items, so we check this here
        // We also check that we have a mostRecentItem defined, meaning we already fetched the data at least once
        if (!mostRecentItem || !fetcher.loadRecentItems) {
          return $q.when([]);
        }

        return fetcher
          .loadRecentItems(mostRecentItem)
          .then(normalizeResults)
          .then(updateMostRecentItem);
      };

      return provider;
    };
  })

  .factory('sortByDateInDescendingOrder', function() {
    return function(a, b) {
      return b.date - a.date;
    };
  })

  .factory('newProvider', function(PageAggregatorService, toAggregatorSource, _, uuid4, sortByDateInDescendingOrder,
                                   ELEMENTS_PER_REQUEST, ELEMENTS_PER_PAGE) {
    return function(provider) {
      return {
        id: provider.id || uuid4.generate(),
        type: provider.type || (provider.types && provider.types[0]),
        types: provider.types || [provider.type],
        name: provider.name,
        fetch: function(context) {
          return new PageAggregatorService(provider.name, [toAggregatorSource(provider, context)], {
            results_per_page: ELEMENTS_PER_PAGE
          }).bidirectionalFetcher();
        },
        buildFetchContext: provider.buildFetchContext,
        templateUrl: provider.templateUrl
      };
    };
  })

  .factory('ByTypeElementGroupingTool', function() {
    function ByTypeElementGroupingTool(types, elements) {
      this.groupedElements = {};
      this.allElements = [];
      types.forEach(function(type) {
        this.initType(type);
      }, this);

      if (elements) {
        this.addAll(elements);
      }

      return this;
    }

    ByTypeElementGroupingTool.prototype.initType = function(type) {
      this.groupedElements[type] = [];
      this.allElements.push({name: type, elements: this.groupedElements[type]});
    };

    ByTypeElementGroupingTool.prototype.addAll = function addAll(elements) {
      elements.forEach(this.addElement.bind(this));
    };

    ByTypeElementGroupingTool.prototype.addElement = function addElement(element) {
      if (!this.groupedElements[element.type]) {
        this.initType(element.type);
      }
      this.groupedElements[element.type].push(element);
    };

    ByTypeElementGroupingTool.prototype.getGroupedElements = function getGroupedElements() {
      return this.allElements;
    };

    ByTypeElementGroupingTool.prototype.reset = function reset() {
      return this.allElements.forEach(function(elementGroup) {
        elementGroup.elements.length = 0;
      });
    };

    return ByTypeElementGroupingTool;
  })

  .factory('ByDateElementGroupingTool', function(moment, _) {

    function ByDateElementGroupingTool(elements) {
      this.todayElements = [];
      this.yesterdayElements = [];
      this.weeklyElements = [];
      this.monthlyElements = [];
      this.otherElements = [];
      this.allElements = [
        {name: 'Today', dateFormat: 'shortTime', elements: this.todayElements},
        {name: 'Yesterday', dateFormat: 'shortTime', elements: this.yesterdayElements},
        {name: 'This Week', dateFormat: 'EEE d', elements: this.weeklyElements},
        {name: 'This Month', dateFormat: 'EEE d', elements: this.monthlyElements},
        {name: 'Older than a month', dateFormat: 'mediumDate', elements: this.otherElements}
      ];

      if (elements) {
        this.addAll(elements);
      }

      return this;
    }

    ByDateElementGroupingTool.prototype.addAll = function(elements) {
      elements.forEach(this.addElement, this);
    };

    ByDateElementGroupingTool.prototype.addElement = function(element) {
      var currentMoment = moment().utc();
      var elementMoment = moment(element.date).utc();

      if (this._isToday(currentMoment, elementMoment)) {
        this.todayElements.push(element);
      } else if (this._isYesterday(currentMoment, elementMoment)) {
        this.yesterdayElements.push(element);
      } else if (this._isThisWeek(currentMoment, elementMoment)) {
        this.weeklyElements.push(element);
      } else if (this._isThisMonth(currentMoment, elementMoment)) {
        this.monthlyElements.push(element);
      } else {
        this.otherElements.push(element);
      }
    };

    ByDateElementGroupingTool.prototype.removeElement = function(element) {
      angular.forEach(this.allElements, function(group) {
        var index = _.findIndex(group.elements, element);

        if (index > -1) {
          group.elements.splice(index, 1);
        }
      });
    };

    ByDateElementGroupingTool.prototype.removeElements = function(elements) {
      elements.forEach(this.removeElement, this);
    };

    ByDateElementGroupingTool.prototype._isToday = function(currentMoment, targetMoment) {
      return currentMoment.clone().startOf('day').isBefore(targetMoment);
    };

    ByDateElementGroupingTool.prototype._isYesterday = function(currentMoment, targetMoment) {
      return currentMoment.clone().subtract(1, 'days').startOf('day').isBefore(targetMoment);
    };

    ByDateElementGroupingTool.prototype._isThisWeek = function(currentMoment, targetMoment) {
      return currentMoment.clone().startOf('week').isBefore(targetMoment);
    };

    ByDateElementGroupingTool.prototype._isThisMonth = function(currentMoment, targetMoment) {
      return currentMoment.clone().startOf('month').isBefore(targetMoment);
    };

    ByDateElementGroupingTool.prototype.getGroupedElements = function getGroupedElements() {
      return this.allElements;
    };

    ByDateElementGroupingTool.prototype.reset = function() {
      return this.allElements.forEach(function(elementGroup) {
        elementGroup.elements.length = 0;
      });
    };

    return ByDateElementGroupingTool;
  });
